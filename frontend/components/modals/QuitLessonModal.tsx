"use client";

import { Button } from "@/components/ui/Button";
import { Mascot } from "@/components/ui/Mascot";
import { Modal } from "@/components/ui/Modal";

interface Props {
  onStay: () => void;
  onQuit: () => void;
  /** a legendary run: ending it abandons the challenge (no resume), so the copy says so */
  legendary?: boolean;
  busy?: boolean;
  error?: string | null;
}

export function QuitLessonModal({ onStay, onQuit, legendary = false, busy = false, error = null }: Props) {
  return (
    <Modal titleId="quit-title" onClose={busy ? undefined : onStay}>
      <Mascot mood="sad" size={100} />
      <h2 id="quit-title">{legendary ? "End this challenge?" : "Wait, don\u0027t go!"}</h2>
      <p>
        {legendary
          ? "Ending abandons this run: nothing is awarded and it can't be resumed. You can start a fresh one any time."
          : "Your answers are saved, so you can pick this lesson up again right where you left off."}
      </p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <Button block onClick={onStay} disabled={busy}>{legendary ? "Keep going" : "Keep learning"}</Button>
        <Button block variant="link" onClick={onQuit} disabled={busy}>{busy ? "Ending..." : error ? "Try again" : "End session"}</Button>
      </div>
    </Modal>
  );
}
