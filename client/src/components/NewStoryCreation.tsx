import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, ChevronUp, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { analytics } from "@/lib/posthog";
import GuideBubble from "./GuideBubble";
import CenteredHeader from "./CenteredHeader";
import ChoiceButton from "./ChoiceButton";
import PlayerBubble from "./PlayerBubble";

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

// Hardcoded replies for the Step 2 drawer's canned questions. Match the
// Guide voice from docs/ai-voice.md — short sentences, no em dashes, plain
// words, concrete.
const LENGTH_EXPLAINER =
  "Short stories run 25 pages, about 15 minutes. Quick and tight. Novellas double that, around 30 minutes, with room for a twist. Novels are 100 pages, a full hour, a whole arc. Epics run 250 pages, about 3 hours. A grand journey.";

const KEEP_GOING_EXPLAINER =
  "Once a story reaches its ending, that one's wrapped. I write a final page and the book closes. If you want more room to roam, pick a longer length next time. A novella, novel, or epic gives the world more time to breathe.";

export default function NewStoryCreation({
  onStartStory,
  onBack,
  isLoading = false,
  className = "",
  seedDescription = "",
}: NewStoryCreationProps) {
  const [storyLength, setStoryLength] = useState<string>("");
  const [characterDescription, setCharacterDescription] = useState(seedDescription);
  // v1.8.3: 3-step wizard. Step 1: description, Step 2: length, Step 3:
  // confirmation. Tapping a length on Step 2 advances to Step 3 where
  // the user reviews the choices and taps Begin to actually submit.
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const isSubmitting = useRef(false);

  // Drawer state — sticky bottom drawer with peek/expand, same pattern as
  // the bookshelf and in-story drawers. Drawer contents change per step.
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Step 1 drawer payload — AI-generated character suggestions. Lazy
  // fetched on first drawer open. Cached across drawer open/close until
  // the user taps regenerate.
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  // Step 2 drawer payload — ephemeral Q&A bubbles. Same shape and
  // ephemeral semantics as the bookshelf Q&A history.
  type QaMessage = { id: string; sender: "player" | "guide"; content: string };
  const [step2Qa, setStep2Qa] = useState<QaMessage[]>([]);
  const qaEndRef = useRef<HTMLDivElement>(null);

  const isValid =
    storyLength && characterDescription.trim().length >= 5;

  const handleSubmit = (lengthOverride?: string) => {
    const finalLength = lengthOverride ?? storyLength;
    if (!finalLength || characterDescription.trim().length < 5) return;
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    analytics.trackEvent("story_creation_submitted", {
      storyLength: finalLength,
      characterDescriptionLength: characterDescription.trim().length,
    });
    onStartStory({
      genre: "auto",
      storyLength: finalLength,
      characterDescription: characterDescription.trim(),
    });
  };

  const advanceToStep2 = () => {
    if (characterDescription.trim().length < 5) return;
    setStep(2);
    setIsDrawerOpen(false);
  };

  const advanceToStep3 = () => {
    if (!storyLength || characterDescription.trim().length < 5) return;
    setStep(3);
    setIsDrawerOpen(false);
  };

  const goBack = () => {
    if (step === 3) {
      setStep(2);
      setIsDrawerOpen(false);
    } else if (step === 2) {
      setStep(1);
      setIsDrawerOpen(false);
    } else {
      onBack();
    }
  };

  // Step 3 drawer handlers — "Need to change anything?" routes.
  const editLengthFromStep3 = () => {
    setStep(2);
    setIsDrawerOpen(false);
  };
  const editPromptFromStep3 = () => {
    setStep(1);
    setIsDrawerOpen(false);
  };
  const startOverFromStep3 = () => {
    setCharacterDescription("");
    setStoryLength("");
    setSuggestions([]);
    setStep2Qa([]);
    setStep(1);
    setIsDrawerOpen(false);
  };

  const fetchSuggestions = async () => {
    setIsLoadingSuggestions(true);
    try {
      const response = await apiRequest("POST", "/api/story/surprise-me?count=3", {});
      const data = await response.json();
      if (data.success && Array.isArray(data.descriptions)) {
        setSuggestions(data.descriptions);
      }
    } catch {
      // Silent fail — user can tap regenerate to retry.
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  // Auto-fetch suggestions the first time the user opens the Step 1 drawer.
  // Avoids spending an AI call if they never need inspiration.
  const handleToggleDrawer = () => {
    const willOpen = !isDrawerOpen;
    setIsDrawerOpen(willOpen);
    if (willOpen && step === 1 && suggestions.length === 0 && !isLoadingSuggestions) {
      fetchSuggestions();
    }
  };

  const handleSuggestionTap = (suggestion: string) => {
    setCharacterDescription(suggestion);
    setIsDrawerOpen(false);
    analytics.trackEvent("surprise_me_clicked");
  };

  const addStep2Qa = (question: string, answer: string) => {
    const stamp = Date.now();
    // After every Q&A, re-ask "How long should your story be?" so the CTA
    // is always the last thing the Guide says (v1.8.6). Keeps the user
    // oriented back to the decision even if they wandered through the
    // canned answers.
    setStep2Qa((prev) => [
      ...prev,
      { id: `q-${stamp}`, sender: "player", content: question },
      { id: `a-${stamp}`, sender: "guide", content: answer },
      { id: `cta-${stamp}`, sender: "guide", content: "How long should your story be?" },
    ]);
    setIsDrawerOpen(false);
    requestAnimationFrame(() => {
      qaEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  };

  const handleAboutLengths = () =>
    addStep2Qa("Tell me about these lengths", LENGTH_EXPLAINER);

  const handleKeepGoing = () =>
    addStep2Qa("Can I keep going after a story is done?", KEEP_GOING_EXPLAINER);

  // Wipe Step 2 Q&A history every time the user (re-)enters Step 2 (v1.8.6).
  // The Q&A is meant to be a momentary aside, not a persistent thread —
  // returning from Step 3 (via back or "Length" edit) should land the user
  // on a clean "prompt echo + How long…?" screen, not a wall of prior
  // questions. First entry from Step 1 is also covered; step2Qa is already
  // [] in that case so the set is a no-op.
  useEffect(() => {
    if (step === 2) {
      setStep2Qa([]);
    }
  }, [step]);

  // Close drawer when tapping outside (mirrors in-story drawer behavior).
  useEffect(() => {
    if (!isDrawerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setIsDrawerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDrawerOpen]);

  const selectedLength = STORY_LENGTHS.find((l) => l.id === storyLength);

  const drawerPeekLabel =
    step === 1
      ? "Need suggestions?"
      : step === 2
      ? "Need suggestions?"
      : "Need to change anything?";

  return (
    <div className={`h-dvh flex flex-col bg-background relative ${className}`}>
      {/* Header: back button (left) + centered "New Story" + step dots (right). */}
      <CenteredHeader
        className="px-4 pt-4 pb-2 shrink-0"
        title="New Story"
        left={
          <button
            onClick={goBack}
            aria-label="Back"
            className="p-2 rounded-md hover:bg-accent/10 transition-colors"
            style={{ minHeight: 44, minWidth: 44 }}
            disabled={isLoading}
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
        }
        right={
          <div className="flex items-center gap-1.5" aria-label={`Step ${step} of 3`}>
            <span
              className={`w-2 h-2 rounded-full transition-colors ${
                step === 1 ? "bg-foreground" : "bg-foreground/25"
              }`}
            />
            <span
              className={`w-2 h-2 rounded-full transition-colors ${
                step === 2 ? "bg-foreground" : "bg-foreground/25"
              }`}
            />
            <span
              className={`w-2 h-2 rounded-full transition-colors ${
                step === 3 ? "bg-foreground" : "bg-foreground/25"
              }`}
            />
          </div>
        }
      />

      {/* Step 2 length tiles — anchored above the scroll area (v1.8.5),
          same pattern as the Bookshelf shelf section. The Guide bubble and
          Q&A history scroll independently below; the tiles stay visible no
          matter how much chat accumulates. Steps 1 and 3 keep everything
          in the scroll area since neither has Q&A growing beneath. */}
      {step === 2 && (
        <div className="shrink-0 px-4 mt-2 mb-2">
          <div className="grid grid-cols-2 gap-2">
            {STORY_LENGTHS.map((l) => {
              const isSelected = storyLength === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => {
                    setStoryLength(l.id);
                    analytics.trackEvent("story_length_selected", {
                      storyLength: l.id,
                      pages: l.pages,
                    });
                    // Selection style animates briefly, then we advance
                    // to Step 3 for the user to confirm before submit.
                    setTimeout(() => {
                      setStep(3);
                      setIsDrawerOpen(false);
                    }, 200);
                  }}
                  disabled={isLoading || isSubmitting.current}
                  className={`px-3 py-2.5 rounded-lg border-2 transition-all text-center ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/40 hover:bg-muted/50"
                  }`}
                  style={{ minHeight: 44 }}
                >
                  <p className="font-semibold text-sm">{l.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.pages} pages &nbsp; {l.time}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Scrollable content. paddingBottom leaves room for the drawer peek.
          v1.8.4 layout: action/input goes FIRST, Guide bubble goes BELOW the
          action — mirrors the Bookshelf pattern where shelves sit above the
          Guide welcome bubble. Drawer is sticky-anchored at the bottom. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4" style={{ paddingBottom: "6rem" }}>
        {/* Step 1: Character description input → counter → Next → Guide */}
        {step === 1 && (
          <div className="space-y-4 mt-2">
            <Textarea
              id="character-desc"
              placeholder="e.g., A curious inventor who discovers a hidden door in their workshop that leads somewhere impossible..."
              value={characterDescription}
              onChange={(e) => setCharacterDescription(e.target.value)}
              className="text-base min-h-[140px] resize-none"
              maxLength={1000}
            />
            <div className="flex items-center justify-end text-xs text-muted-foreground">
              <span className={characterDescription.length > 900 ? "text-amber-500" : ""}>
                {characterDescription.length}/1000
              </span>
            </div>
            <Button
              onClick={advanceToStep2}
              disabled={characterDescription.trim().length < 5 || isLoading}
              className="w-full py-6 text-base font-semibold"
              style={{ minHeight: 44 }}
            >
              Next
            </Button>
            <GuideBubble
              avatarSize={36}
              bubbleClassName="bg-card border border-border"
              className="mt-6"
            >
              <p className="text-sm leading-relaxed text-muted-foreground">
                Describe who you are in this story.
              </p>
            </GuideBubble>
          </div>
        )}

        {/* Step 2: Guide bubble (prompt echo + question) → Q&A history.
            Length tiles live in the anchored section above this scroll area. */}
        {step === 2 && (
          <div className="space-y-4 mt-2">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting your story...
              </div>
            )}

            <GuideBubble
              avatarSize={36}
              bubbleClassName="bg-card border border-border"
            >
              <div className="text-sm leading-relaxed text-muted-foreground space-y-3">
                <p className="italic text-foreground">{characterDescription.trim()}</p>
                <p>How long should your story be?</p>
              </div>
            </GuideBubble>

            {/* Step 2 Q&A history (from the drawer's canned questions). Same
                bubble pattern as Bookshelf Q&A — chains below the recap. */}
            {step2Qa.map((msg) =>
              msg.sender === "player" ? (
                <PlayerBubble key={msg.id} className="mt-3">
                  {msg.content}
                </PlayerBubble>
              ) : (
                <GuideBubble
                  key={msg.id}
                  avatarSize={36}
                  bubbleClassName="bg-card border border-border"
                  className="mt-3"
                >
                  <p className="text-sm leading-relaxed text-muted-foreground">{msg.content}</p>
                </GuideBubble>
              ),
            )}
            <div ref={qaEndRef} />
          </div>
        )}

        {/* Step 3: Begin button → Guide bubble (recap). Drawer offers the
            "Need to change anything?" routes. */}
        {step === 3 && (
          <div className="space-y-4 mt-2">
            <Button
              onClick={() => handleSubmit()}
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
                "Begin"
              )}
            </Button>
            <GuideBubble
              avatarSize={36}
              bubbleClassName="bg-card border border-border"
              className="mt-6"
            >
              <div className="text-sm leading-relaxed text-muted-foreground space-y-3">
                <p>Great choices! Your prompt:</p>
                <p className="italic text-foreground">{characterDescription.trim()}</p>
                <p>
                  {selectedLength?.label} ({selectedLength?.pages} pages,{" "}
                  {selectedLength?.time})
                </p>
                <p>Ready?</p>
              </div>
            </GuideBubble>
          </div>
        )}
      </div>

      {/* Sticky drawer — same pattern as bookshelf + in-story.
          Contents vary by step:
          - Step 1: "Need suggestions?" → AI-generated character descriptions
          - Step 2: "What do you want to do?" → "Tell me about these lengths"
          - Step 3: "Need to change anything?" → Length / Prompt / Start over */}
      <div
        ref={drawerRef}
        className="absolute bottom-0 left-0 right-0 z-20 rounded-t-xl border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.08)] transition-all duration-300 ease-in-out"
        style={{
          backgroundColor: "#FFF9F0",
          maxHeight: isDrawerOpen ? "50vh" : "5rem",
          overflow: "hidden",
        }}
      >
        <button
          onClick={handleToggleDrawer}
          className="w-full flex flex-col items-center justify-center px-4 gap-4"
          style={{ height: "5rem" }}
        >
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>{drawerPeekLabel}</span>
            <ChevronUp
              className="w-4 h-4 transition-transform duration-300"
              style={{ transform: isDrawerOpen ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </div>
        </button>
        <div
          className="px-4 pb-4 pt-1 space-y-2 overflow-y-auto"
          style={{ maxHeight: "calc(50vh - 5rem)" }}
        >
          {step === 1 && (
            <>
              {/* Regenerate icon at the top of the suggestion list. Only
                  shows once we have at least one suggestion loaded. */}
              {suggestions.length > 0 && (
                <div className="flex items-center justify-end -mt-1 mb-1">
                  <button
                    type="button"
                    onClick={fetchSuggestions}
                    disabled={isLoadingSuggestions}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors disabled:opacity-50"
                    aria-label="Show different suggestions"
                    title="Show different suggestions"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingSuggestions ? "animate-spin" : ""}`} />
                  </button>
                </div>
              )}
              {isLoadingSuggestions && suggestions.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking up some ideas...
                </div>
              )}
              {suggestions.map((s, i) => (
                <ChoiceButton key={`${i}-${s.slice(0, 20)}`} onClick={() => handleSuggestionTap(s)}>
                  {s}
                </ChoiceButton>
              ))}
            </>
          )}
          {step === 2 && (
            <>
              <ChoiceButton onClick={handleAboutLengths}>
                Tell me about these lengths
              </ChoiceButton>
              <ChoiceButton onClick={handleKeepGoing}>
                Can I keep going after a story is done?
              </ChoiceButton>
            </>
          )}
          {step === 3 && (
            <>
              <ChoiceButton onClick={editLengthFromStep3}>Length</ChoiceButton>
              <ChoiceButton onClick={editPromptFromStep3}>Prompt</ChoiceButton>
              <ChoiceButton onClick={startOverFromStep3}>Start over</ChoiceButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
