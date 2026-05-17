import { X } from "lucide-react";
import { Dialog, DialogContent, DialogClose, DialogTitle } from "@/components/ui/dialog";
import type { GameState } from "@shared/schema";

// Mirrors the wizard's STORY_LENGTHS so the bookshelf details modal shows the
// same human-readable label/page-target a reader picked at creation. Kept in
// sync by hand — if NewStoryCreation's STORY_LENGTHS changes, update here.
const LENGTH_LABELS: Record<string, { label: string; pages: number; time: string }> = {
  short: { label: "Short Story", pages: 25, time: "~15 min" },
  novella: { label: "Novella", pages: 50, time: "~30 min" },
  novel: { label: "Novel", pages: 100, time: "~1 hour" },
  epic: { label: "Epic", pages: 250, time: "~3 hours" },
};

interface StoryDetailsDialogProps {
  story: GameState | null;
  onOpenChange: (open: boolean) => void;
}

export default function StoryDetailsDialog({ story, onOpenChange }: StoryDetailsDialogProps) {
  const open = story !== null;
  const lengthInfo = story?.storyLength ? LENGTH_LABELS[story.storyLength] : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* In-app card treatment: rounded-2xl + border + cream background.
          `w-[calc(100%-2rem)]` gives 16px inset from each viewport edge on
          phones; max-w-sm caps width on larger screens. Centering is via
          shadcn's built-in fixed/translate; no `mx-4` (which would offset
          the centered element rightward by 1rem). `[&>button:last-of-type]
          :hidden` suppresses ONLY the shadcn-default close X (always the
          last child) so our own DialogClose-wrapped X below stays visible. */}
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border p-5 [&>button:last-of-type]:hidden"
        style={{ backgroundColor: "#FFF9F0" }}
      >
        <DialogClose asChild>
          <button
            type="button"
            aria-label="Close"
            className="absolute top-2 right-2 inline-flex items-center justify-center w-11 h-11 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <X className="w-5 h-5" />
          </button>
        </DialogClose>

        <DialogTitle className="text-lg font-semibold text-foreground pr-12">
          {story?.storyTitle || "Untitled Story"}
        </DialogTitle>

        {story && (
          <div className="space-y-4 mt-2">
            {story.characterDescription && (
              <div>
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                  Prompt
                </h3>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {story.characterDescription}
                </p>
              </div>
            )}

            <div>
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                Length
              </h3>
              <p className="text-sm text-foreground">
                {lengthInfo
                  ? `${lengthInfo.label} — ${lengthInfo.pages} pages, ${lengthInfo.time}`
                  : story.storyLength
                  ? story.storyLength
                  : "Not set"}
              </p>
              {story.totalPages != null && story.totalPages > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {story.storyComplete
                    ? `Finished at page ${story.totalPages}.`
                    : `Currently on page ${story.currentPage ?? 0} of ${story.totalPages}.`}
                </p>
              )}
            </div>

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
