import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Info } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { apiRequest } from "@/lib/queryClient";

interface NewStoryCreationProps {
  onStartStory: (data: {
    genre: string;
    storyLength: string;
    characterDescription: string;
  }) => void;
  onBack: () => void;
  isLoading?: boolean;
  className?: string;
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
}: NewStoryCreationProps) {
  const [storyLength, setStoryLength] = useState<string>("");
  const [characterDescription, setCharacterDescription] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [isSurprising, setIsSurprising] = useState(false);
  const isSubmitting = useRef(false);

  const isValid =
    storyLength && characterDescription.trim().length >= 5;

  const handleSubmit = () => {
    if (!isValid || isSubmitting.current) return;
    isSubmitting.current = true;
    try {
      onStartStory({
        genre: "auto",
        storyLength,
        characterDescription: characterDescription.trim(),
      });
    } finally {
      // Reset after a delay to allow for navigation — if the user comes back, they can submit again
      setTimeout(() => { isSubmitting.current = false; }, 5000);
    }
  };

  const selectedLength = STORY_LENGTHS.find((l) => l.id === storyLength);

  return (
    <div
      className={`min-h-screen flex items-center justify-center px-4 py-6 ${className}`}
    >
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-3xl font-bold">New Story</CardTitle>
          <p className="text-muted-foreground text-base">
            {step === 1
              ? "How long should your story be?"
              : "Describe who you are in this story"}
          </p>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 pt-2">
            {[1, 2].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  s === step
                    ? "w-8 bg-primary"
                    : s < step
                      ? "w-8 bg-primary/40"
                      : "w-8 bg-muted"
                }`}
              />
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-4">
          {/* Step 1: Story Length */}
          {step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              {STORY_LENGTHS.map((l) => {
                const isSelected = storyLength === l.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => {
                      setStoryLength(l.id);
                      setTimeout(() => setStep(2), 300);
                    }}
                    className={`p-4 rounded-lg border-2 transition-all text-center ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/40 hover:bg-muted/50"
                    }`}
                  >
                    <p className="font-bold text-2xl text-primary">
                      {l.pages}
                    </p>
                    <p className="text-xs text-muted-foreground">pages</p>
                    <p className="font-semibold text-sm mt-2">{l.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {l.time}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 2: Character Description */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Show selected length */}
              {selectedLength && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    {selectedLength.pages} pages ({selectedLength.label})
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setStep(1)}
                  >
                    Change
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label
                    htmlFor="character-desc"
                    className="text-base font-semibold"
                  >
                    Your Character
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="More info"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="text-sm text-muted-foreground leading-relaxed" side="top" align="start">
                      The Guide will craft your story around this character. The more detail you give, the richer your experience will be.
                    </PopoverContent>
                  </Popover>
                </div>
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
              </div>

            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                if (step > 1) {
                  setStep(1);
                } else {
                  onBack();
                }
              }}
              className="flex items-center gap-2"
              disabled={isLoading}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>

            {step === 2 && (
              <Button
                onClick={handleSubmit}
                disabled={!isValid || isLoading}
                className="flex-1 py-6 text-base font-semibold"
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
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
