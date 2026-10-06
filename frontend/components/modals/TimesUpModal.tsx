"use client";

import { Button } from "@/components/ui/Button";
import { Mascot } from "@/components/ui/Mascot";
import { Modal } from "@/components/ui/Modal";

/** Shown when the legendary clock hits zero. Retrying starts a fresh, server-timed run; nothing was lost or charged. */
export function TimesUpModal({ onRetry, onQuit }: { onRetry: () => void; onQuit: () => void }) {
  return (
    <Modal titleId="timesup-title">
      <Mascot mood="sad" size={100} />
      <h2 id="timesup-title">Time&apos;s up!</h2>
      <p>You didn&apos;t finish before the clock ran out. No hearts or XP were lost, so give it another go.</p>
      <div className="modal-actions">
        <Button block onClick={onRetry}>Try again</Button>
        <Button block variant="link" onClick={onQuit}>Back to challenges</Button>
      </div>
    </Modal>
  );
}
