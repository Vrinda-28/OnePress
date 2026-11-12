import React, { useEffect, useRef, useState } from 'react';
import { Download, FlaskConical, Play, ScanLine } from 'lucide-react';
import fixtures from './fixtures.json';
import recorded from './ocr-results.json';
import { scanImage } from './ocr';
import { download } from './storage';

function compare(raw, fixture) {
  return Object.fromEntries(['date', 'time', 'room'].map((field) => {
    const line = raw.split('\n').find((text) => text.toLowerCase().startsWith(field + ':'));
    const actual = line?.slice(field.length + 1).trim() || null;
    return [field, { actual, correct: actual?.replace(/\s+/g, ' ').toLowerCase() === fixture[field].toLowerCase() }];
  }));
}

export default function Evaluation({ openSample }) {
  const [results, setResults] = useState(recorded);
  const [selected, setSelected] = useState('clear');
  const [status, setStatus] = useState('Recorded technical test · 12 November 2026 · Tesseract.js 7 · English model');
  const [running, setRunning] = useState(false);
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  const fixture = fixtures.find((item) => item.id === selected);
  const result = results[selected];
  const correct = Object.values(results).flatMap((item) => Object.values(item.fields)).filter((item) => item.correct).length;

  async function runTests() {
    if (controller.current) return;
    controller.current = new AbortController();
    setRunning(true);
    const next = {};
    try {
      for (const item of fixtures) {
        setStatus('Running OCR on the ' + item.condition.toLowerCase() + ' notice…');
        const response = await fetch(import.meta.env.BASE_URL + 'notices/' + item.id + '.png');
        if (!response.ok) throw new Error('A sample image could not be loaded.');
        const output = await scanImage(await response.blob(), () => {}, controller.current.signal);
        next[item.id] = { ...output, fields: compare(output.raw, item) };
      }
      setResults(next);
      setStatus('Technical test completed in this browser. All results below are from the latest run.');
    } catch (error) {
      setStatus(error.name === 'AbortError' ? 'Test cancelled. Previous complete results are shown.' : 'Test failed. ' + error.message);
    } finally {
      controller.current = null;
      setRunning(false);
    }
  }

  function exportCSV() {
    const rows = [['notice', 'condition', 'field', 'expected', 'actual', 'correct']];
    for (const item of fixtures) {
      for (const [field, value] of Object.entries(results[item.id].fields)) {
        rows.push([item.title, item.condition, field, item[field], value.actual ?? '', value.correct]);
      }
    }
    download(rows.map((row) => row.map((cell) => '"' + String(cell).replaceAll('"', '""') + '"').join(',')).join('\r\n'),
      'onepress-technical-test.csv', 'text/csv');
  }

  return <div className="page evaluation">
    <div className="page-heading"><div><span className="eyebrow"><FlaskConical size={17} />Technical test</span><h1>OCR evaluation & accuracy</h1><p>How I tested it. Three fictional campus notices, checked before manual correction.</p></div>
      <div className="button-row"><button onClick={exportCSV}><Download size={18} />Export results CSV</button>
        <button className="primary" onClick={runTests} disabled={running}><Play size={18} />Run technical test</button>
        {running && <button onClick={() => controller.current?.abort()}>Cancel test</button>}</div></div>
    <div role="status" className="status-strip">{status}</div>
    <div className="metrics">
      <article className="card"><span>Fields matched</span><strong>{correct}/9</strong><p>Date, time, and room across three images.</p></article>
      <article className="card"><span>Clear notice</span><strong>{Object.values(results.clear.fields).filter((field) => field.correct).length}/3</strong><p>Unmodified printed English text.</p></article>
      <article className="card"><span>Blurry notice</span><strong>{Object.values(results.blurry.fields).filter((field) => field.correct).length}/3</strong><p>Gaussian blur applied to the source.</p></article>
      <article className="card"><span>Low-contrast notice</span><strong>{Object.values(results['low-contrast'].fields).filter((field) => field.correct).length}/3</strong><p>Pale text against a similar background.</p></article>
    </div>
    <section className="card">
      <h2>Sample comparison & error analysis</h2>
      <div className="tabs" aria-label="Choose test image">{fixtures.map((item) =>
        <button aria-pressed={selected === item.id} onClick={() => setSelected(item.id)} key={item.id}>{item.condition}</button>)}</div>
      <div className="comparison">
        <div><h3>Source image</h3><img src={import.meta.env.BASE_URL + 'notices/' + selected + '.png'} alt={fixture.title + ', ' + fixture.condition + ' test image'} />
          <button onClick={() => openSample(selected)}><ScanLine size={18} />Try in reader</button></div>
        <div><h3>Raw OCR output</h3><pre>{result.raw || 'No text detected.'}</pre>
          <div className="table-scroll"><table><caption>Exact field match after normalizing spacing and letter case</caption><thead><tr><th>Field</th><th>Expected</th><th>OCR result</th></tr></thead><tbody>
            {Object.entries(result.fields).map(([field, value]) => <tr key={field}><th>{field}</th><td>{fixture[field]}</td><td className={value.correct ? 'success' : 'error'}>{value.correct ? 'Correct' : value.actual ?? 'Missed'}</td></tr>)}
          </tbody></table></div></div>
      </div>
    </section>
    <div className="callout warning"><strong>Observed failure</strong><p>The original blurry-image run missed the date, time, and room. Inspecting and correcting critical fields remains part of the reading flow.</p></div>
    <div className="comparison">
      <section className="card"><h2>What these results measure</h2><p>This small technical test measures exact extraction of nine fields. It uses synthetic images and does not measure usability or accessibility conformance. OCR confidence is the engine’s estimate, and accuracy is measured against known text.</p></section>
      <section className="card"><h2>Getting a clearer scan</h2><ul><li>Photograph the page straight on in even light.</li><li>Keep dates and room numbers sharp and fully in frame.</li><li>Use rotation, crop, and contrast controls, then re-scan.</li><li>Check reading order on multi-column documents.</li></ul></section>
    </div>
  </div>;
}
