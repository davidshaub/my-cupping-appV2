import React, { useEffect, useRef, useState } from 'react';
import { getChimesEnabled, getReadyMinutes } from '../lib/collaboration';

const HOLD_MS = 650;
const CRUST_BREAK_MS = 4 * 60 * 1000;

const formatElapsed = (ms) => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};

// iOS tags raw Web Audio API output (oscillators etc.) as the "ambient" sound category, which is
// silenced by the physical ring/silent switch regardless of volume - that's why an earlier version
// of this chime could show iOS's "now playing audio" glyph with no audible sound. A real <audio>
// element gets the "playback" category instead, which ignores that switch - so the chime is
// rendered to an actual short WAV clip and played through one, rather than scheduled live.
const CHIME_SAMPLE_RATE = 22050;
const CHIME_NOTES = [{ freq: 880, start: 0, duration: 0.5 }, { freq: 659.25, start: 0.22, duration: 0.6 }];

const chimeEnvelope = (t, duration) => {
  const attack = 0.04, peak = 0.12, floor = 0.0001;
  if (t < 0 || t > duration) return 0;
  if (t < attack) return (t / attack) * peak;
  const progress = (t - attack) / (duration - attack);
  return peak * (floor / peak) ** progress;
};

const encodeWavDataUrl = (samples, sampleRate) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, str) => { for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1, offset += 2) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  return `data:audio/wav;base64,${btoa(binary)}`;
};

let cachedChimeDataUrl = null;
const getChimeDataUrl = () => {
  if (cachedChimeDataUrl) return cachedChimeDataUrl;
  const totalDuration = Math.max(...CHIME_NOTES.map((n) => n.start + n.duration)) + 0.05;
  const length = Math.ceil(CHIME_SAMPLE_RATE * totalDuration);
  const samples = new Float32Array(length);
  CHIME_NOTES.forEach(({ freq, start, duration }) => {
    const startSample = Math.floor(start * CHIME_SAMPLE_RATE);
    for (let i = 0; startSample + i < length; i += 1) {
      const t = i / CHIME_SAMPLE_RATE;
      if (t > duration) break;
      samples[startSample + i] += chimeEnvelope(t, duration) * Math.sin(2 * Math.PI * freq * t);
    }
  });
  cachedChimeDataUrl = encodeWavDataUrl(samples, CHIME_SAMPLE_RATE);
  return cachedChimeDataUrl;
};

const playChime = (audio) => {
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
};

// state: { status: 'idle'|'running'|'paused', startedAt: number|null, accumulatedMs: number,
//          chimedCrust: boolean, chimedReady: boolean } — lifted to App so it survives navigating
// between screens mid-session, but deliberately never persisted or attached to the saved session:
// App resets it whenever a session starts or loads, so a reopened session always shows it fresh.
export default function CuppingTimer({ state, onChange, audioRef, t }) {
  const holdTimerRef = useRef(null);
  const heldRef = useRef(false);
  const [isHolding, setIsHolding] = useState(false);
  const [, forceTick] = useState(0);
  const [justChimed, setJustChimed] = useState(false);

  useEffect(() => {
    if (state.status !== 'running') return undefined;
    const interval = setInterval(() => forceTick((n) => n + 1), 250);
    return () => clearInterval(interval);
  }, [state.status]);

  // A locked screen or a backgrounded tab suspends the interval above - on a long wait (ready-to-
  // taste is typically ~18min, vs. ~4min to crust break) that's common enough that the chime can be
  // badly delayed, or missed if nothing ever re-renders to notice it's due. Forcing a recheck the
  // instant the page is foregrounded again catches it up immediately instead of waiting on whatever
  // cadence the browser resumes the interval at.
  useEffect(() => {
    const recheck = () => { if (document.visibilityState === 'visible') forceTick((n) => n + 1); };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    window.addEventListener('pageshow', recheck);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
      window.removeEventListener('pageshow', recheck);
    };
  }, []);

  const elapsedMs = state.accumulatedMs + (state.status === 'running' && state.startedAt ? Date.now() - state.startedAt : 0);

  useEffect(() => {
    if (state.status !== 'running') return;
    const crustDue = elapsedMs >= CRUST_BREAK_MS && !state.chimedCrust;
    const readyDue = elapsedMs >= getReadyMinutes() * 60 * 1000 && !state.chimedReady;
    if (!crustDue && !readyDue) return;
    if (getChimesEnabled()) playChime(audioRef.current);
    setJustChimed(true);
    onChange((current) => ({ ...current, chimedCrust: current.chimedCrust || crustDue, chimedReady: current.chimedReady || readyDue }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedMs, state.status, state.chimedCrust, state.chimedReady]);

  // Backup visual cue in case the chime is missed or delayed (e.g. a catch-up firing right as the
  // screen unlocks, before audio focus has settled) - a brief pulse on the elapsed time itself.
  useEffect(() => {
    if (!justChimed) return undefined;
    const timeout = setTimeout(() => setJustChimed(false), 2600);
    return () => clearTimeout(timeout);
  }, [justChimed]);

  // iOS only requires the very first play() on a given <audio> element to originate from a real
  // tap; once that's happened, later unprompted play() calls (when a chime is actually due, minutes
  // later) are allowed. So every tap here "primes" the element with an immediate play+pause - audible
  // for a few milliseconds at most, which in practice isn't perceptible, rather than ever playing the
  // real chime on tap.
  const ensureAudio = () => {
    if (!audioRef.current) {
      const audio = new Audio(getChimeDataUrl());
      audio.preload = 'auto';
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    const primed = audio.play();
    if (primed?.then) primed.then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {});
    return audio;
  };

  const toggle = () => {
    ensureAudio();
    if (state.status === 'running') {
      onChange((current) => ({
        ...current,
        status: 'paused',
        accumulatedMs: current.accumulatedMs + (current.startedAt ? Date.now() - current.startedAt : 0),
        startedAt: null
      }));
    } else {
      onChange((current) => ({ ...current, status: 'running', startedAt: Date.now() }));
    }
  };

  const clear = () => onChange({ status: 'idle', startedAt: null, accumulatedMs: 0, chimedCrust: false, chimedReady: false });

  const endHold = () => {
    clearTimeout(holdTimerRef.current);
    setIsHolding(false);
  };

  const handlePointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    heldRef.current = false;
    setIsHolding(true);
    holdTimerRef.current = setTimeout(() => {
      heldRef.current = true;
      setIsHolding(false);
      clear();
    }, HOLD_MS);
  };
  const handlePointerUp = () => {
    const held = heldRef.current;
    endHold();
    if (!held) toggle();
  };
  const handlePointerCancel = () => endHold();

  const display = formatElapsed(elapsedMs);
  const label = elapsedMs === 0 && state.status === 'idle' ? t('timer') : `${t('timer')} ${display}`;

  // Structurally identical to the Live Score block right next to it (plain div, text-right,
  // leading-none, block-level children) rather than a flex column — two different CSS formatting
  // contexts producing the same visual "right-aligned stack" are exactly the kind of thing browsers
  // compute vertical metrics for slightly differently. Making the markup match removes that variable
  // instead of chasing it with another alignment tweak.
  return (
    <div
      role="button"
      tabIndex={0}
      className="text-right leading-none select-none cursor-pointer"
      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerCancel}
      onPointerCancel={handlePointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      }}
      aria-label={label}
      title={t('timerHoldToClear')}
    >
      <span className="text-stone-300 text-[9px] font-black uppercase tracking-[0.2em] block mb-1">{t('timer')}</span>
      <span className={`text-xl md:text-2xl font-black tabular-nums transition-opacity ${state.status === 'paused' ? 'opacity-40' : ''} ${justChimed ? 'cupping-timer-chimed' : ''}`}>
        {display}
      </span>
      <span className={`cupping-timer-hold-bar ${isHolding ? 'is-charging' : ''}`} aria-hidden="true" />
    </div>
  );
}
