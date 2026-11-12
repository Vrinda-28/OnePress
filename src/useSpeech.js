import { useEffect, useMemo, useRef, useState } from 'react';

export function splitSentences(text) {
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)]
      .map(({ segment }) => segment).filter((part) => part.trim());
  }
  return text.match(/[^.!?\n]+[.!?\n]*/g) ?? [];
}

export default function useSpeech(text, voiceId, rate, pitch) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && Boolean(window.speechSynthesis);
  const [voices, setVoices] = useState([]);
  const [state, setState] = useState('idle');
  const [position, setPosition] = useState(0);
  const [message, setMessage] = useState('');
  const sentences = useMemo(() => splitSentences(text), [text]);
  const generation = useRef(0);
  const utterance = useRef(null);

  function stop(message = '') {
    generation.current++;
    utterance.current = null;
    if (supported) window.speechSynthesis.cancel();
    setState('idle');
    setMessage(message);
  }

  function play(start = 0) {
    if (!supported || !sentences.length) return;
    stop();
    const run = generation.current;
    const voice = voices.find((item) => item.voiceURI === voiceId);
    function speak(index) {
      if (run !== generation.current) return;
      if (index >= sentences.length) {
        setState('idle');
        setPosition(0);
        setMessage('Finished reading.');
        return;
      }
      const current = new SpeechSynthesisUtterance(sentences[index]);
      current.lang = voice?.lang ?? 'en-US';
      if (voice) current.voice = voice;
      current.rate = rate;
      current.pitch = pitch;
      utterance.current = current;
      setPosition(index);
      setState('playing');
      setMessage('Reading aloud.');
      current.onend = () => speak(index + 1);
      current.onerror = (event) => {
        if (run !== generation.current || event.error === 'interrupted' || event.error === 'canceled') return;
        stop('Speech could not play. Choose another voice and try again.');
      };
      try {
        window.speechSynthesis.speak(current);
      } catch {
        stop('Speech could not start. Try another voice or browser.');
      }
    }
    speak(Math.max(0, Math.min(start, sentences.length - 1)));
  }

  function toggle() {
    if (state === 'playing') {
      window.speechSynthesis.pause();
      setState('paused');
      setMessage('Reading paused.');
    } else if (state === 'paused') {
      window.speechSynthesis.resume();
      setState('playing');
      setMessage('Reading resumed.');
    } else play(position);
  }

  useEffect(() => {
    if (!supported) return;
    const refresh = () => setVoices(window.speechSynthesis.getVoices().filter((voice) => /^en(?:[-_]|$)/i.test(voice.lang)));
    refresh();
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    return () => {
      generation.current++;
      window.speechSynthesis.cancel();
      window.speechSynthesis.removeEventListener('voiceschanged', refresh);
    };
  }, [supported]);

  useEffect(() => {
    stop();
    setPosition(0);
  }, [text, voiceId, rate, pitch]);

  return { supported, voices, state, position, sentences, message, play, stop, toggle,
    skip: (direction) => play(position + direction) };
}
