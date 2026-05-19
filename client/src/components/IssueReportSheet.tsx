import { useEffect, useState } from "react";
import { Loader2, Check, X } from "lucide-react";
import { Sheet, SheetContent, SheetClose, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";

// Full server-side category enum. Each surface picks its own subset via the
// `categories` prop on IssueReportSheet — bookshelf-launched sheets surface
// library issues, in-story sheets surface story-reading issues.
export const ALL_ISSUE_CATEGORIES = [
  { id: "guide_reply", label: "The Guide's reply is broken or off" },
  { id: "choices", label: "My choices didn't work" },
  { id: "stuck", label: "The story got stuck" },
  { id: "puzzle", label: "A puzzle is broken or unsolvable" },     // v1.14.0
  { id: "story_load", label: "A story didn't open or load" },
  { id: "story_missing", label: "A story is missing or in the wrong tab" },
  { id: "story_manage", label: "Can't archive, restore, or delete a story" },
  { id: "other", label: "Something else" },
] as const;

type CategoryId = (typeof ALL_ISSUE_CATEGORIES)[number]["id"];

export const IN_STORY_CATEGORY_IDS: CategoryId[] = ["guide_reply", "choices", "stuck", "puzzle", "other"];
export const BOOKSHELF_CATEGORY_IDS: CategoryId[] = ["story_load", "story_missing", "story_manage", "other"];

interface IssueReportContext {
  currentPage?: number | null;
  lastMessageIds?: string[];
  storyId?: string | null;
  // v1.14.0: when the sheet opens while a puzzle is active, the parent passes
  // the puzzleId so the resolver email gets a direct link to puzzles +
  // puzzle_attempts rows. Null when no puzzle is active.
  puzzleId?: string | null;
}

interface IssueReportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whether the "Include this story" toggle starts on. True on in-story
   *  surfaces, false on the bookshelf where there's no story context. */
  includeContextDefault: boolean;
  /** Story/page/message context to attach when includeContext is true.
   *  Pass an empty object on surfaces where no story is active. */
  context: IssueReportContext;
  /** App version, surfaced in the report row so dev can confirm the build. */
  appVersion: string;
  /** Which category IDs to show in the picker. Caller supplies the surface-
   *  appropriate subset (IN_STORY_CATEGORY_IDS or BOOKSHELF_CATEGORY_IDS). */
  categoryIds: CategoryId[];
}

const MIN_DESCRIPTION = 10;
const MAX_DESCRIPTION = 5000;

export default function IssueReportSheet({
  open,
  onOpenChange,
  includeContextDefault,
  context,
  appVersion,
  categoryIds,
}: IssueReportSheetProps) {
  const categories = ALL_ISSUE_CATEGORIES.filter((c) => categoryIds.includes(c.id));
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [description, setDescription] = useState("");
  const [includeContext, setIncludeContext] = useState(includeContextDefault);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset form state every time the sheet opens so previous submissions
  // don't leak in. `open` flips false→true when the menu launches the sheet.
  useEffect(() => {
    if (open) {
      setCategory(null);
      setDescription("");
      setIncludeContext(includeContextDefault);
      setIsSubmitting(false);
      setIsSubmitted(false);
      setErrorMessage(null);
    }
  }, [open, includeContextDefault]);

  // Auto-close shortly after success so users see the thank-you state but
  // aren't stuck dismissing it themselves.
  useEffect(() => {
    if (!isSubmitted) return;
    const timer = setTimeout(() => onOpenChange(false), 1500);
    return () => clearTimeout(timer);
  }, [isSubmitted, onOpenChange]);

  const trimmedDescription = description.trim();
  const canSubmit =
    category !== null &&
    trimmedDescription.length >= MIN_DESCRIPTION &&
    trimmedDescription.length <= MAX_DESCRIPTION &&
    !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit || !category) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await apiRequest("POST", "/api/issue-report", {
        category,
        description: trimmedDescription,
        includeContext,
        currentPage: includeContext ? context.currentPage ?? null : null,
        lastMessageIds: includeContext ? context.lastMessageIds ?? [] : [],
        appVersion,
        // v1.14.0 — only when the user opted to include context AND there is one.
        puzzleId: includeContext ? context.puzzleId ?? null : null,
      });
      setIsSubmitted(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setErrorMessage(message);
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* `[&>button:last-of-type]:hidden` suppresses ONLY the shadcn
          primitive's default close X (always rendered as the last child of
          SheetContent), leaving our own SheetClose-wrapped button below
          visible and positioned at the proper top-right corner inset.
          The earlier `[&>button]:hidden` was too broad and hid both. */}
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[85vh] overflow-y-auto [&>button:last-of-type]:hidden"
        style={{ backgroundColor: "#FFF9F0" }}
      >
        <SheetClose asChild>
          <button
            type="button"
            aria-label="Close"
            className="absolute top-2 right-2 inline-flex items-center justify-center w-11 h-11 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <X className="w-5 h-5" />
          </button>
        </SheetClose>

        <SheetHeader className="text-left pr-12">
          <SheetTitle>Report an issue</SheetTitle>
          <SheetDescription>
            Tell us what went wrong. We read every report.
          </SheetDescription>
        </SheetHeader>

        {isSubmitted ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-12 h-12 rounded-full bg-accent/30 flex items-center justify-center">
              <Check className="w-6 h-6 text-foreground" />
            </div>
            <p className="text-base text-foreground">Thanks — we got it.</p>
          </div>
        ) : (
          <div className="space-y-5 mt-4">
            {/* Category */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">What's wrong?</Label>
              <div className="space-y-1.5">
                {categories.map((c) => {
                  const selected = category === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategory(c.id)}
                      // No `hover:` background — on touch devices the hover
                      // state sticks after the first tap, making it look
                      // half-selected. Selection itself stands out via the
                      // 2px border + accent bg + the leading dot indicator.
                      className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors flex items-center gap-2.5 ${
                        selected
                          ? "border-2 border-foreground bg-primary/15 text-foreground font-medium"
                          : "border border-border bg-card text-foreground"
                      }`}
                      style={{ minHeight: 44 }}
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 transition-colors ${
                          selected ? "bg-foreground" : "border border-border bg-transparent"
                        }`}
                        aria-hidden
                      />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="issue-description" className="text-sm font-medium text-foreground">
                What happened?
              </Label>
              <Textarea
                id="issue-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What were you trying to do? What did you see instead?"
                className="text-base min-h-[120px] resize-none"
                maxLength={MAX_DESCRIPTION}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {trimmedDescription.length < MIN_DESCRIPTION
                    ? `${MIN_DESCRIPTION - trimmedDescription.length} more characters needed`
                    : " "}
                </span>
                <span className={trimmedDescription.length > MAX_DESCRIPTION - 100 ? "text-amber-500" : ""}>
                  {trimmedDescription.length}/{MAX_DESCRIPTION}
                </span>
              </div>
            </div>

            {/* "Send my story too" — checkbox-button matching the category
                picker so the form has one visual language. Only relevant when
                there's actually a story to send (hidden on bookshelf-launched
                sheets). Defaults on; users can turn it off if they don't
                want us pulling up their story content. */}
            {includeContextDefault && (
              <button
                type="button"
                onClick={() => setIncludeContext(!includeContext)}
                aria-pressed={includeContext}
                className={`w-full text-left px-3 py-3 rounded-md text-sm transition-colors flex items-start gap-3 ${
                  includeContext
                    ? "border-2 border-foreground bg-primary/15"
                    : "border border-border bg-card"
                }`}
              >
                <span
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    includeContext ? "border-foreground bg-foreground" : "border-border bg-transparent"
                  }`}
                  aria-hidden
                >
                  {includeContext && <Check className="w-3 h-3" style={{ color: "#FFF9F0" }} strokeWidth={3} />}
                </span>
                <span className="flex-1">
                  <span className="block text-foreground font-medium">Send my story too</span>
                  <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
                    Some bugs — especially weird Guide replies — can't be debugged from a description alone.
                    With this on, we attach your story so a developer can pull up exactly the page you were
                    on and the last few AI replies. Without it, we only see what you write above.
                  </span>
                </span>
              </button>
            )}

            {errorMessage && (
              <p className="text-sm text-destructive" role="alert">
                Couldn't send: {errorMessage}. Try again?
              </p>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="flex-1"
                style={{ minHeight: 44 }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1"
                style={{ minHeight: 44 }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending
                  </>
                ) : (
                  "Send report"
                )}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
