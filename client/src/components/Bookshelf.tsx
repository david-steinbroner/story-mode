import { BookOpen, Plus, Star, ChevronRight, Users, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { GameState } from "@shared/schema";

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
  const genreLabel = GENRE_LABELS[story.genre || ""] || "Story";
  return `${genreLabel} Story`;
}

function BookSpine({
  title,
  genre,
  currentPage,
  totalPages,
  isComplete,
  isNew,
  onClick,
}: {
  title?: string;
  genre?: string;
  currentPage?: number;
  totalPages?: number;
  isComplete?: boolean;
  isNew?: boolean;
  onClick: () => void;
}) {
  const spineGradient = genre ? GENRE_SPINES[genre] || GENRE_SPINES.fantasy : "";

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-2 focus:outline-none"
      style={{ width: 80 }}
    >
      {/* Book spine */}
      <div
        className={`relative transition-transform duration-200 group-hover:-translate-y-2 group-active:scale-95 ${
          isNew
            ? "border-2 border-dashed border-[hsl(var(--muted-foreground))]/30 bg-[hsl(var(--muted))]"
            : `bg-gradient-to-br ${spineGradient}`
        }`}
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

        {/* Complete star */}
        {isComplete && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full flex items-center justify-center">
            <Star size={10} className="text-white fill-white" />
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
  const activeStories = stories.filter(s => !s.storyComplete && s.totalPages && s.totalPages > 0);
  const completedStories = stories.filter(s => s.storyComplete);

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
                <BookOpen className="w-5 h-5 text-primary shrink-0" />
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
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </button>
          )}
        </div>
      )}

      {/* Completed shelf */}
      {completedStories.length > 0 && (
        <div className="mb-2 mt-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Finished
            </h2>
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
                />
              ))}
            </div>
            <WoodenShelf />
          </div>
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
            className="w-full bg-primary text-primary-foreground rounded-lg p-4 font-semibold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity active:scale-[0.98]"
          >
            <Sparkles className="w-5 h-5" />
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
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-300 to-green-300 flex items-center justify-center">
              <Users size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground">
                Public Library
              </h3>
              <p className="text-xs text-muted-foreground">
                Community stories coming soon
              </p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </div>
        </button>
      </div>
    </div>
  );
}
