import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import GuideAvatar from "./GuideAvatar";
import ScrambleCard from "./puzzles/ScrambleCard";
import CryptogramCard from "./puzzles/CryptogramCard";
import FillInBlankCard from "./puzzles/FillInBlankCard";
import type { PuzzleClientView } from "@shared/types/puzzles";
import { Check, Lightbulb, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PuzzleCardProps {
  puzzleId: string;
  /** Called when puzzle resolves (correct or skipped). Parent uses this to
   *  unlock the next narration turn and to track which puzzleId to attach
   *  to issue reports. */
  onResolve: (state: { correct: boolean; skipped: boolean }) => void;
}

interface AttemptResponse {
  correct: boolean;
  skipped: boolean;
}

const SKIP_BUTTON_VISIBLE_AFTER_MS = 60_000;  // 60s of inactivity per Approach 6
const HINT_BUTTON_VISIBLE_AFTER_MS = 30_000;  // 30s before first hint surfaces

export default function PuzzleCard({ puzzleId, onResolve }: PuzzleCardProps) {
  const { data: puzzle, isLoading } = useQuery<PuzzleClientView>({
    queryKey: ["puzzle", puzzleId],
    // apiRequest returns a Response — caller must .json(). Every existing
    // caller in this codebase follows this pattern.
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/puzzle/${puzzleId}`);
      return res.json();
    },
    // Puzzle data is immutable once created — cache aggressively.
    staleTime: Infinity,
  });

  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [showHintButton, setShowHintButton] = useState(false);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [terminal, setTerminal] = useState<AttemptResponse | null>(null);
  // Track wrong submissions so we can show inline feedback. Without this,
  // submitting an incorrect answer is silently swallowed and the reader
  // has no idea whether the form even fired. v1.14.0 UX baseline.
  const [wrongAttempts, setWrongAttempts] = useState(0);

  // 30s timer → reveal hint button. 60s → reveal skip button.
  useEffect(() => {
    const t1 = setTimeout(() => setShowHintButton(true), HINT_BUTTON_VISIBLE_AFTER_MS);
    const t2 = setTimeout(() => setShowSkipButton(true), SKIP_BUTTON_VISIBLE_AFTER_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Skip button ALSO surfaces once all three hints are revealed, per spec
  // §Approach 6 "after the third hint is revealed OR after 60s of inactivity,
  // whichever first." Without this, a reader who burns through hints in
  // under a minute waits unnecessarily for the skip option.
  useEffect(() => {
    if (hintsRevealed >= 3) setShowSkipButton(true);
  }, [hintsRevealed]);

  // v1.14.0 — Hydrate terminal state from the server when the puzzle has
  // already been resolved (e.g., user reloads the page after solving). Without
  // this, the input would render as active and any submission would hit the
  // idempotent endpoint, which returns the prior `correct:true` state —
  // making it look like ANY wrong submission resolves the puzzle. Setting
  // terminal here disables the input and shows the resolved bubble.
  useEffect(() => {
    if (puzzle?.resolved && !terminal) {
      setTerminal({ correct: puzzle.resolved.correct, skipped: puzzle.resolved.skipped });
    }
  }, [puzzle?.resolved, terminal]);

  // Hint button also surfaces immediately after any incorrect submit.
  function revealHintEarly() { setShowHintButton(true); }

  const attemptMutation = useMutation<AttemptResponse, Error, { submission?: string; skip?: boolean }>({
    mutationFn: async (body) => {
      const res = await apiRequest("POST", "/api/puzzle/attempt", {
        puzzleId,
        submission: body.submission,
        skip: body.skip,
        hintsUsed: hintsRevealed,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.correct || data.skipped) {
        setTerminal(data);
        onResolve(data);
        // Invalidate the message list so the chat re-renders with the
        // puzzle's resolved state if needed.
        queryClient.invalidateQueries({ queryKey: ["messages"] });
      } else {
        // Wrong submission: bump the counter (drives inline feedback below)
        // and surface the hint button if it wasn't visible yet.
        setWrongAttempts(n => n + 1);
        revealHintEarly();
      }
    },
  });

  async function handleSubmit(submission: string) {
    if (terminal || attemptMutation.isPending) return;
    await attemptMutation.mutateAsync({ submission });
  }

  async function handleSkip() {
    if (terminal || attemptMutation.isPending) return;
    await attemptMutation.mutateAsync({ skip: true });
  }

  function handleRevealHint() {
    if (hintsRevealed < 3) setHintsRevealed(hintsRevealed + 1);
  }

  if (isLoading || !puzzle) {
    return (
      <div className="flex gap-2.5 items-end">
        <GuideAvatar size={28} />
        <div className="bg-card border border-border rounded-2xl px-4 py-3 text-sm text-muted-foreground">
          Loading puzzle...
        </div>
      </div>
    );
  }

  // Terminal states: show a compact resolved bubble.
  if (terminal) {
    const icon = terminal.correct
      ? <Check className="w-4 h-4 text-foreground" />
      : <SkipForward className="w-4 h-4 text-muted-foreground" />;
    const label = terminal.correct ? "Puzzle solved." : "Puzzle skipped.";
    return (
      <div className="flex gap-2.5 items-end">
        <GuideAvatar size={28} />
        <div className="bg-card border border-border rounded-2xl px-4 py-3 text-sm text-foreground inline-flex items-center gap-2">
          {icon}
          {label}
        </div>
      </div>
    );
  }

  const SubCard =
    puzzle.type === 'scramble'         ? ScrambleCard :
    puzzle.type === 'cryptogram'       ? CryptogramCard :
                                          FillInBlankCard;

  return (
    <div className="flex gap-2.5 items-start">
      <GuideAvatar size={28} />
      <div className="flex-1 bg-card border border-border rounded-2xl p-4 space-y-3 max-w-[90%]">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          A puzzle, {puzzle.theme}
        </div>

        <SubCard payload={puzzle.payload} onSubmit={handleSubmit} disabled={attemptMutation.isPending} />

        {/* Hints */}
        {hintsRevealed > 0 && (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {puzzle.hints.slice(0, hintsRevealed).map((h, i) => (
              <li key={i}><span className="font-medium">Hint {i + 1}:</span> {h}</li>
            ))}
          </ul>
        )}

        {/* Hint + Skip action row */}
        <div className="flex items-center gap-2 pt-1">
          {showHintButton && hintsRevealed < 3 && (
            <Button variant="ghost" size="sm" onClick={handleRevealHint}>
              <Lightbulb className="w-4 h-4 mr-1.5" />
              {hintsRevealed === 0 ? "Hint" : `Hint ${hintsRevealed + 1}`}
            </Button>
          )}
          {showSkipButton && (
            <Button variant="ghost" size="sm" onClick={handleSkip} className="ml-auto">
              <SkipForward className="w-4 h-4 mr-1.5" />
              Skip Puzzle
            </Button>
          )}
        </div>

        {/* Wrong-answer feedback (v1.14.0). Shown once at least one
            incorrect attempt has been submitted, until the puzzle resolves.
            Without this, a wrong submission silently clears the form and
            the reader has no idea whether anything happened. */}
        {wrongAttempts > 0 && !terminal && (
          <p className="text-sm" style={{ color: "#B45309" }}>
            Not quite. Try again{showHintButton && hintsRevealed < 3 ? ", or take a hint" : ""}.
          </p>
        )}

        {attemptMutation.isError && (
          <p className="text-sm text-destructive">Something went wrong submitting. Try again?</p>
        )}
      </div>
    </div>
  );
}
