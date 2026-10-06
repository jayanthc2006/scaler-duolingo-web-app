import { Button } from "@/components/ui/Button";
import { Mascot } from "@/components/ui/Mascot";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="state-box" role="status" aria-live="polite">
      <div className="spinner" aria-hidden />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-box" role="alert">
      <Mascot mood="sad" size={110} />
      <h2>Something went wrong</h2>
      <p>{message}</p>
      {onRetry && (
        <Button variant="blue" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
