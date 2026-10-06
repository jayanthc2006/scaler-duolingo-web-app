/**
 * Exercise audio: the browser's own text-to-speech (Web Speech API), so there are no audio files,
 * no third-party service and nothing for the backend to do. Everything here degrades to a no-op
 * when speech synthesis is missing or misbehaving, so audio can never get in the way of answering.
 *
 * Reliability notes (browser quirks this module deliberately handles):
 *  - voices load asynchronously (`voiceschanged`), so they are primed early and a click waits briefly for them;
 *  - Chromium drops a `speak()` issued in the same tick as `cancel()`, so a replacement waits a moment;
 *  - an engine can be left paused or stuck, so a start watchdog resumes it and retries once;
 *  - a playing utterance can be garbage-collected (losing its events) unless something references it.
 * A new click always REPLACES what is playing (never queues behind it).
 */
export const SPEECH_LANG = "es-ES";

const VOICE_WAIT_MS = 600; // longest a click waits for the voice list on first use
const RESTART_GAP_MS = 60; // pause between cancel() and the replacement speak()
const START_WATCHDOG_MS = 900; // if speech has not started by then, kick the engine and retry once

let token = 0; // bumped by every request and by cancelSpeech(): a stale, still-waiting request does nothing
let voicesSettled = false; // voices have been seen (or we stopped waiting): do not wait again
let active: SpeechSynthesisUtterance | null = null; // keeps the playing utterance referenced

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
}

/** Prefer a Spain-Spanish voice, then any Spanish one; otherwise let the browser pick from `lang`. */
export function pickSpanishVoice(voices: readonly Pick<SpeechSynthesisVoice, "lang">[]): (typeof voices)[number] | null {
  const lang = (v: Pick<SpeechSynthesisVoice, "lang">) => v.lang.toLowerCase().replace("_", "-");
  return voices.find((v) => lang(v) === "es-es") ?? voices.find((v) => lang(v).startsWith("es")) ?? null;
}

/** Resolves once voices exist, `voiceschanged` fires, or the wait times out (then the browser default is used). */
function loadVoices(synth: SpeechSynthesis): Promise<void> {
  return new Promise((resolve) => {
    if (voicesSettled || synth.getVoices().length > 0) {
      voicesSettled = true;
      resolve();
      return;
    }
    let timer = 0;
    const finish = () => {
      voicesSettled = true;
      synth.removeEventListener?.("voiceschanged", finish);
      window.clearTimeout(timer);
      resolve();
    };
    timer = window.setTimeout(finish, VOICE_WAIT_MS);
    synth.addEventListener?.("voiceschanged", finish);
  });
}

/** Starts loading voices early (a speaker button mounts, or the lesson loads) so the first click does not wait. */
export function primeSpeech(): void {
  if (!isSpeechSupported()) return;
  try {
    void loadVoices(window.speechSynthesis);
  } catch {
    /* priming is optional */
  }
}

export function cancelSpeech(): void {
  if (!isSpeechSupported()) return;
  token++; // anything still waiting to start is dropped
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* nothing to cancel */
  }
}

function speakNow(synth: SpeechSynthesis, spoken: string, mine: number, done: () => void, attempt: 1 | 2): void {
  if (mine !== token) return done(); // a newer click replaced this one while it waited
  try {
    const utterance = new SpeechSynthesisUtterance(spoken);
    const voice = pickSpanishVoice(synth.getVoices()) as SpeechSynthesisVoice | null;
    utterance.lang = voice?.lang ?? SPEECH_LANG;
    if (voice) utterance.voice = voice;
    utterance.rate = 0.9;

    let started = false;
    let abandoned = false; // the watchdog gave up on this utterance and is retrying
    utterance.onstart = () => {
      started = true;
    };
    utterance.onend = () => {
      if (active === utterance) active = null;
      if (!abandoned) done();
    };
    utterance.onerror = (event) => {
      if (active === utterance) active = null;
      if (abandoned) return;
      const reason = (event as SpeechSynthesisErrorEvent).error;
      // "interrupted" / "canceled": replaced or stopped on purpose. Anything else: one more try, then give up quietly.
      if (reason === "interrupted" || reason === "canceled" || attempt === 2 || mine !== token) return done();
      abandoned = true;
      window.setTimeout(() => speakNow(synth, spoken, mine, done, 2), RESTART_GAP_MS);
    };
    active = utterance;
    synth.speak(utterance);

    if (attempt === 1) {
      window.setTimeout(() => {
        if (mine !== token || started || synth.speaking) return;
        abandoned = true; // stuck queue or suspended engine: clear it, wake it, try once more
        try {
          synth.cancel();
          synth.resume();
        } catch {
          /* best effort */
        }
        window.setTimeout(() => speakNow(synth, spoken, mine, done, 2), RESTART_GAP_MS);
      }, START_WATCHDOG_MS);
    }
  } catch {
    done(); // speak() threw: report "not playing" so another click can try again
  }
}

function begin(synth: SpeechSynthesis, spoken: string, mine: number, done: () => void): void {
  if (mine !== token) return done();
  try {
    if (synth.paused) synth.resume();
    if (synth.speaking || synth.pending) {
      synth.cancel(); // replace what is playing / queued, never stack on top of it
      window.setTimeout(() => speakNow(synth, spoken, mine, done, 1), RESTART_GAP_MS);
    } else {
      speakNow(synth, spoken, mine, done, 1); // idle engine: start right away
    }
  } catch {
    done();
  }
}

/**
 * Speaks `text` in Spanish, replacing anything already playing. Returns false when audio is unavailable.
 * `onEnd` is called when this request finishes or is replaced/cancelled; it never throws into the caller.
 */
export function speakSpanish(text: string, onEnd?: () => void): boolean {
  const spoken = text.trim();
  if (!spoken || !isSpeechSupported()) return false;
  const mine = ++token;
  const done = () => {
    try {
      onEnd?.();
    } catch {
      /* a listener's problem must not break speech */
    }
  };
  try {
    const synth = window.speechSynthesis;
    if (voicesSettled || synth.getVoices().length > 0) {
      voicesSettled = true;
      begin(synth, spoken, mine, done);
    } else {
      void loadVoices(synth).then(() => begin(synth, spoken, mine, done)); // wait for voices instead of failing silently
    }
  } catch {
    return false;
  }
  return true;
}

if (typeof window !== "undefined") primeSpeech(); // the lesson bundle loads this module: have voices ready for the first click
