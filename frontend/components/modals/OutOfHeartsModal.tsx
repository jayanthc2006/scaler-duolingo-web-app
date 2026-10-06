"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Mascot } from "@/components/ui/Mascot";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api/endpoints";
import { useLearner } from "@/lib/learner/LearnerContext";

interface Props {
  onRefill: () => Promise<void>;
  onQuit: () => void;
  onPractice: (lessonId: number) => void;
}

export function OutOfHeartsModal({ onRefill, onQuit, onPractice }: Props) {
  const { learner } = useLearner();
  const [busy, setBusy] = useState<"refill" | "practice" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cost = learner?.refill_cost_gems ?? 100;
  const canAfford = (learner?.gems ?? 0) >= cost;

  const run = async (kind: "refill" | "practice") => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "refill") await onRefill();
      else onPractice((await api.startPractice()).lesson_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(null);
    }
  };

  return (
    <Modal titleId="oh-title">
      <Mascot mood="sad" size={120} />
      <h2 id="oh-title">You ran out of hearts</h2>
      <p>Practice an earlier lesson to earn a heart back, or refill them with gems.</p>
      <div className="modal-actions">
        <Button block variant="blue" disabled={busy !== null} onClick={() => void run("practice")}>
          {busy === "practice" ? "Starting..." : "Practice to earn a heart"}
        </Button>
        <Button block variant="ghost" disabled={busy !== null || !canAfford} onClick={() => void run("refill")}>
          <Icon name="gem" size={20} style={{ color: "var(--blue)" }} /> {busy === "refill" ? "Refilling..." : `Refill for ${cost} gems`}
        </Button>
        {!canAfford && <p className="modal-note">You have {learner?.gems ?? 0} gems. Complete lessons to earn more.</p>}
        <Button block variant="link" disabled={busy !== null} onClick={onQuit}>
          No thanks
        </Button>
        {error && <p className="inline-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
