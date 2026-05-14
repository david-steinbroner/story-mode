import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { analytics } from "@/lib/posthog";
import GuideAvatar from "./GuideAvatar";

interface NewStoryCreationProps {
  onStartStory: (data: {
    genre: string;
    storyLength: string;
    characterDescription: string;
  }) => void;
  onBack: () => void;
  isLoading?: boolean;
  className?: string;
  seedDescription?: string;
}

const STORY_LENGTHS = [
  { id: "short", pages: 25, label: "Short Story", desc: "Quick adventure", time: "~15 min" },
  { id: "novella", pages: 50, label: "Novella", desc: "Medium journey", time: "~30 min" },
  { id: "novel", pages: 100, label: "Novel", desc: "Full adventure", time: "~1 hour" },
  { id: "epic", pages: 250, label: "Epic", desc: "Grand saga", time: "~3 hours" },
];

export default function NewStoryCreation({
  onStartStory,
  onBack,
  isLoading = false,
  className = "",
  seedDescription = "",
}: NewStoryCreationProps) {
  const [storyLength, setStoryLength] = useState<string>("");
  const [characterDescription, setCharacterDescription] = useState(seedDescription);
  const [step, setStep] = useState<1 | 2>(1);
  const [isSurprising, setIsSurprising] = useState(false);
  const isSubmitting = useRef(false);

  const isValid =
    storyLength && characterDescription.trim().length >= 5;

  const handleSubmit = () => {
    if (!isValid || isSubmitting.current) return;
    isSubmitting.current = true;
    analytics.trackEvent("story_creation_submitted", {
      storyLength,
      characterDescriptionLength: characterDescription.trim().length,
    });
    onStartStory({
      genre: "auto",
      storyLength,
      characterDescription: characterDescription.trim(),
    });
  };

  const selectedLength = STORY_LENGTHS.find((l) => l.id === storyLength);

  // The Guide asks each step's question via the same chat-bubble pattern used
  // on the bookshelf hero. Keeps the metaphor consistent: the Guide is always
  // the one speaking.
  const guideQuestion =
    step === 1
      ? "How long should your story be?"
      : "Describe who you are in this story.";

  return (
    <div
      className={`h-dvh overflow-y-auto bg-background px-4 pb-8 ${className}`}
    >
      {/* Header: back button + "New Story" label + step indicator */}
      <div className="pt-6 pb-4 flex items-center gap-3">
        <button
          onClick={() => (step > 1 ? setStep(1) : onBack())}
          aria-label="Back"
          className="flex-shrink-0 -ml-2 p-2 rounded-md hover:bg-accent/10 transition-colors"
          style={{ minHeight: 44, minWidth: 44 }}
          disabled={isLoading}
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">New Story</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Step {step} of 2</p>
        </div>
      </div>

      {/* Guide bubble — the Guide asks the step's question. Mirrors the
          empty-shelf welcome on the bookshelf so the experience reads as
          one continuous conversation with the Guide. */}
      <div className="mb-6 flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <GuideAvatar size={36} />
        </div>
        <div
          className="bg-card border border-border px-4 py-3 text-sm leading-relaxed text-muted-foreground max-w-sm"
          style={{ borderRadius: "2px 16px 16px 16px" }}
        >
          <p>{guideQuestion}</p>
        </div>
      </div>

      {/* Step 1: Length selection. Tapping a length auto-advances to step 2. */}
      {step === 1 && (
        <div className="grid grid-cols-2 gap-3">
          {STORY_LENGTHS.map((l) => {
            const isSelected = storyLength === l.id;
            return (
              <button
                key={l.id}
                onClick={() => {
                  setStoryLength(l.id);
                  analytics.trackEvent("story_length_selected", { storyLength: l.id, pages: l.pages });
                  setTimeout(() => setStep(2), 300);
                }}
                className={`p-4 rounded-lg border-2 transition-all text-center ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/40 hover:bg-muted/50"
                }`}
                style={{ minHeight: 44 }}
              >
                <p className="font-bold text-2xl text-primary">{l.pages}</p>
                <p className="text-xs text-muted-foreground">pages</p>
                <p className="font-semibold text-sm mt-2">{l.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{l.time}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Step 2: Character description + Surprise me + Begin Story */}
      {step === 2 && (
        <div className="space-y-4">
          {selectedLength && (
            <p className="text-xs text-muted-foreground">
              {selectedLength.pages} pages ({selectedLength.label}).{" "}
              <button
                type="button"
                onClick={() => setStep(1)}
                className="underline hover:text-foreground transition-colors"
              >
                Change length
              </button>
            </p>
          )}

          <Textarea
            id="character-desc"
            placeholder="e.g., A curious inventor who discovers a hidden door in their workshop that leads somewhere impossible..."
            value={characterDescription}
            onChange={(e) => setCharacterDescription(e.target.value)}
            className="text-base min-h-[140px] resize-none"
            maxLength={1000}
          />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={isSurprising || isLoading}
              onClick={async () => {
                analytics.trackEvent("surprise_me_clicked");
                setIsSurprising(true);
                try {
                  const response = await apiRequest("POST", "/api/story/surprise-me", {});
                  const data = await response.json();
                  if (data.success && data.description) {
                    setCharacterDescription(data.description);
                  }
                } catch {
                  // Silently fail — user can try again or type manually
                } finally {
                  setIsSurprising(false);
                }
              }}
            >
              {isSurprising ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Thinking...
                </>
              ) : (
                "Surprise me"
              )}
            </Button>
            <span
              className={
                characterDescription.length > 900 ? "text-amber-500" : ""
              }
            >
              {characterDescription.length}/1000
            </span>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!isValid || isLoading}
            className="w-full py-6 text-base font-semibold"
            style={{ minHeight: 44 }}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting your story...
              </>
            ) : (
              "Begin Story"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
