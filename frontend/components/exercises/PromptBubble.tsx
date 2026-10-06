import { Mascot } from "@/components/ui/Mascot";
import { SpeakButton } from "@/components/ui/SpeakButton";

/** The text to translate, in a speech bubble next to the mascot. `speak` adds a listen button (Spanish prompts only). */
export function PromptBubble({ text, speak }: { text: string; speak?: boolean }) {
  return (
    <div className="prompt-row">
      <div className="prompt-mascot" aria-hidden>
        <Mascot size={96} />
      </div>
      <p className={`speech${speak ? " has-audio" : ""}`} aria-label={`Text to translate: ${text}`}>
        {speak && <SpeakButton text={text} />}
        <span>{text}</span>
      </p>
    </div>
  );
}
