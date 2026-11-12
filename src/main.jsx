import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioLines, BookOpen, ScanLine, Upload, Save, Download, Contrast, Keyboard, ZoomIn, ZoomOut, RotateCw, RotateCcw, SlidersHorizontal, Play, Pause, Square, SkipBack, SkipForward, ShieldCheck, Check, X } from 'lucide-react';
import '@fontsource/atkinson-hyperlegible-next/400.css';
import '@fontsource/atkinson-hyperlegible-next/600.css';
import '@fontsource/atkinson-hyperlegible-next/700.css';
import useSpeech from './useSpeech';
import { defaultAdjustments, prepareImage, scanImage } from './ocr';
import { listNotices, saveNotice, deleteNotice, download } from './storage';
import Library from './Library';
import Evaluation from './Evaluation';
import fixtures from './fixtures.json';
import './style.css';

const pages = { reader: 'Notice Reader', library: 'Saved Notices', evaluation: 'OCR Evaluation & Accuracy' };
const emptyNotice = () => ({ id: null, title: '', category: 'Campus', text: '', original: null, image: null, raw: '', words: [], confidence: null, seconds: null });

function initialPreferences() {
  const defaults = { size: 1, contrast: false, rate: 1, pitch: 1, voice: '' };
  try {
    const saved = JSON.parse(localStorage.getItem('onepress-preferences') || '{}');
    return {
      size: Number.isFinite(saved.size) ? Math.min(1.4, Math.max(.9, saved.size)) : 1,
      contrast: saved.contrast === true,
      rate: [.5, .75, 1, 1.25, 1.5, 2].includes(saved.rate) ? saved.rate : 1,
      pitch: Number.isFinite(saved.pitch) ? Math.min(1.5, Math.max(.5, saved.pitch)) : 1,
      voice: typeof saved.voice === 'string' ? saved.voice : '',
    };
  } catch { return defaults; }
}

function App() {
  const [page, setPage] = useState(() => location.hash.slice(1) in pages ? location.hash.slice(1) : 'reader');
  const [notice, setNotice] = useState(emptyNotice);
  const [notices, setNotices] = useState([]);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [message, setMessage] = useState('Try a sample or upload a printed English notice to get started.');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [adjustments, setAdjustments] = useState(defaultAdjustments);
  const [adjustedPreview, setAdjustedPreview] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [imageURL, setImageURL] = useState('');
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [sample, setSample] = useState('clear');
  const [shortcuts, setShortcuts] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [reviewed, setReviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(null);
  const controller = useRef(null);
  const currentNotice = useRef(notice);
  currentNotice.current = notice;
  const textarea = useRef(null);
  const uploadInput = useRef(null);
  const dialog = useRef(null);
  const speech = useSpeech(notice.text, preferences.voice, preferences.rate, preferences.pitch);
  const reviewWords = notice.words.filter((word) => word.confidence < 70);
  const displayImage = adjustedPreview ?? notice.image;
  const adjustmentPending = !!adjustedPreview;

  function preference(key, value) {
    setPreferences((previous) => ({ ...previous, [key]: value }));
  }

  function navigate(next) {
    location.hash = next;
    setPage(next);
    speech.stop();
  }

  useEffect(() => {
    const change = () => {
      setPage(location.hash.slice(1) in pages ? location.hash.slice(1) : 'reader');
      speech.stop();
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', change);
    listNotices().then(setNotices).catch(() => setMessage('Saved notices could not be opened. Browser storage may be unavailable.'));
    return () => {
      window.removeEventListener('hashchange', change);
      controller.current?.abort();
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem('onepress-preferences', JSON.stringify(preferences)); } catch { /* Preferences remain usable for this session. */ }
    document.documentElement.style.fontSize = (Math.min(1.4, Math.max(.9, Number(preferences.size) || 1)) * 100) + '%';
    document.documentElement.dataset.contrast = preferences.contrast ? 'high' : 'normal';
  }, [preferences]);

  useEffect(() => {
    if (!displayImage) { setImageURL(''); return; }
    const url = URL.createObjectURL(displayImage);
    setImageURL(url);
    return () => URL.revokeObjectURL(url);
  }, [displayImage]);

  useEffect(() => {
    let stale = false;
    setAdjustedPreview(null);
    if (!notice.original || JSON.stringify(adjustments) === JSON.stringify(notice.adjustments ?? defaultAdjustments)) return;
    prepareImage(notice.original, adjustments).then((blob) => { if (!stale) setAdjustedPreview(blob); })
      .catch(() => { if (!stale) setMessage('Image adjustment failed. Try another image.'); });
    return () => { stale = true; };
  }, [notice.original, notice.adjustments, adjustments]);

  useEffect(() => {
    if (shortcuts || pendingDelete) dialog.current?.showModal();
    else dialog.current?.close();
  }, [shortcuts, pendingDelete]);

  useEffect(() => {
    function keys(event) {
      if (event.key === '/' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setShortcuts((value) => !value);
        return;
      }
      if (shortcuts || pendingDelete) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && page === 'reader') {
        event.preventDefault();
        void persist();
        return;
      }
      if (event.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      if (page !== 'reader' || busy) return;
      if (event.code === 'Space' && notice.text.trim()) { event.preventDefault(); speech.toggle(); }
      if (event.key === 'Escape') speech.stop('Reading stopped.');
    }
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  });

  useEffect(() => {
    const warn = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function confirmReplace() {
    return !dirty || window.confirm('Replace the current unsaved notice? Save it first if you want to keep your changes.');
  }

  function changeText(text) {
    speech.stop();
    setNotice((previous) => ({ ...previous, text }));
    setReviewed(false);
    setDirty(true);
  }

  async function recognize(original, title, reScan = false) {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    speech.stop();
    setBusy(true);
    setProgress(0);
    setMessage('OCR started. Preparing your image…');
    try {
      const image = await prepareImage(original, reScan ? adjustments : defaultAdjustments);
      if (abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (!reScan) {
        setNotice({ ...emptyNotice(), title, original, image });
        setAdjustments(defaultAdjustments);
        setZoom(1);
        setDirty(false);
      }
      const output = await scanImage(image, (status, value) => {
        if (abort.signal.aborted || controller.current !== abort) return;
        if (status === 'recognizing text') setProgress(Math.round(value * 100));
      }, abort.signal);
      if (abort.signal.aborted) return;
      setNotice((previous) => ({ ...previous, original, image, adjustments: reScan ? adjustments : defaultAdjustments, ...output, text: output.raw }));
      setAdjustedPreview(null);
      setReviewed(false);
      setDirty(true);
      setMessage(!output.raw || output.confidence < 35
        ? 'OCR finished, but the image was difficult to read. Try a sharper, well-lit photo with all text in frame. You can also edit the extracted text below.'
        : 'OCR finished. Check names, dates, times, and room numbers before listening.');
    } catch (error) {
      setMessage(error.name === 'AbortError' ? 'OCR cancelled. You can retry or choose another image.'
        : 'OCR failed. ' + (error.message || 'The image could not be recognized.') + ' Try a clearer JPG or PNG and check your connection.');
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  async function openSample(id = sample) {
    if (busy || !confirmReplace()) return;
    navigate('reader');
    const fixture = fixtures.find((item) => item.id === id);
    try {
      const response = await fetch(import.meta.env.BASE_URL + 'notices/' + id + '.png');
      if (!response.ok) throw new Error();
      await recognize(await response.blob(), fixture.title);
    } catch { setMessage('The sample could not load. Check your connection and try again.'); }
  }

  function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setMessage('Please choose a JPG or PNG image.'); return;
    }
    if (!confirmReplace()) return;
    void recognize(file, file.name.replace(/\.[^.]+$/, ''));
  }

  async function persist() {
    if (!notice.text.trim() || busy || saving) return;
    setSaving(true);
    const saved = { ...notice, id: notice.id || crypto.randomUUID(), title: notice.title.trim() || 'Untitled notice', updatedAt: Date.now(), reviewed };
    try {
      await saveNotice(saved);
      setNotice((previous) => ({ ...previous, id: saved.id }));
      setNotices((previous) => [...previous.filter((item) => item.id !== saved.id), saved]);
      setDirty(currentNotice.current !== notice);
      setMessage('Notice saved on this device.');
    } catch { setMessage('The notice could not be saved. Browser storage may be full or unavailable. Export the text to keep a copy.'); }
    finally { setSaving(false); }
  }

  function openSaved(saved) {
    if (busy || !confirmReplace()) return;
    speech.stop();
    setNotice({ ...emptyNotice(), ...saved });
    setAdjustments(saved.adjustments ?? defaultAdjustments);
    setAdjustedPreview(null);
    setReviewed(!!saved.reviewed);
    setDirty(false);
    setZoom(1);
    navigate('reader');
    setMessage('Saved notice opened. You can edit it and save your changes.');
  }

  async function removeSaved() {
    const item = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteNotice(item.id);
      setNotices((previous) => previous.filter((notice) => notice.id !== item.id));
      if (notice.id === item.id) { setNotice((previous) => ({ ...previous, id: null })); setDirty(true); }
      setCanUndo(item);
      setMessage('Notice deleted. You can undo this deletion.');
    } catch { setMessage('The notice could not be deleted. Try again.'); }
  }

  async function undoDelete() {
    try {
      await saveNotice(canUndo);
      setNotices((previous) => [...previous.filter((item) => item.id !== canUndo.id), canUndo]);
      setCanUndo(null);
      setMessage('Notice restored.');
    } catch { setMessage('The notice could not be restored. Try again.'); }
  }

  function newNotice() {
    if (busy || !confirmReplace()) return;
    speech.stop();
    setNotice(emptyNotice());
    setAdjustments(defaultAdjustments);
    setAdjustedPreview(null);
    setDirty(false);
    navigate('reader');
    setMessage('Choose a sample or upload your next notice.');
  }

  function focusWord(word) {
    textarea.current.focus();
    const index = notice.text.indexOf(word.text);
    if (index >= 0) textarea.current.setSelectionRange(index, index + word.text.length);
  }

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="app-header">
      <a className="brand" href="#reader"><span><AudioLines size={24} /></span>OnePress</a>
      <nav aria-label="Main navigation">{Object.entries(pages).map(([key, label]) => <a key={key} href={'#' + key} aria-current={page === key ? 'page' : undefined}>{label}</a>)}</nav>
      <div className="header-tools"><div className="size-controls" aria-label="Text size"><button aria-label="Decrease text size" disabled={preferences.size <= .9} onClick={() => preference('size', Math.max(.9, preferences.size - .1))}>A−</button><button aria-label="Increase text size" disabled={preferences.size >= 1.4} onClick={() => preference('size', Math.min(1.4, preferences.size + .1))}>A+</button></div>
        <button aria-label="Toggle high contrast" aria-pressed={preferences.contrast} onClick={() => preference('contrast', !preferences.contrast)}><Contrast size={18} /><span>Contrast</span></button>
        <button aria-label="Keyboard shortcuts" onClick={() => setShortcuts(true)}><Keyboard size={18} /><span>Shortcuts</span></button></div>
    </header>
    <main id="main">
      <div className="global-status" role="status" aria-live="polite">{message}{canUndo && <button onClick={undoDelete}>Undo delete</button>}</div>
      {page === 'reader' && <>
        <section className="workflow">
          <div className="button-row"><button className="primary" onClick={() => uploadInput.current.click()} disabled={busy}><Upload size={20} />Upload Notice Photo</button><input type="file" accept="image/png,image/jpeg" ref={uploadInput} onChange={upload} hidden />
            <button onClick={() => openSample()} disabled={busy}><ScanLine size={19} />Try a sample notice</button>
            <label className="sample-select"><span className="sr-only">Sample condition</span><select value={sample} onChange={(event) => setSample(event.target.value)} disabled={busy}>{fixtures.map((fixture) => <option value={fixture.id} key={fixture.id}>{fixture.condition} · {fixture.title}</option>)}</select></label>
            <button disabled={!notice.original || busy} onClick={() => { if (!notice.text || window.confirm('Re-scan this image? The new OCR output will replace the current text, including any corrections.')) recognize(notice.original, notice.title, true); }}><RotateCcw size={18} />Re-scan image</button>
            <button disabled={!notice.text.trim() || busy} onClick={() => download(notice.text, (notice.title || 'notice').replace(/[^a-z0-9 -]/gi, '').slice(0,80) + '.txt')}><Download size={18} />Export text</button>
            <button className="save-button" disabled={!notice.text.trim() || busy || saving} onClick={persist}><Save size={19} />{saving ? 'Saving…' : 'Save Notice'}</button>
          </div>
          <div className="workflow-caption"><ShieldCheck size={16} />JPG or PNG · Image processing stays in your browser · {dirty ? 'Unsaved changes' : 'Ready'}</div>
          {busy && <div className="scan-progress"><progress value={progress} max="100" aria-label="OCR progress" /><span>{progress ? progress + '% recognized' : 'Loading OCR engine…'}</span><button onClick={() => controller.current?.abort()}>Cancel scan</button></div>}
        </section>
        <div className="reader-grid page">
          <section className="document-column" aria-label="Original document and OCR">
            <div className="card">
              <div className="card-top"><h1 className="panel-title"><ScanLine size={21} />Original Document & OCR</h1><div className="icon-buttons"><button aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - .25))}><ZoomOut size={19} /></button><button aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + .25))}><ZoomIn size={19} /></button></div></div>
              <div className="document-stage">
                {imageURL ? <div className="document-sheet" style={{ width: zoom * 100 + '%' }}><img src={imageURL} alt="Notice image to compare against the editable text" onLoad={(event) => setImageSize({ width: event.target.naturalWidth, height: event.target.naturalHeight })} />
                  {!adjustmentPending && reviewWords.map((word, index) => <button key={index} className="word-box" aria-label={'Review original OCR word ' + word.text + ', confidence ' + Math.round(word.confidence) + '%'} title={word.text + ' · ' + Math.round(word.confidence) + '% confidence'} style={{ left: word.bbox.x0 / imageSize.width * 100 + '%', top: word.bbox.y0 / imageSize.height * 100 + '%', width: (word.bbox.x1 - word.bbox.x0) / imageSize.width * 100 + '%', height: (word.bbox.y1 - word.bbox.y0) / imageSize.height * 100 + '%' }} onClick={() => focusWord(word)} />)}
                </div> : <div className="image-empty"><ScanLine size={48} /><h2>Make a notice easier to read</h2><p>Try a sample or upload a photo.<br />Your original image will appear here.</p><img src={import.meta.env.BASE_URL + 'notices/clear.png'} alt="Preview of the fictional library orientation sample" /></div>}
              </div>
              <p className="small muted">{notice.image ? 'Amber outlines mark low-confidence words from the original OCR. Select a region to review its text.' : 'Fictional campus sample · English printed text'}</p>
              {notice.confidence !== null && <div className="ocr-metrics"><span><strong>{Math.round(notice.confidence)}%</strong> OCR confidence</span><span><strong>{notice.seconds?.toFixed(1)}s</strong> extraction time</span></div>}
            </div>
            <details className="card adjustments"><summary><SlidersHorizontal size={19} />Image adjustments</summary><p>Preview adjustments, then select Re-scan image to extract text again.</p><div className="button-row"><button disabled={!notice.original || busy} onClick={() => setAdjustments((value) => ({ ...value, rotation: (value.rotation + 90) % 360 }))}><RotateCw size={18} />Rotate {adjustments.rotation}°</button><button disabled={!notice.original || busy} onClick={() => { setAdjustments(defaultAdjustments); setZoom(1); }}>Reset adjustments</button></div>
              <label>Contrast <output>{adjustments.contrast.toFixed(1)}×</output><input type="range" min=".5" max="2.5" step=".1" value={adjustments.contrast} disabled={!notice.original || busy} onChange={(event) => setAdjustments((value) => ({ ...value, contrast: Number(event.target.value) }))} /></label>
              <label>Crop margins <output>{adjustments.crop}% per edge</output><input type="range" min="0" max="20" step="1" value={adjustments.crop} disabled={!notice.original || busy} onChange={(event) => setAdjustments((value) => ({ ...value, crop: Number(event.target.value) }))} /></label>
            </details>
            <div className="card review"><div className="card-top"><h2>Review the extraction</h2><span className="tag">{reviewWords.length} flagged</span></div><p>Check dates, times, room numbers, and names against the image.</p>
              {reviewWords.length > 0 && <div className="review-words">{reviewWords.slice(0,40).map((word, index) => <button key={index} onClick={() => focusWord(word)}>{word.text} <span>{Math.round(word.confidence)}%</span></button>)}</div>}
              <label className="check-label"><input type="checkbox" checked={reviewed} onChange={(event) => { setReviewed(event.target.checked); setDirty(true); }} /><span>I checked the important details</span></label>
              {reviewed && <p className="success"><Check size={16} />Marked as reviewed by you</p>}
            </div>
          </section>
          <section className="narration-column card" aria-labelledby="narration-title">
            <div className="card-top"><h2 id="narration-title"><AudioLines size={22} />Narration Assistant</h2><span className="tag">{speech.state === 'playing' ? 'Reading aloud' : speech.state === 'paused' ? 'Paused' : 'Ready'}</span></div>
            <div className="voice-settings"><label>Choose narration voice<select value={preferences.voice} onChange={(event) => preference('voice', event.target.value)}><option value="">Device default · English</option>{speech.voices.map((voice) => <option value={voice.voiceURI} key={voice.voiceURI}>{voice.name} ({voice.lang}){voice.localService ? ' · On device' : ''}</option>)}</select></label>
              <p className="small muted">Voices depend on your browser and device. Changing voice, speed, or pitch restarts reading from the beginning.</p></div>
            <div className="playback">
              <div className="transport"><button aria-label="Previous sentence" disabled={busy || !speech.sentences.length || speech.position === 0} onClick={() => speech.skip(-1)}><SkipBack size={22} /></button>
                <button className="play-button" disabled={busy || !notice.text.trim() || !speech.supported} onClick={speech.toggle}>{speech.state === 'playing' ? <Pause size={25} /> : <Play size={25} />}<span>{speech.state === 'playing' ? 'Pause' : speech.state === 'paused' ? 'Resume' : 'Read aloud'}</span></button>
                <button aria-label="Next sentence" disabled={busy || !speech.sentences.length || speech.position >= speech.sentences.length - 1} onClick={() => speech.skip(1)}><SkipForward size={22} /></button>
                <button disabled={speech.state === 'idle'} onClick={() => speech.stop('Reading stopped.')}><Square size={17} />Stop</button></div>
              <div className="playback-settings"><label>Speed<select value={preferences.rate} onChange={(event) => preference('rate', Number(event.target.value))}>{[.5,.75,1,1.25,1.5,2].map((rate) => <option key={rate} value={rate}>{rate}×{rate === 1 ? ' · Normal' : ''}</option>)}</select></label><label>Pitch <output>{preferences.pitch.toFixed(1)}</output><input type="range" min=".5" max="1.5" step=".1" value={preferences.pitch} onChange={(event) => preference('pitch', Number(event.target.value))} /></label></div>
              <p className="small" role="status">{!speech.supported ? 'Speech is unavailable in this browser. You can still edit and export text.' : speech.message || 'Ready when you are.'}</p>
            </div>
            <div className="notice-fields"><label>Notice title<input value={notice.title} placeholder="Give this notice a name" disabled={busy} onChange={(event) => { setNotice((previous) => ({ ...previous, title: event.target.value })); setDirty(true); }} /></label><label>Category<select value={notice.category} onChange={(event) => { setNotice((previous) => ({ ...previous, category: event.target.value })); setDirty(true); }}>{['Campus','Community','Personal','Other'].map((category) => <option key={category}>{category}</option>)}</select></label></div>
            <label className="editor-label" htmlFor="transcript">Extracted text <span>Edit any mistakes before listening</span></label>
            <textarea ref={textarea} id="transcript" value={notice.text} readOnly={busy} onChange={(event) => changeText(event.target.value)} placeholder="Your extracted text will appear here. You can also type or paste a notice." />
            {speech.sentences.length > 0 && <div className="reading-view"><div className="card-top"><h3>Follow along</h3><span className="small">Sentence {speech.position + 1} of {speech.sentences.length}</span></div><p className="small muted">Select a sentence to listen from there.</p>
              <div className="sentences">{speech.sentences.map((sentence, index) => <button key={index} disabled={busy || !speech.supported} className={speech.state !== 'idle' && speech.position === index ? 'current-sentence' : ''} aria-label={'Read sentence ' + (index + 1) + '. ' + sentence} onClick={() => speech.play(index)}>{sentence}</button>)}</div></div>}
          </section>
        </div>
      </>}
      {page === 'library' && <Library notices={notices} openNotice={openSaved} removeNotice={setPendingDelete} newNotice={newNotice} />}
      {page === 'evaluation' && <Evaluation openSample={openSample} />}
    </main>
    <footer><span><ShieldCheck size={17} />Browser-based OCR · Local notice storage</span><span>Tab to navigate · Ctrl / ⌘ + / for shortcuts</span></footer>
    <dialog ref={dialog} onCancel={() => { setShortcuts(false); setPendingDelete(null); }}>
      <div className="card-top"><h2>{pendingDelete ? 'Delete this notice?' : 'Keyboard shortcuts'}</h2><button aria-label="Close dialog" onClick={() => { setShortcuts(false); setPendingDelete(null); }}><X size={20} /></button></div>
      {pendingDelete ? <><p>“{pendingDelete.title}” will be removed from your saved notices on this device.</p><div className="button-row"><button onClick={() => setPendingDelete(null)}>Keep notice</button><button className="danger" onClick={removeSaved}>Delete notice</button></div></> :
        <dl className="shortcut-list"><dt>Tab / Shift + Tab</dt><dd>Move between controls</dd><dt>Enter / Space</dt><dd>Activate a focused button</dd><dt>Space outside a control</dt><dd>Play or pause narration in the reader</dd><dt>Escape outside a control</dt><dd>Stop narration</dd><dt>Ctrl / ⌘ + S</dt><dd>Save the current notice</dd><dt>Ctrl / ⌘ + /</dt><dd>Open or close this dialog</dd></dl>}
    </dialog>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
