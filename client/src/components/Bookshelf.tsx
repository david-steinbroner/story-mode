import { useState, useRef, useCallback } from "react";
import { Plus, Check, CheckCircle, Archive, ArchiveRestore, Minus, Settings, Mail, MoreVertical, Trash2, ChevronDown, RefreshCw } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

// Hand-curated spark prompts shown in the empty-state hero and the
// returning-reader "Need a spark?" collapsible. Three are randomly selected
// per mount and the refresh button reshuffles. Spans genre and tone — eerie,
// whimsical, tender, mundane-but-strange — so a regular doesn't see the same
// shape of story suggested twice in a row.
const SPARK_PROMPTS: string[] = [
  // Mystery / detective / crime
  "A small-town librarian who notices the same book has been returned three times this week — by three different people who don't know each other.",
  "A retired forensic accountant called back to consult on a case where every victim's bank account ended with the same suspicious deposit: exactly $11.34.",
  "A night-shift convenience store clerk who starts receiving anonymous packages addressed to customers who haven't walked in yet.",
  "A diner waitress in a town where everyone orders the same breakfast every Tuesday — except for the stranger who just sat at the counter.",
  "A locksmith who's been hired to install a lock on a door that opens onto a wall.",
  "A polygraph examiner who can't get a single truthful answer from a man claiming to be his own brother.",
  "A street magician whose newest assistant keeps appearing in old crime scene photos from the 1960s.",
  "A funeral director planning a service for a woman whose obituary lists three different causes of death depending on which newspaper you read.",
  "A 911 dispatcher receiving identical calls from the same number — each one from a different person in distress.",
  "A pawnshop owner being offered a wedding ring for the fourth time this month — and recognizing the inscription each time.",
  // Fantasy / magical
  "A witch who runs a laundromat that also cleans the metaphysical stains people don't talk about.",
  "A retired knight who runs a bed-and-breakfast for adventurers and has finally received a guest with no shadow.",
  "A mapmaker hired to chart a forest that only appears on Sundays.",
  "A dragon who has spent the last century working as a high school chemistry teacher and just received their teaching evaluation.",
  "A village blacksmith who can hear what each piece of metal wants to become.",
  "A baker whose sourdough starter has been alive for 312 years and has just started leaving notes.",
  "A young apprentice at a wizard's library where the books refuse to be re-shelved by anyone but their original author.",
  "A traveling musician whose lute strings only play in tune when someone in the audience is lying.",
  "A coastal lighthouse keeper trained by their grandmother to recognize which boats belong to the living.",
  "A botanist studying a plant that grows only in places where someone has forgiven another person.",
  "A monastery cook who notices the wine bottles have started arriving full of something other than wine.",
  "A traveling cobbler who repairs boots that have walked through places that don't exist.",
  // Sci-fi / speculative
  "A Mars colony's only therapist whose newest patient claims to be visited nightly by a version of herself who never left Earth.",
  "A retired astronaut who keeps a goldfish that has begun to repeat the exact words of mission control from 1997.",
  "A deep-space salvage crew opening a derelict ship whose black box has been recording for 84 years.",
  "A teenager whose smart speaker has started giving advice that's eerily specific to her grandmother's life.",
  "A janitor at a quantum computing lab who's noticed that her broom always sweeps in the same pattern even when she changes direction.",
  "The night programmer at a small AI startup whose model just emailed her a question it was never trained to ask.",
  "A xenolinguist studying an alien transmission that turns out to be a children's lullaby — translated into every Earth language ever spoken.",
  "A pilot in a future where dreams are licensed media and someone is pirating hers.",
  "A retired air traffic controller hearing the same long-decommissioned flight call its position every Thursday at 3:14 AM.",
  "A backup-singer-turned-archivist cataloging the last vinyl record produced before the magnetic event of 2041.",
  "An asteroid miner who finds, embedded in the rock, a wristwatch from their childhood — already wound.",
  "A weather forecaster on a generation ship realizing the simulated seasons have started predicting events on a planet they've never seen.",
  // Horror / uncanny
  "A house cat that's just discovered the family has been ignoring something in the basement for three years.",
  "A children's choir director who notices that one row of voices doesn't show up on the recording, but does in the room.",
  "A motel night clerk in a town where the same guest checks in every night under a different name.",
  "A grief counselor whose newest group has only one chair filled — but six pairs of shoes in the entryway.",
  "A radio host taking late-night calls who realizes her producer hasn't been in the booth for the last hour.",
  "A school photographer reviewing the day's shoots who finds an extra child in every class portrait.",
  "A young veterinarian whose newest patient is a dog her grandmother used to own — sixty years ago.",
  "A retired magician asked to perform at a private party where every guest is also a magician, and none of them are using sleight of hand.",
  "An EMT responding to a call at an address that her own license lists as her home.",
  "A church organist who notices that one note keeps sustaining after she lifts her fingers.",
  "A house painter hired to repaint a room exactly the way it was when the family moved in — though no one is sure when that was.",
  "A high school janitor who finds the same chalk drawing on a different blackboard every morning, slightly more complete each time.",
  // Whimsy / animal / tender
  "A bookstore cat appointed as the new town mayor by a margin of seventeen votes.",
  "A pug who has decided, after eleven years of patience, that today is the day she opens the back gate.",
  "A team of crows in a midwestern town who have begun returning specific lost objects to specific houses.",
  "A retired carrier pigeon brought back into service because no one else can reach the recipient.",
  "A library mouse who has been quietly correcting the typos in the books overnight.",
  "A grumpy old hedgehog who runs a roadside soup stand for travelers who didn't know they needed soup.",
  "A neighborhood fox whose treasure stash includes three wedding rings, a hearing aid, and a small key that doesn't match anything anyone owns.",
  "A goat who wandered out of a petting zoo nine years ago and has slowly become a respected member of a remote mountain village.",
  "A barista whose regulars include a raven who tips in pull-tab metal and won't accept oat milk.",
  "A street violinist whose case has, for the third week in a row, contained one more dollar than was put in it.",
  "A retired sheepdog asked to come out of retirement for one last very strange flock.",
  "A houseplant that, after eight years of neglect, has decided to do something about it.",
  // Coming-of-age / tender
  "A teenage barista on her last shift before college, taking one last order from a customer she's never seen at this hour.",
  "A high school senior cleaning out her grandfather's woodshop and finding a half-finished project addressed to her by name.",
  "A first-day intern at a museum being shown the storage room where they keep the exhibits that don't quite belong to history.",
  "A nine-year-old whose imaginary friend has just been reported missing.",
  "A grandmother teaching her grandson to read by handing him a letter she wrote to her own grandmother seventy years ago.",
  "A young divorcée moving into her first solo apartment and discovering the previous tenant left a fully labeled spice rack.",
  "An eleventh-grader who's been invited to play her violin at a wedding for a couple she's never met but somehow already knows.",
  "A college senior visiting her childhood home and noticing the closet door is six inches shorter than it used to be.",
  "A first-grade teacher reviewing her students' 'what I want to be' drawings and finding all twenty-six of them say the same word.",
  "A college freshman whose dorm fridge has started gently humming the song her late mother used to sing.",
  // Bureaucratic / mundane-but-strange
  "A DMV employee processing a license renewal for a man whose photo hasn't aged in any of his three previous renewals.",
  "A tax auditor whose newest client's expense report includes receipts from countries that don't exist.",
  "A hotel concierge taking a complaint from a guest about the room 412 — which the hotel has never had.",
  "A wedding planner finalizing details for a ceremony where the bride and groom have asked for 'no human attendees.'",
  "A real estate agent showing a house that keeps adding a room each time she visits.",
  "A pharmacist filling a prescription written in her own handwriting that she has no memory of writing.",
  "A school crossing guard waving through a child who has been six years old for as long as she's been working this corner.",
  "A retired claims adjuster reviewing one final insurance file marked 'pending — applicant deceased; circumstances ongoing.'",
  "A municipal water inspector asked to look at a well that produces drinking water on alternating Tuesdays only.",
  "A city traffic engineer trying to figure out why one intersection's accident rate drops to zero on the third Friday of every month.",
  // Adventure / quest
  "A weathered river guide hired to lead a single passenger to a stretch of water that hasn't been mapped since 1873.",
  "A retired translator pulled out of retirement to interpret a document whose language has officially never been spoken aloud.",
  "A young alpinist preparing for a summit attempt on a peak that wasn't there last season.",
  "A storm chaser tracking a tornado that's been on the ground for forty-three hours and hasn't damaged a single thing.",
  "A blind cartographer being asked to chart a city from memory of a place she has never been.",
  "A retired Coast Guard pilot called to fly a search-and-rescue mission for a ship that radioed in nine hours after it sank.",
  "A surveyor sent to measure a property line that everyone in the village insists is in a slightly different place.",
  "A botanist on a remote field expedition whose plant samples have begun rearranging themselves by color overnight.",
  // Romance / connection
  "A retired ballet dancer who agrees to one private lesson for a stranger whose grace suggests she's done this before.",
  "A widowed beekeeper whose bees have started carrying messages to and from a neighbor she's never spoken to.",
  "A bookstore owner whose newest hire reorganizes the shelves at night — in an order that turns out to spell a name.",
  "Two letter carriers on overlapping routes who have begun finding each other's handwriting in unexpected places.",
  "A baker who notices the same stranger orders the exact pastry her late husband used to make, in the exact way he asked for it.",
  "A divorced woodworker whose newest commission is a chair that the client wants made from a tree she has never seen.",
  "A pianist hired to play a private party where the host requests only songs that haven't been written yet.",
  "A traveling photographer who keeps finding her own face in old photographs of strangers, in cities she's never visited.",
  // Memory / time / identity
  "A retired teacher receiving a thank-you note from a student she never had.",
  "A grandfather watching his granddaughter learn a song she could only have learned from him — but hasn't.",
  "A retired ferry captain whose log shows three crossings she doesn't remember making.",
  "A linguistics professor who has begun to recognize her own handwriting in books published before she was born.",
  "A diary keeper whose entries from yesterday have begun to disagree with her memory of yesterday.",
  "A woman cleaning out her late father's office who finds a sealed envelope addressed to her in his handwriting — postmarked next month.",
];

// Pick N distinct random sparks from the pool. Uses Fisher-Yates partial
// shuffle so a single mount can grab a stable trio without repeats.
function pickSparks(count: number): string[] {
  const pool = [...SPARK_PROMPTS];
  const out: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
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
  // 3 random sparks chosen per mount. Refresh button calls reshuffleSparks
  // to draw a new trio from the pool without remounting the component.
  const [sparks, setSparks] = useState<string[]>(() => pickSparks(3));
  const reshuffleSparks = useCallback(() => setSparks(pickSparks(3)), []);

  // Delete-confirmation state. Null = closed; { id, title } = dialog open for
  // that story. Soft-delete with a 30-day server-side grace period; the user
  // sees it removed from the bookshelf immediately. Mirrors the styled
  // AlertDialog pattern used in ChatInterface (End Story / Regenerate).
  const [storyToDelete, setStoryToDelete] = useState<{ id: string; title: string } | null>(null);

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

  // Open the styled confirmation dialog. Actual delete fires when the user
  // confirms inside the dialog (see confirmDeleteStory below).
  const deleteStory = useCallback((storyId: string, title: string) => {
    setStoryToDelete({ id: storyId, title });
  }, []);

  const confirmDeleteStory = useCallback(async () => {
    if (!storyToDelete) return;
    const { id } = storyToDelete;
    setStoryToDelete(null);
    try {
      await apiRequest('DELETE', `/api/stories/${id}`);
      queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
    } catch (error) {
      console.error('Failed to delete story:', error);
    }
  }, [storyToDelete]);

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
    <div
      className={`h-dvh overflow-y-auto bg-background px-4 pb-8 ${className}`}
      style={{ fontSize: `${currentFontSize.px}px` }}
    >
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

      {/* Guide greeting. For a first-visit reader (empty shelf) the bubble
          carries the full onboarding pitch — welcome, the "what this is"
          line, and the 3-step explainer — so the Guide is the one voice
          doing the talking, not a hero block competing alongside her. */}
      <div className="mb-6 flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <GuideAvatar size={36} />
        </div>
        <div
          className="bg-card border border-border px-4 py-3 text-sm leading-relaxed text-muted-foreground max-w-sm"
          style={{ borderRadius: "2px 16px 16px 16px" }}
        >
          <p>{getGreeting()}</p>
          {stories.length === 0 && (
            <>
              <p className="mt-3 text-foreground">
                Tell me about yourself. I'll write the story.
              </p>
              <ol className="mt-3 space-y-1.5 list-decimal list-inside marker:text-muted-foreground/60">
                <li>Describe a character in a sentence or two.</li>
                <li>Your Guide builds a world around them.</li>
                <li>Tap choices to shape what happens next.</li>
              </ol>
            </>
          )}
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
              spark without scrolling away from their library. Sparks are
              picked at mount and can be reshuffled in-place via the refresh
              icon — mirrors the in-story regenerate affordance. */}
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
              <>
                <div className="flex items-center justify-end -mt-1 mb-1">
                  <button
                    type="button"
                    onClick={reshuffleSparks}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
                    aria-label="Show different sparks"
                    title="Show different sparks"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {sparks.map((example, i) => (
                    <button
                      key={`${example}-${i}`}
                      onClick={() => onNewStory(example)}
                      className="w-full text-left bg-card border border-border rounded-lg p-3 text-sm text-foreground/90 leading-relaxed hover:bg-accent/10 hover:border-primary/40 transition-colors active:scale-[0.98]"
                      style={{ minHeight: 44 }}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </>
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

      {/* First-visit hero — only when the shelf is completely empty. The
          welcome + "what this is" + 3-step explainer now live inside the
          Guide bubble above, so this section is just the spark prompts and
          the manual start CTA. */}
      {stories.length === 0 && (
        <div className="mt-4 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground/70">
                Need a spark? Tap one to start.
              </p>
              <button
                type="button"
                onClick={reshuffleSparks}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
                aria-label="Show different sparks"
                title="Show different sparks"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {sparks.map((example, i) => (
                <button
                  key={`${example}-${i}`}
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
      <p className="text-center text-[10px] text-muted-foreground/40 mt-6 pb-2">v1.5.0</p>

      {/* Delete-story confirmation. Soft delete with a 30-day server-side
          grace period — copy makes the recovery window explicit so a reader
          tapping Delete knows what just happened. */}
      <AlertDialog
        open={storyToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setStoryToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this story?</AlertDialogTitle>
            <AlertDialogDescription>
              It'll stay on our servers for 30 days in case you change your mind, then it's gone for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteStory}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
