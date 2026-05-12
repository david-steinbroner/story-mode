import { useState, useRef, useCallback } from "react";
import { Plus, Check, CheckCircle, Archive, ArchiveRestore, Minus, Settings, Mail, MoreVertical, Trash2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { analytics } from "@/lib/posthog";
import GuideAvatar from "./GuideAvatar";
import type { GameState } from "@shared/schema";

// --- Long-press hook ---
function useLongPress(onLongPress: () => void, delay = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const start = useCallback(() => {
    didLongPress.current = false;
    timerRef.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress();
    }, delay);
  }, [onLongPress, delay]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
    onMouseDown: start,
    onMouseUp: cancel,
    onMouseLeave: cancel,
    didLongPress,
  };
}

interface BookshelfProps {
  stories: GameState[];
  onContinueStory: (storyId: string) => void;
  onNewStory: (seedDescription?: string) => void;
  className?: string;
}

// First-visit examples shown in the empty-state hero. Each is tappable and
// pre-fills the character description in the new-story wizard. Picked to span
// genre/vibe so a returning user isn't pushed toward the same shape twice.
const HERO_EXAMPLES = [
  "A grumpy vole on the village mail route just received a humming parcel addressed to \"The Last One Awake.\"",
  "A retired space cartographer accepting one last contract on a planet that doesn't appear on any map.",
  "A mailman just delivered today's mail to a house that wasn't there yesterday — and isn't there now.",
];

// Genre color mapping
const GENRE_SPINES: Record<string, string> = {
  fantasy: "from-amber-300 to-orange-400",
  mystery: "from-blue-300 to-indigo-400",
  scifi: "from-cyan-300 to-teal-400",
  romance: "from-rose-300 to-pink-400",
  horror: "from-purple-300 to-violet-400",
};

const GENRE_LABELS: Record<string, string> = {
  fantasy: "Fantasy",
  mystery: "Mystery",
  scifi: "Sci-Fi",
  romance: "Romance",
  horror: "Horror",
};

function getStoryTitle(story: GameState): string {
  if (story.storyTitle) return story.storyTitle;
  return "Untitled Story";
}

function BookSpine({
  title,
  genre,
  currentPage,
  totalPages,
  isComplete,
  isNew,
  onClick,
  onArchive,
  onUnarchive,
  onEndStory,
  onDelete,
  isArchived,
}: {
  title?: string;
  genre?: string;
  currentPage?: number;
  totalPages?: number;
  isComplete?: boolean;
  isNew?: boolean;
  onClick: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onEndStory?: () => void;
  onDelete?: () => void;
  isArchived?: boolean;
}) {
  const spineGradient = genre ? GENRE_SPINES[genre] || GENRE_SPINES.fantasy : "";
  const [popoverOpen, setPopoverOpen] = useState(false);

  const hasActions = !!(onArchive || onUnarchive || onEndStory || onDelete);
  const longPress = useLongPress(() => {
    if (hasActions && !isNew) {
      setPopoverOpen(true);
    }
  });

  const spineContent = (
    <div
      className="group flex flex-col items-center gap-2 focus:outline-none select-none"
      style={{ width: 110 }}
    >
      {/* Book spine */}
      <div
        className={`relative transition-transform duration-200 group-hover:-translate-y-2 group-active:scale-95 ${
          isNew
            ? "border-2 border-dashed border-[hsl(var(--muted-foreground))]/30 bg-[hsl(var(--muted))]"
            : `bg-gradient-to-br ${spineGradient}`
        } ${isArchived ? "opacity-60" : ""}`}
        style={{
          width: 56,
          height: 76,
          borderRadius: "3px 6px 6px 3px",
          boxShadow: isNew
            ? "none"
            : "2px 2px 4px rgba(0,0,0,0.15), -1px 0 2px rgba(0,0,0,0.05)",
        }}
      >
        {/* Spine detail line */}
        {!isNew && (
          <div className="absolute left-[6px] top-0 bottom-0 w-[1px] bg-black/10" />
        )}

        {/* + icon for new story spine */}
        {isNew && (
          <div className="absolute inset-0 flex items-center justify-center px-1">
            <Plus className="w-5 h-5 text-[hsl(var(--muted-foreground))]/50" />
          </div>
        )}

        {/* Complete indicator */}
        {isComplete && !isArchived && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full flex items-center justify-center">
            <Check size={10} className="text-white" strokeWidth={3} />
          </div>
        )}

        {/* Archive indicator */}
        {isArchived && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#C9B6E4] rounded-full flex items-center justify-center">
            <Archive size={8} className="text-white" strokeWidth={3} />
          </div>
        )}

        {/* Bookmark for in-progress */}
        {!isComplete && !isNew && (currentPage || 0) > 0 && (
          <div
            className="absolute -top-1 right-1 w-2 h-5 bg-rose-400"
            style={{
              clipPath:
                "polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%)",
            }}
          />
        )}
      </div>

      {/* Label */}
      <div className="text-center w-full">
        <p className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] leading-tight line-clamp-2">
          {isNew ? "New Story" : title || "Untitled"}
        </p>
        {!isNew && totalPages && (
          <p className="text-[9px] text-[hsl(var(--muted-foreground))]/60 mt-0.5">
            {isComplete
              ? "Complete"
              : `p.${currentPage || 0}/${totalPages}`}
          </p>
        )}
      </div>
    </div>
  );

  // Stories with actions: long-press (mobile) + kebab button (desktop) both
  // open the same popover. The kebab is the discoverable affordance for users
  // who can't long-press with a mouse.
  if (hasActions) {
    return (
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <div className="relative">
          <button
            onClick={(e) => {
              // If long press just fired, don't also navigate
              if (longPress.didLongPress.current) {
                e.preventDefault();
                longPress.didLongPress.current = false;
                return;
              }
              onClick();
            }}
            className="focus:outline-none"
            {...{
              onTouchStart: longPress.onTouchStart,
              onTouchEnd: longPress.onTouchEnd,
              onTouchMove: longPress.onTouchMove,
              onMouseDown: longPress.onMouseDown,
              onMouseUp: longPress.onMouseUp,
              onMouseLeave: longPress.onMouseLeave,
            }}
          >
            {spineContent}
          </button>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-background/80 backdrop-blur-sm border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
              aria-label="Story actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
        </div>
        <PopoverContent
          className="w-auto p-1 bg-[#FFF9F0] border border-[#C9B6E4]/30"
          side="top"
          sideOffset={8}
        >
          {onEndStory && (
            <button
              onClick={() => {
                onEndStory();
                setPopoverOpen(false);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-[#6C7A89] hover:bg-[#C9B6E4]/15 transition-colors w-full"
              style={{ minHeight: 44, minWidth: 44 }}
            >
              <CheckCircle size={16} className="text-[#A8E6CF]" />
              <span>End Story</span>
            </button>
          )}
          {onArchive && (
            <button
              onClick={() => {
                onArchive();
                setPopoverOpen(false);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-[#6C7A89] hover:bg-[#C9B6E4]/15 transition-colors w-full"
              style={{ minHeight: 44, minWidth: 44 }}
            >
              <Archive size={16} className="text-[#C9B6E4]" />
              <span>Archive</span>
            </button>
          )}
          {onUnarchive && (
            <button
              onClick={() => {
                onUnarchive();
                setPopoverOpen(false);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-[#6C7A89] hover:bg-[#C9B6E4]/15 transition-colors w-full"
              style={{ minHeight: 44, minWidth: 44 }}
            >
              <ArchiveRestore size={16} className="text-[#A8E6CF]" />
              <span>Unarchive</span>
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => {
                onDelete();
                setPopoverOpen(false);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors w-full"
              style={{ minHeight: 44, minWidth: 44 }}
            >
              <Trash2 size={16} />
              <span>Delete</span>
            </button>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  // Default: simple button (active stories, new story)
  return (
    <button onClick={onClick} className="focus:outline-none">
      {spineContent}
    </button>
  );
}

// Wooden shelf component
function WoodenShelf() {
  return (
    <div
      className="h-3 rounded-sm"
      style={{
        background:
          "linear-gradient(180deg, #c4a882 0%, #b8986e 40%, #a88b5e 60%, #c4a882 100%)",
        boxShadow:
          "0 4px 8px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.2), inset 0 -2px 4px rgba(0,0,0,0.15)",
      }}
    />
  );
}

// Font size constants — shared with ChatInterface via same localStorage key
const FONT_SIZES = [
  { label: "Small", px: 14 },
  { label: "Medium", px: 16 },
  { label: "Large", px: 18 },
  { label: "X-Large", px: 20 },
] as const;

const FONT_SIZE_STORAGE_KEY = "storymode-font-size";

function getInitialFontSizeIndex(): number {
  try {
    const stored = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    if (stored !== null) {
      const idx = parseInt(stored, 10);
      if (idx >= 0 && idx < FONT_SIZES.length) return idx;
    }
  } catch {}
  return 1; // Default to Medium
}

export default function Bookshelf({
  stories,
  onContinueStory: rawOnContinueStory,
  onNewStory: rawOnNewStory,
  className = "",
}: BookshelfProps) {
  const [showArchive, setShowArchive] = useState(false);
  const [showSparks, setShowSparks] = useState(false);
  const [fontSizeIndex, setFontSizeIndex] = useState(getInitialFontSizeIndex);

  // Funnel-tracking wrappers so every entry point into a story is logged once
  // at the source instead of sprinkled at six callsites.
  const onNewStory = useCallback((seedDescription?: string) => {
    analytics.trackEvent("new_story_clicked", {
      storyCount: stories.length,
      seeded: !!seedDescription,
    });
    rawOnNewStory(seedDescription);
  }, [rawOnNewStory, stories.length]);

  const onContinueStory = useCallback((storyId: string) => {
    const story = stories.find((s) => s.storyId === storyId);
    analytics.trackEvent("continue_story_clicked", {
      currentPage: story?.currentPage,
      totalPages: story?.totalPages,
      storyComplete: story?.storyComplete,
      storyArchived: story?.storyArchived,
    });
    rawOnContinueStory(storyId);
  }, [rawOnContinueStory, stories]);

  const currentFontSize = FONT_SIZES[fontSizeIndex];

  const changeFontSize = (delta: number) => {
    setFontSizeIndex((prev) => {
      const next = Math.max(0, Math.min(FONT_SIZES.length - 1, prev + delta));
      try { localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  };

  const archiveStory = useCallback(async (storyId: string) => {
    try {
      await apiRequest('PATCH', `/api/stories/${storyId}/archive`, { archived: true });
      queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
    } catch (error) {
      console.error('Failed to archive story:', error);
    }
  }, []);

  const unarchiveStory = useCallback(async (storyId: string) => {
    try {
      await apiRequest('PATCH', `/api/stories/${storyId}/archive`, { archived: false });
      queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
    } catch (error) {
      console.error('Failed to unarchive story:', error);
    }
  }, []);

  const deleteStory = useCallback(async (storyId: string, title: string) => {
    // Confirm via the native dialog. Archive is the soft-delete path; this is
    // the permanent removal, so we make the user say yes once.
    if (!window.confirm(`Delete "${title}" forever? This can't be undone.`)) return;
    try {
      await apiRequest('DELETE', `/api/stories/${storyId}`);
      queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
    } catch (error) {
      console.error('Failed to delete story:', error);
    }
  }, []);

  const endStory = useCallback(async (storyId: string) => {
    try {
      const sessionId = localStorage.getItem('sessionId') || '';
      const res = await fetch('/api/game-state', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId,
          'x-story-id': storyId,
        },
        body: JSON.stringify({ storyComplete: true }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to end story: ${res.status}`);
      queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
    } catch (error) {
      console.error('Failed to end story:', error);
    }
  }, []);

  const activeStories = stories.filter(s => !s.storyComplete && !s.storyArchived && s.totalPages && s.totalPages > 0);
  const completedStories = stories.filter(s => s.storyComplete && !s.storyArchived);
  const archivedStories = stories.filter(s => s.storyArchived);

  // Guide greeting based on library state
  const getGreeting = () => {
    if (stories.length === 0) {
      return "Welcome! Your shelf is empty — shall we start your first story?";
    }
    if (activeStories.length > 0 && completedStories.length > 0) {
      return `You have ${activeStories.length} story in progress and ${completedStories.length} finished. What next?`;
    }
    if (activeStories.length > 0) {
      const story = activeStories[0];
      const pct = (story.currentPage || 0) / (story.totalPages || 1);
      if (pct < 0.3) return "Your story is just beginning. Shall we continue?";
      if (pct < 0.7) return "Things are getting interesting... pick up where you left off?";
      return "You're nearing the end. The climax awaits!";
    }
    return `You've finished ${completedStories.length} ${completedStories.length === 1 ? "story" : "stories"}! Ready for your next adventure?`;
  };

  return (
    <div className={`min-h-screen bg-background px-4 pb-8 ${className}`} style={{ fontSize: `${currentFontSize.px}px` }}>
      {/* Header */}
      <div className="pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Story Mode</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Your Library</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="focus:outline-none" style={{ minHeight: 44, minWidth: 44 }}>
              <GuideAvatar size={36} animate={false} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" style={{ backgroundColor: '#FFF9F0' }}>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Text Size
            </DropdownMenuLabel>
            <div className="flex items-center justify-between px-2 py-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => changeFontSize(-1)}
                disabled={fontSizeIndex === 0}
              >
                <Minus className="w-3 h-3" />
              </Button>
              <span className="text-sm text-foreground">{currentFontSize.label}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => changeFontSize(1)}
                disabled={fontSizeIndex === FONT_SIZES.length - 1}
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
            {archivedStories.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowArchive(!showArchive)}>
                  <Archive className="w-4 h-4 mr-2" />
                  {showArchive ? "Hide Archive" : "Show Archive"}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                analytics.trackEvent("feedback_mailto_clicked", { from: "bookshelf" });
                window.location.href = "mailto:feedback@mystorymode.com?subject=Story%20Mode%20feedback";
              }}
            >
              <Mail className="w-4 h-4 mr-2" />
              Send Feedback
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Guide greeting */}
      <div className="mb-6 flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <GuideAvatar size={36} />
        </div>
        <div
          className="bg-card border border-border px-4 py-3 text-sm leading-relaxed text-muted-foreground max-w-sm"
          style={{ borderRadius: "2px 16px 16px 16px" }}
        >
          {getGreeting()}
        </div>
      </div>

      {/* Currently Reading shelf */}
      {activeStories.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Currently Reading
            </h2>
          </div>
          <div className="relative">
            <div className="flex items-start gap-4 px-3 pb-3 pt-1 overflow-x-auto">
              {activeStories.map(story => (
                <BookSpine
                  key={story.storyId}
                  title={getStoryTitle(story)}
                  genre={story.genre || "fantasy"}
                  currentPage={story.currentPage || 0}
                  totalPages={story.totalPages || 0}
                  isComplete={false}
                  onClick={() => onContinueStory(story.storyId!)}
                  onEndStory={() => endStory(story.storyId!)}
                  onArchive={() => archiveStory(story.storyId!)}
                />
              ))}
              <BookSpine isNew onClick={() => onNewStory()} />
            </div>
            <WoodenShelf />
          </div>

          {/* Quick continue card for most recent active story */}
          {activeStories[0] && (
            <button
              onClick={() => onContinueStory(activeStories[0].storyId!)}
              className="w-full mt-4 text-left bg-card border border-border rounded-lg p-4 hover:bg-accent/10 transition-colors active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    Continue: {getStoryTitle(activeStories[0])}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress
                      value={
                        ((activeStories[0].currentPage || 0) /
                          (activeStories[0].totalPages || 1)) *
                        100
                      }
                      className="h-1.5 flex-1"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">
                      {activeStories[0].currentPage}/{activeStories[0].totalPages}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Start a new story — always visible when stories exist */}
      {stories.length > 0 && (
        <div className="mb-2">
          {/* Show standalone shelf with + spine only when no active stories (active shelf already has one) */}
          {activeStories.length === 0 && (
            <div className="relative">
              <div className="flex items-start gap-4 px-3 pb-3 pt-1">
                <BookSpine isNew onClick={() => onNewStory()} />
              </div>
              <WoodenShelf />
            </div>
          )}
          <button
            onClick={() => onNewStory()}
            className="w-full mt-4 bg-primary text-primary-foreground rounded-lg p-4 font-semibold text-base flex items-center justify-center hover:opacity-90 transition-opacity active:scale-[0.98]"
          >
            Start a New Story
          </button>

          {/* Collapsible inspiration prompts. Lives here (not the empty-state
              hero) so a returning reader with a full shelf can still grab a
              spark without scrolling away from their library. */}
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowSparks((s) => !s)}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              style={{ minHeight: 44 }}
              aria-expanded={showSparks}
            >
              <span>Need a spark?</span>
              <ChevronDown
                className="w-3.5 h-3.5 transition-transform duration-200"
                style={{ transform: showSparks ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </button>
            {showSparks && (
              <div className="space-y-2 mt-1">
                {HERO_EXAMPLES.map((example, i) => (
                  <button
                    key={i}
                    onClick={() => onNewStory(example)}
                    className="w-full text-left bg-card border border-border rounded-lg p-3 text-sm text-foreground/90 leading-relaxed hover:bg-accent/10 hover:border-primary/40 transition-colors active:scale-[0.98]"
                    style={{ minHeight: 44 }}
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Completed shelf */}
      {completedStories.length > 0 && (
        <div className="mb-2 mt-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Finished
            </h2>
            {archivedStories.length > 0 && (
              <button
                onClick={() => setShowArchive(!showArchive)}
                className="flex items-center gap-1 text-xs text-[#C9B6E4] hover:text-[#C9B6E4]/80 transition-colors"
                style={{ minHeight: 44, minWidth: 44, justifyContent: "flex-end" }}
              >
                <Archive size={12} />
                <span>Archive ({archivedStories.length})</span>
              </button>
            )}
          </div>
          <div className="relative">
            <div className="flex items-start gap-4 px-3 pb-3 pt-1 overflow-x-auto">
              {completedStories.map(story => (
                <BookSpine
                  key={story.storyId}
                  title={getStoryTitle(story)}
                  genre={story.genre || "fantasy"}
                  currentPage={story.totalPages || 0}
                  totalPages={story.totalPages || 0}
                  isComplete={true}
                  onClick={() => onContinueStory(story.storyId!)}
                  onArchive={() => archiveStory(story.storyId!)}
                />
              ))}
            </div>
            <WoodenShelf />
          </div>
          <p className="text-[10px] text-[#6C7A89]/40 mt-2 px-1">
            Tap a book to read, or use the ⋯ menu for options
          </p>
        </div>
      )}

      {/* Archive section */}
      {showArchive && archivedStories.length > 0 && (
        <div className="mb-2 mt-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <Archive size={14} className="text-[#C9B6E4]" />
              Archive
            </h2>
            <button
              onClick={() => setShowArchive(false)}
              className="text-xs text-[#6C7A89]/60 hover:text-[#6C7A89] transition-colors"
              style={{ minHeight: 44, minWidth: 44, display: "flex", alignItems: "center", justifyContent: "flex-end" }}
            >
              Hide
            </button>
          </div>
          <div className="relative">
            <div className="flex items-start gap-4 px-3 pb-3 pt-1 overflow-x-auto">
              {archivedStories.map(story => (
                <BookSpine
                  key={story.storyId}
                  title={getStoryTitle(story)}
                  genre={story.genre || "fantasy"}
                  currentPage={story.totalPages || 0}
                  totalPages={story.totalPages || 0}
                  isComplete={true}
                  isArchived={true}
                  onClick={() => onContinueStory(story.storyId!)}
                  onUnarchive={() => unarchiveStory(story.storyId!)}
                  onDelete={() => deleteStory(story.storyId!, getStoryTitle(story))}
                />
              ))}
            </div>
            <WoodenShelf />
          </div>
          <p className="text-[10px] text-[#6C7A89]/40 mt-2 px-1">
            Hold a book to unarchive it
          </p>
        </div>
      )}

      {/* First-visit hero — only when the shelf is completely empty */}
      {stories.length === 0 && (
        <div className="mt-4 space-y-6">
          <div className="text-center px-2">
            <h2 className="font-serif text-2xl sm:text-3xl text-foreground leading-snug">
              Tell me about yourself.
              <br />
              I'll write the story.
            </h2>
          </div>

          <ol className="space-y-3 max-w-md mx-auto px-2">
            {[
              "Describe a character in a sentence or two.",
              "Your Guide builds a world around them.",
              "Tap choices to shape what happens next.",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="flex-shrink-0 w-6 h-6 rounded-full bg-secondary/40 text-foreground text-xs font-semibold flex items-center justify-center mt-0.5"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <p className="text-sm text-muted-foreground leading-relaxed">{step}</p>
              </li>
            ))}
          </ol>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground/70 px-2">
              Need a spark? Tap one to start.
            </p>
            <div className="space-y-2">
              {HERO_EXAMPLES.map((example, i) => (
                <button
                  key={i}
                  onClick={() => onNewStory(example)}
                  className="w-full text-left bg-card border border-border rounded-lg p-3 text-sm text-foreground/90 leading-relaxed hover:bg-accent/10 hover:border-primary/40 transition-colors active:scale-[0.98]"
                  style={{ minHeight: 44 }}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => onNewStory()}
            className="w-full bg-primary text-primary-foreground rounded-lg p-4 font-semibold text-base flex items-center justify-center hover:opacity-90 transition-opacity active:scale-[0.98]"
          >
            Start from scratch
          </button>
        </div>
      )}

      {/* Version */}
      <p className="text-center text-[10px] text-muted-foreground/40 mt-6 pb-2">v1.0.0</p>
    </div>
  );
}
