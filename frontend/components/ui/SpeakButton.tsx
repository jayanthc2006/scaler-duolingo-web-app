"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import { cancelSpeech, isSpeechSupported, primeSpeech, speakSpanish } from "@/lib/audio/speech";

const subscribeNothing = () => () => {};

interface Props {
  text: string;
  /** Visible caption next to the icon (omit for a compact round button). */
  label?: string;
}

/** Plays `text` with the browser's Spanish voice. Disabled, with an explanation, when the browser has no speech synthesis. */
export function SpeakButton({ text, label }: Props) {
  // the server cannot know; hydrate as "supported" and let the client snapshot correct it
  const supported = useSyncExternalStore(subscribeNothing, isSpeechSupported, () => true);
  const [playing, setPlaying] = useState(false);

  const request = useRef(0); // only the latest click may clear the "playing" state

  useEffect(() => {
    primeSpeech(); // load the voice list now so the first click is prompt
    return () => cancelSpeech(); // leaving the exercise silences it
  }, []);

  // every click plays: it restarts the speech (never stacks, and never silently "stops" the way a toggle would)
  const play = () => {
    const id = ++request.current;
    setPlaying(speakSpanish(text, () => request.current === id && setPlaying(false)));
  };

  const title = supported ? "Listen" : "Audio isn't available in this browser";
  return (
    <button
      type="button"
      className={`speak-btn${playing ? " is-playing" : ""}${label ? " has-label" : ""}`}
      onClick={play}
      disabled={!supported}
      aria-label={supported ? `Listen: ${text}` : title}
      aria-pressed={supported ? playing : undefined}
      title={title}
      data-primary-action // Enter on this button plays the audio instead of submitting the answer
    >
      <Icon name="volume" size={22} />
      {label && <span>{label}</span>}
    </button>
  );
}
