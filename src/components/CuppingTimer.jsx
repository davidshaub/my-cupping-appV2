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

// Two soft sine tones (a falling third), quick fade in and an exponential fade out — deliberately
// quiet (peak gain ~0.12) so it reads as a gentle cue, not an alert, during a quiet cupping room.
const playChime = (audioContext) => {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  [{ freq: 880, start: 0, duration: 0.5 }, { freq: 659.25, start: 0.22, duration: 0.6 }].forEach(({ freq, start, duration }) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(0.12, now + start + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
    osc.connect(gain).connect(audioContext.destination);
    osc.start(now + start);
    osc.stop(now + start + duration + 0.05);
  });
};

// state: { status: 'idle'|'running'|'paused', startedAt: number|null, accumulatedMs: number,
//          chimedCrust: boolean, chimedReady: boolean } — lifted to App so it survives navigating
// between screens mid-session, but deliberately never persisted or attached to the saved session:
// App resets it whenever a session starts or loads, so a reopened session always shows it fresh.
export default function CuppingTimer({ state, onChange, t }) {
  const audioRef = useRef(null);
  const holdTimerRef = useRef(null);
  const heldRef = useRef(false);
  const [isHolding, setIsHolding] = useState(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (state.status !== 'running') return undefined;
    const interval = setInterval(() => forceTick((n) => n + 1), 250);
    return () => clearInterval(interval);
  }, [state.status]);

  const elapsedMs = state.accumulatedMs + (state.status === 'running' && state.startedAt ? Date.now() - state.startedAt : 0);

  useEffect(() => {
    if (state.status !== 'running') return;
    const crustDue = elapsedMs >= CRUST_BREAK_MS && !state.chimedCrust;
    const readyDue = elapsedMs >= getReadyMinutes() * 60 * 1000 && !state.chimedReady;
    if (!crustDue && !readyDue) return;
    if (getChimesEnabled()) playChime(audioRef.current);
    onChange((current) => ({ ...current, chimedCrust: current.chimedCrust || crustDue, chimedReady: current.chimedReady || readyDue }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedMs, state.status, state.chimedCrust, state.chimedReady]);

  const ensureAudio = () => {
    if (!audioRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioRef.current = new Ctx();
    }
    if (audioRef.current?.state === 'suspended') audioRef.current.resume();
    return audioRef.current;
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
      <span className={`text-xl md:text-2xl font-black tabular-nums transition-opacity ${state.status === 'paused' ? 'opacity-40' : ''}`}>
        {display}
      </span>
      <span className={`cupping-timer-hold-bar ${isHolding ? 'is-charging' : ''}`} aria-hidden="true" />
    </div>
  );
}
