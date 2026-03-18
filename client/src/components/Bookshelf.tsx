import { useState, useRef, useCallback } from "react";
import { Plus, Check, CheckCircle, Archive, ArchiveRestore, ChevronRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { queryClient } from "@/lib/queryClient";
import type { GameState } from "@shared/schema";

// --- Archive localStorage helpers ---
const ARCHIVE_KEY = "story-mode-archived-ids";

function getArchivedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function setArchivedIds(ids: Set<string>) {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(Array.from(ids)));
}

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
  onNewStory: () => void;
  className?: string;
}

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
  isArchived?: boolean;
}) {
  const spineGradient = genre ? GENRE_SPINES[genre] || GENRE_SPINES.fantasy : "";
  const [popoverOpen, setPopoverOpen] = useState(false);

  const longPress = useLongPress(() => {
    if ((onArchive || onUnarchive || onEndStory) && !isNew) {
      setPopoverOpen(true);
    }
  });

  const spineContent = (
    <div
      className="group flex flex-col items-center gap-2 focus:outline-none select-none"
      style={{ width: 80 }}
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

        {/* Title or + icon */}
        <div className="absolute inset-0 flex items-center justify-center px-1">
          {isNew ? (
            <Plus className="w-5 h-5 text-[hsl(var(--muted-foreground))]/50" />
          ) : (
            <span
              className="text-[7px] font-semibold text-center leading-tight text-black/40"
              style={{
                writingMode:
                  (title?.length || 0) > 12 ? "vertical-rl" : undefined,
              }}
            >
              {title || "Story"}
            </span>
          )}
        </div>

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
        <p className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] leading-tight truncate">
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

  // Stories with long-press actions get a popover
  if (onArchive || onUnarchive || onEndStory) {
    return (
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
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
        </PopoverTrigger>
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

// Guide avatar
function GuideAvatar({ size = 44 }: { size?: number }) {
  return (
    <div className="animate-bounce-slow" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <defs>
          <radialGradient id="guideGlow" cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor="#FFD6A5" />
            <stop offset="60%" stopColor="#FFB6B9" />
            <stop offset="100%" stopColor="#C9B6E4" />
          </radialGradient>
          <radialGradient id="innerGlow" cx="50%" cy="35%" r="40%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.8)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="48" r="38" fill="url(#guideGlow)" opacity="0.3" />
        <ellipse cx="50" cy="50" rx="28" ry="30" fill="url(#guideGlow)" />
        <ellipse cx="50" cy="44" rx="20" ry="18" fill="url(#innerGlow)" />
        <ellipse cx="40" cy="46" rx="4" ry="4.5" fill="#5a4a3a" />
        <ellipse cx="60" cy="46" rx="4" ry="4.5" fill="#5a4a3a" />
        <circle cx="41.5" cy="44.5" r="1.5" fill="white" />
        <circle cx="61.5" cy="44.5" r="1.5" fill="white" />
        <path
          d="M 40 56 Q 50 63 60 56"
          fill="none"
          stroke="#5a4a3a"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="72" cy="30" r="2" fill="#FFD6A5" opacity="0.8" />
        <circle cx="28" cy="35" r="1.5" fill="#C9B6E4" opacity="0.6" />
      </svg>
    </div>
  );
}

export default function Bookshelf({
  stories,
  onContinueStory,
  onNewStory,
  className = "",
}: BookshelfProps) {
  const [archivedIds, setArchivedIdsState] = useState<Set<string>>(getArchivedIds);
  const [showArchive, setShowArchive] = useState(false);

  const archiveStory = useCallback((storyId: string) => {
    setArchivedIdsState(prev => {
      const next = new Set(prev);
      next.add(storyId);
      setArchivedIds(next);
      return next;
    });
  }, []);

  const unarchiveStory = useCallback((storyId: string) => {
    setArchivedIdsState(prev => {
      const next = new Set(prev);
      next.delete(storyId);
      setArchivedIds(next);
      return next;
    });
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

  const activeStories = stories.filter(s => !s.storyComplete && s.totalPages && s.totalPages > 0);
  const completedStories = stories.filter(s => s.storyComplete && !archivedIds.has(s.storyId!));
  const archivedStories = stories.filter(s => s.storyComplete && archivedIds.has(s.storyId!));

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
    <div className={`min-h-screen bg-background px-4 pb-8 ${className}`}>
      {/* Header */}
      <div className="pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Story Mode</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Your Library</p>
        </div>
        <GuideAvatar size={44} />
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
            <div className="flex gap-4 px-3 pb-3 pt-1 overflow-x-auto">
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
              <BookSpine isNew onClick={onNewStory} />
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
              <div className="flex gap-4 px-3 pb-3 pt-1">
                <BookSpine isNew onClick={onNewStory} />
              </div>
              <WoodenShelf />
            </div>
          )}
          <button
            onClick={onNewStory}
            className="w-full mt-4 bg-primary text-primary-foreground rounded-lg p-4 font-semibold text-base flex items-center justify-center hover:opacity-90 transition-opacity active:scale-[0.98]"
          >
            Start a New Story
          </button>
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
            <div className="flex gap-4 px-3 pb-3 pt-1 overflow-x-auto">
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
            Hold a book to archive it
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
            <div className="flex gap-4 px-3 pb-3 pt-1 overflow-x-auto">
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

      {/* Empty state — no stories yet */}
      {stories.length === 0 && (
        <div className="mt-4">
          <div className="relative mb-6">
            <div className="flex gap-4 px-3 pb-3 pt-1 justify-center">
              <BookSpine isNew onClick={onNewStory} />
            </div>
            <WoodenShelf />
          </div>

          <button
            onClick={onNewStory}
            className="w-full bg-primary text-primary-foreground rounded-lg p-4 font-semibold text-base flex items-center justify-center hover:opacity-90 transition-opacity active:scale-[0.98]"
          >
            Start Your First Story
          </button>
        </div>
      )}

      {/* Community teaser (future) */}
      <div className="mt-8">
        <button
          className="w-full text-left bg-card border border-border rounded-lg p-4 opacity-50 cursor-not-allowed"
          disabled
        >
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground">
                Public Library
              </h3>
              <p className="text-xs text-muted-foreground">
                Community stories coming soon
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Version */}
      <p className="text-center text-[10px] text-muted-foreground/40 mt-6 pb-2">v0.6.4</p>
    </div>
  );
}
