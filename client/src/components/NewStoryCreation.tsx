import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
} from "lucide-react";

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

const GENRES = [
  { id: "fantasy", label: "Fantasy", color: "text-purple-500", desc: "Magic, quests & mythical creatures" },
  { id: "mystery", label: "Mystery", color: "text-amber-500", desc: "Clues, suspects & twists" },
  { id: "scifi", label: "Sci-Fi", color: "text-blue-500", desc: "Space, tech & the future" },
  { id: "romance", label: "Romance", color: "text-rose-500", desc: "Love, drama & connection" },
  { id: "horror", label: "Horror", color: "text-red-600", desc: "Fear, tension & survival" },
];

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
  const [genre, setGenre] = useState<string>("");
  const [storyLength, setStoryLength] = useState<string>("");
  const [characterDescription, setCharacterDescription] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const isValid =
    genre && storyLength && characterDescription.trim().length >= 5;

  const handleSubmit = () => {
    if (isValid) {
      onStartStory({
        genre,
        storyLength,
        characterDescription: characterDescription.trim(),
      });
    }
  };

  const selectedGenre = GENRES.find((g) => g.id === genre);
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
              ? "What kind of story do you want to live?"
              : step === 2
                ? "How long should your story be?"
                : "Describe who you are in this story"}
          </p>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 pt-2">
            {[1, 2, 3].map((s) => (
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
          {/* Step 1: Genre Selection */}
          {step === 1 && (
            <div className="grid grid-cols-1 gap-3">
              {GENRES.map((g) => {
                const isSelected = genre === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => {
                      setGenre(g.id);
                      // Auto-advance after brief delay
                      setTimeout(() => setStep(2), 300);
                    }}
                    className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all text-left ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/40 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex-1">
                      <p className="font-semibold text-base">{g.label}</p>
                      <p className="text-sm text-muted-foreground">{g.desc}</p>
                    </div>
                    {isSelected && (
                      <Badge variant="default" className="shrink-0">
                        Selected
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 2: Story Length */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Show selected genre */}
              {selectedGenre && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{selectedGenre.label} story</span>
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

              <div className="grid grid-cols-2 gap-3">
                {STORY_LENGTHS.map((l) => {
                  const isSelected = storyLength === l.id;
                  return (
                    <button
                      key={l.id}
                      onClick={() => {
                        setStoryLength(l.id);
                        setTimeout(() => setStep(3), 300);
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
            </div>
          )}

          {/* Step 3: Character Description */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Show selections */}
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                {selectedGenre && (
                  <span>{selectedGenre.label}</span>
                )}
                <span className="text-muted-foreground/50">/</span>
                {selectedLength && (
                  <span>
                    {selectedLength.pages} pages ({selectedLength.label})
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setStep(1)}
                >
                  Change
                </Button>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="character-desc"
                  className="text-base font-semibold"
                >
                  Your Character
                </Label>
                <Textarea
                  id="character-desc"
                  placeholder={
                    genre === "fantasy"
                      ? "e.g., A retired cartographer who discovers her old maps can create real places..."
                      : genre === "mystery"
                        ? "e.g., A jazz musician in 1940s Chicago who keeps finding coded messages in sheet music..."
                        : genre === "scifi"
                          ? "e.g., A maintenance worker on a generation ship who discovers a hidden deck..."
                          : genre === "romance"
                            ? "e.g., A bookshop owner who starts receiving love letters hidden in returned books..."
                            : "e.g., A night shift radio host who starts receiving calls from listeners who shouldn't exist..."
                  }
                  value={characterDescription}
                  onChange={(e) => setCharacterDescription(e.target.value)}
                  className="text-base min-h-[140px] resize-none"
                  maxLength={1000}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Who are you in this story? What makes you interesting?</span>
                  <span
                    className={
                      characterDescription.length > 900 ? "text-amber-500" : ""
                    }
                  >
                    {characterDescription.length}/1000
                  </span>
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The Guide will craft your story around this character. The
                  more detail you give, the richer your experience will be.
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                if (step > 1) {
                  setStep((s) => (s - 1) as 1 | 2 | 3);
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

            {step === 3 && (
              <Button
                onClick={handleSubmit}
                disabled={!isValid || isLoading}
                className="flex-1 py-6 text-base font-semibold"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    The Guide is writing...
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
