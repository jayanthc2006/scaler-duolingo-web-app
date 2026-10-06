"use client";

import { Button } from "@/components/ui/Button";
import { Mascot } from "@/components/ui/Mascot";
import { Modal } from "@/components/ui/Modal";

export function QuitLessonModal({ onStay, onQuit }: { onStay: () => void; onQuit: () => void }) {
  return (
    <Modal titleId="quit-title" onClose={onStay}>
      <Mascot mood="sad" size={100} />
      <h2 id="quit-title">Wait, don&apos;t go!</h2>
      <p>Your answers are saved, so you can pick this lesson up again right where you left off.</p>
      <div className="modal-actions">
        <Button block onClick={onStay}>Keep learning</Button>
        <Button block variant="link" onClick={onQuit}>End session</Button>
      </div>
    </Modal>
  );
}
