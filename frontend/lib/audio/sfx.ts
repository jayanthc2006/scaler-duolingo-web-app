/**
 * Lesson feedback sound effects: three tiny cues synthesised with the Web Audio API, so there are no audio files
 * and nothing copied. Everything is best-effort: if audio is unavailable, blocked or throws, the call is a silent
 * no-op and can never affect answering or lesson progress. Gated by the one Sound preference (Settings → Sound).
 */
import { isSoundEnabled } from "@/lib/audio/soundPreference";

export type Sfx = "correct" | "wrong" | "complete";

interface Note {
  freq: number;
  /** seconds after the cue starts */
  at: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  /** optional glide target */
  to?: number;
}

const CUES: Record<Sfx, Note[]> = {
  // a bright two-note rise
  correct: [
    { freq: 659.25, at: 0, dur: 0.14, type: "sine", gain: 0.16 },
    { freq: 987.77, at: 0.1, dur: 0.24, type: "sine", gain: 0.16 },
  ],
  // a short, soft downward "bonk"
  wrong: [{ freq: 233, at: 0, dur: 0.24, type: "triangle", gain: 0.2, to: 165 }],
  // a quick four-note major arpeggio
  complete: [
    { freq: 523.25, at: 0, dur: 0.16, type: "sine", gain: 0.15 },
    { freq: 659.25, at: 0.12, dur: 0.16, type: "sine", gain: 0.15 },
    { freq: 783.99, at: 0.24, dur: 0.16, type: "sine", gain: 0.15 },
    { freq: 1046.5, at: 0.36, dur: 0.4, type: "sine", gain: 0.16 },
  ],
};

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor(); // one shared context, created on first use (after the learner's first interaction)
  return context;
}

/** Plays one cue. Never throws and never rejects. */
export function playSfx(cue: Sfx): void {
  try {
    if (typeof window === "undefined" || !isSoundEnabled()) return;
    const ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {}); // autoplay policy: resumes on a user gesture
    const start = ctx.currentTime;
    for (const note of CUES[cue]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type;
      osc.frequency.setValueAtTime(note.freq, start + note.at);
      if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, start + note.at + note.dur);
      gain.gain.setValueAtTime(0.0001, start + note.at);
      gain.gain.exponentialRampToValueAtTime(note.gain, start + note.at + 0.02); // soft attack: no click
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.dur); // smooth decay
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + note.at);
      osc.stop(start + note.at + note.dur + 0.02);
    }
  } catch {
    /* audio is a nicety: ignore any failure */
  }
}
