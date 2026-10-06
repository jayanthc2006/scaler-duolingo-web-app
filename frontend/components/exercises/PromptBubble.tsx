import { Mascot } from "@/components/ui/Mascot";

/** The text to translate, in a speech bubble next to the mascot. */
export function PromptBubble({ text }: { text: string }) {
  return (
    <div className="prompt-row">
      <div className="prompt-mascot" aria-hidden>
        <Mascot size={96} />
      </div>
      <p className="speech" aria-label={`Text to translate: ${text}`}>{text}</p>
    </div>
  );
}
