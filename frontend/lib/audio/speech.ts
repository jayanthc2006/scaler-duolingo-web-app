/**
 * Exercise audio: the browser's own text-to-speech (Web Speech API), so there are no audio files,
 * no third-party service and nothing for the backend to do. Everything here degrades to a no-op
 * when speech synthesis is missing, so audio can never get in the way of answering.
 */
export const SPEECH_LANG = "es-ES";

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
}

/** Prefer a Spain-Spanish voice, then any Spanish one; otherwise let the browser pick from `lang`. */
export function pickSpanishVoice(voices: readonly Pick<SpeechSynthesisVoice, "lang">[]): (typeof voices)[number] | null {
  const lang = (v: Pick<SpeechSynthesisVoice, "lang">) => v.lang.toLowerCase().replace("_", "-");
  return voices.find((v) => lang(v) === "es-es") ?? voices.find((v) => lang(v).startsWith("es")) ?? null;
}

export function cancelSpeech(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}

/** Speaks `text` in Spanish, replacing anything already playing. Returns false when audio is unavailable. */
export function speakSpanish(text: string, onEnd?: () => void): boolean {
  const spoken = text.trim();
  if (!spoken || !isSpeechSupported()) return false;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(spoken);
    const voice = pickSpanishVoice(synth.getVoices()) as SpeechSynthesisVoice | null;
    utterance.lang = voice?.lang ?? SPEECH_LANG;
    if (voice) utterance.voice = voice;
    utterance.rate = 0.9;
    // `cancel()` fires onerror("interrupted"/"canceled") for the previous utterance, so both end the "playing" state
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();
    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}
