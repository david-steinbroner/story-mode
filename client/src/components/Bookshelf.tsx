import { useState, useRef, useCallback, useEffect } from "react";
import { Plus, Check, CheckCircle, Archive, ArchiveRestore, Mail, MoreVertical, Trash2, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import GuideBubble from "./GuideBubble";
import CenteredHeader from "./CenteredHeader";
import ChoiceButton from "./ChoiceButton";
import PlayerBubble from "./PlayerBubble";
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

// Font-size controls were removed from the Bookshelf in v1.8.0 — the
// adjuster didn't visually affect anything here (Tailwind text classes
// overrode the container's font-size). Per docs/design-system.md, font
// scaling is a story-screen affordance only. The ChatInterface still
// owns the FONT_SIZES state + UI, and the same localStorage key
// (`storymode-font-size`) persists the setting across surfaces.

export default function Bookshelf({
  stories,
  onContinueStory: rawOnContinueStory,
  onNewStory: rawOnNewStory,
  className = "",
}: BookshelfProps) {
  // Tabbed library (v1.8.1): one shelf area, three possible tabs. Always
  // default to Currently Reading (v1.8.4) — the auto-switch effect below
  // falls through to Finished or Archive when Currently Reading is empty
  // once stories load. Fixes a bug where stories=[] on initial mount (data
  // still in flight from React Query) caused the lazy initializer to pick
  // "archive" as the default if archive ended up being the only non-empty
  // bucket.
  type TabKey = "reading" | "finished" | "archive";
  const [activeTab, setActiveTab] = useState<TabKey>("reading");

  // Bookshelf drawer state. Same peek/expand pattern as the in-story
  // drawer in ChatInterface — kept inline (not extracted) because the
  // in-story drawer has additional concerns (custom-input field,
  // regenerate dialog, validators) that don't apply here.
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Bookshelf Q&A history (ephemeral — clears on every visit because the
  // Bookshelf remounts when the user enters a story and comes back). Each
  // entry is a player tap or a Guide response. Renders as messenger-style
  // bubbles below the welcome greeting.
  type QaMessage = { id: string; sender: "player" | "guide"; content: string };
  const [qaMessages, setQaMessages] = useState<QaMessage[]>([]);
  const qaEndRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Delete-confirmation state. Null = closed; { id, title } = dialog open for
  // that story. Soft-delete with a 30-day server-side grace period; the user
  // sees it removed from the bookshelf immediately. Mirrors the styled
  // AlertDialog pattern used in ChatInterface (End Story / Regenerate).
  const [storyToDelete, setStoryToDelete] = useState<{ id: string; title: string } | null>(null);

  // "Welcome back." gate: prepended to the Guide greeting only when 12+
  // hours have passed since we last greeted this user. Rolling window —
  // anchored to the last time we said it (not to last visit), so users
  // who check back every few hours don't see "welcome back" repeatedly.
  // Stored in localStorage so it persists across sessions and tabs.
  const WELCOME_BACK_GAP_MS = 12 * 60 * 60 * 1000;
  const [showWelcomeBack] = useState(() => {
    if (typeof window === "undefined") return false;
    const last = parseInt(localStorage.getItem("lastWelcomeAt") || "0", 10);
    return Date.now() - last > WELCOME_BACK_GAP_MS;
  });
  useEffect(() => {
    // Only mark "shown" when we actually rendered the welcome-back prefix
    // (state 1 has its own welcome pitch and doesn't use the prefix).
    if (showWelcomeBack && stories.length > 0) {
      localStorage.setItem("lastWelcomeAt", Date.now().toString());
    }
  }, [showWelcomeBack, stories.length]);

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

  // Auto-switch tabs if the current one becomes empty (e.g. the user
  // archives their last active story while sitting on the Reading tab).
  // Falls through to whichever non-empty bucket exists; if none exist, the
  // entire shelf section hides anyway so it doesn't matter what's selected.
  useEffect(() => {
    if (activeTab === "reading" && activeStories.length === 0) {
      if (completedStories.length > 0) setActiveTab("finished");
      else if (archivedStories.length > 0) setActiveTab("archive");
    } else if (activeTab === "finished" && completedStories.length === 0) {
      if (activeStories.length > 0) setActiveTab("reading");
      else if (archivedStories.length > 0) setActiveTab("archive");
    } else if (activeTab === "archive" && archivedStories.length === 0) {
      if (activeStories.length > 0) setActiveTab("reading");
      else if (completedStories.length > 0) setActiveTab("finished");
    }
  }, [activeTab, activeStories.length, completedStories.length, archivedStories.length]);

  // Hardcoded Q&A pairs for the bookshelf drawer's secondary choices.
  // The Guide's replies are static (not AI-generated) — these are
  // help/onboarding content, not story content.
  const QA_RESPONSES: Record<string, string> = {
    "Tell me how this works":
      "Tap any book on your shelf to keep reading it. Tap Start a New Story to begin a new one, you describe who you are, I write the world around you.",
    "What kinds of stories?":
      "Literally anything you can imagine, from the mundane to the most fantastical. I can provide some suggestions once you choose to start a new story.",
  };

  const handleQaSelect = (question: string) => {
    const stamp = Date.now();
    setQaMessages((prev) => [
      ...prev,
      { id: `q-${stamp}`, sender: "player", content: question },
      { id: `a-${stamp}`, sender: "guide", content: QA_RESPONSES[question] ?? "" },
    ]);
    setIsDrawerOpen(false);
    // Defer the scroll to next frame so the new bubbles are in the DOM.
    requestAnimationFrame(() => {
      qaEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  };

  // Close the drawer when tapping outside (mirrors the in-story drawer
  // behavior — feels natural since the drawer is the same affordance).
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

  // Guide greeting based on library state. Ten distinct states (see
  // docs/ROADMAP.md v1.7.5 entry for the full taxonomy and voice notes).
  // For the empty-shelf case we return only the first welcome paragraph
  // here; the rest of the empty-shelf copy (the "I'm your personal Guide…"
  // paragraph + the 3-step list) is rendered inline in the bubble below
  // so the formatting is structural.
  //
  // Active-story states personalize on activeStories[0].storyTitle —
  // the array is sorted most-recent first, which is the same source the
  // Continue CTA uses below, so "you were last in X" matches.
  //
  // States 1 and 2 are indistinguishable today (we can't tell a true
  // first visit from a returning user who deleted everything without a
  // server-side recently-deleted endpoint). Both fall through to the
  // first-visit pitch.
  //
  // Pluralization: word "one" for n=1, digit for n>=2. Reads warmer.
  const wordify = (n: number) => (n === 1 ? "one" : String(n));
  const storyWord = (n: number) => (n === 1 ? "story" : "stories");

  // Length-tier-up suggestion for state 9. If every completed story is the
  // same length AND that length isn't already epic, suggest the next tier
  // up. Mixed-length history → no suggestion (reader has already varied).
  const LENGTH_ORDER = ["short", "novella", "novel", "epic"] as const;
  const LENGTH_LABELS: Record<string, [string, string]> = {
    short: ["short story", "short stories"],
    novella: ["novella", "novellas"],
    novel: ["novel", "novels"],
    epic: ["epic", "epics"],
  };
  const lengthLabel = (tier: string, n: number) => {
    const labels = LENGTH_LABELS[tier];
    if (!labels) return storyWord(n);
    return n === 1 ? labels[0] : labels[1];
  };
  const articleFor = (s: string) => (/^[aeiou]/i.test(s) ? "an" : "a");
  const suggestNextLength = (): string | null => {
    if (completedStories.length === 0) return null;
    const tiers = new Set(completedStories.map((s) => s.storyLength || ""));
    if (tiers.size !== 1) return null;
    const tier = Array.from(tiers)[0];
    const idx = LENGTH_ORDER.indexOf(tier as (typeof LENGTH_ORDER)[number]);
    if (idx < 0 || idx >= LENGTH_ORDER.length - 1) return null;
    return LENGTH_ORDER[idx + 1];
  };

  const prefix = showWelcomeBack && stories.length > 0 ? "Welcome back. " : "";

  const getGreeting = () => {
    // State 1 (and indistinguishable State 2): first visit / returning empty.
    if (stories.length === 0) {
      return "Welcome! This is Story Mode, a place where you can be the hero of any story that you can imagine.";
    }

    // State 3: empty active + completed, archive has stuff.
    if (
      activeStories.length === 0 &&
      completedStories.length === 0 &&
      archivedStories.length > 0
    ) {
      const n = archivedStories.length;
      return `${prefix}Nothing on the go right now, but you've got ${wordify(n)} ${storyWord(n)} in the archive. Want to revisit one, or start something new?`;
    }

    const recentStory = activeStories[0];
    const recentTitle = recentStory ? getStoryTitle(recentStory) : null;

    // States 4–6: one active in-progress, no completed. Progress-aware.
    if (activeStories.length === 1 && completedStories.length === 0 && recentTitle) {
      const pct = (recentStory.currentPage || 0) / (recentStory.totalPages || 1);
      if (pct < 0.3) {
        return (
          <>{prefix}<em>{recentTitle}</em> is just getting started. Want to jump back in, or start something new?</>
        );
      }
      if (pct < 0.7) {
        return (
          <>{prefix}<em>{recentTitle}</em> is right in the thick of it. Jump back in, or start something new?</>
        );
      }
      return (
        <>{prefix}<em>{recentTitle}</em> is almost done. Want to see how it ends, or start something new?</>
      );
    }

    // State 7: multiple active in-progress, no completed.
    if (activeStories.length >= 2 && completedStories.length === 0 && recentTitle) {
      return (
        <>{prefix}You've got {activeStories.length} ongoing stories. You were last in <em>{recentTitle}</em>. Want to jump back in, pick up another, or start something new?</>
      );
    }

    // State 8a: one active + completed. Restructured to avoid the awkward
    // "1 ongoing" phrasing — leads with the in-progress story instead.
    if (activeStories.length === 1 && completedStories.length > 0 && recentTitle) {
      const m = completedStories.length;
      return (
        <>{prefix}You're partway through <em>{recentTitle}</em>. You've also finished {wordify(m)} {storyWord(m)}. Jump back in, or start something new?</>
      );
    }

    // State 8b: multiple active + completed. All three options apply.
    if (activeStories.length >= 2 && completedStories.length > 0 && recentTitle) {
      return (
        <>{prefix}You've got {activeStories.length} ongoing and {completedStories.length} finished. You were last in <em>{recentTitle}</em>. Want to jump back in, pick up another, or start something new?</>
      );
    }

    // State 10: no active, all completed + archive.
    if (
      activeStories.length === 0 &&
      completedStories.length > 0 &&
      archivedStories.length > 0
    ) {
      const n = completedStories.length;
      const m = archivedStories.length;
      return `${prefix}You've finished ${wordify(n)} ${storyWord(n)}, with ${wordify(m)} more in the archive. Want to start another, or revisit one?`;
    }

    // State 9 (default): no active, all completed, no archive. May surface
    // a "try a [next tier]" suggestion when their history is single-tier.
    const n = completedStories.length;
    const nextLength = suggestNextLength();
    if (nextLength) {
      const tier = completedStories[0].storyLength || "";
      return `${prefix}You've finished ${wordify(n)} ${lengthLabel(tier, n)}. Ready for another? Maybe try ${articleFor(nextLength)} ${nextLength} this time.`;
    }
    return `${prefix}You've finished ${wordify(n)} ${storyWord(n)}. Ready for another?`;
  };

  return (
    <div
      className={`h-dvh flex flex-col bg-background relative ${className}`}
    >
      {/* Header — "Story Mode" centered (Cinzel hero font per design-system). */}
      <CenteredHeader
        className="px-4 pt-4 pb-2 shrink-0"
        title="Story Mode"
        right={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="focus:outline-none" style={{ minHeight: 44, minWidth: 44 }}>
                <GuideAvatar size={36} animate={false} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56" style={{ backgroundColor: '#FFF9F0' }}>
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
        }
      />

      {/* Shelf section — anchored to the top, never scrolls (v1.8.2).
          The chat area below scrolls independently; as the user scrolls
          through Q&A history, the chat content disappears past the
          bottom edge of the shelf, never overlapping it. Hidden entirely
          when there's no library content. */}
      {(activeStories.length > 0 || completedStories.length > 0 || archivedStories.length > 0) && (
        <div className="shrink-0 px-4 mt-2 mb-2">
          <WoodenShelf />
          <div className="flex items-center gap-4 px-3" style={{ minHeight: 44 }}>
            {activeStories.length > 0 && (
              <button
                onClick={() => setActiveTab("reading")}
                className={`text-sm transition-colors ${
                  activeTab === "reading"
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:text-foreground"
                }`}
                style={{ minHeight: 44 }}
              >
                Currently Reading
              </button>
            )}
            {completedStories.length > 0 && (
              <button
                onClick={() => setActiveTab("finished")}
                className={`text-sm transition-colors ${
                  activeTab === "finished"
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:text-foreground"
                }`}
                style={{ minHeight: 44 }}
              >
                Finished
              </button>
            )}
            {archivedStories.length > 0 && (
              <button
                onClick={() => setActiveTab("archive")}
                className={`text-sm transition-colors ${
                  activeTab === "archive"
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:text-foreground"
                }`}
                style={{ minHeight: 44 }}
              >
                Archive
              </button>
            )}
          </div>
          <div className="flex items-start gap-4 px-3 pb-3 pt-1 overflow-x-auto">
            {activeTab === "reading" && activeStories.map((story) => (
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
            {activeTab === "reading" && (
              <BookSpine isNew onClick={() => onNewStory()} />
            )}
            {activeTab === "finished" && completedStories.map((story) => (
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
            {activeTab === "archive" && archivedStories.map((story) => (
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
      )}

      {/* Chat area — welcome bubble + Q&A history. Scrollable independently
          of the header + shelf above. paddingBottom leaves room for the
          drawer peek (5rem) so the version footer is never behind it. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4" style={{ paddingBottom: "6rem" }}>
        {/* Guide welcome bubble — same shared component as the wizard and
            in-story. For a first-visit reader the bubble carries the
            onboarding pitch so the Guide is the only voice talking. */}
        <GuideBubble
          avatarSize={36}
          bubbleClassName="bg-card border border-border"
          className="mt-2 mb-4"
        >
          <div className="text-sm leading-relaxed text-muted-foreground">
            <p>{getGreeting()}</p>
            {stories.length === 0 && (
              <>
                <p className="mt-3">
                  I'm your personal Guide. Tell me what story you want to be in and I'll write it for you.
                </p>
                <ol className="mt-3 space-y-1.5 list-decimal list-inside marker:text-muted-foreground/60">
                  <li>Describe your character in a sentence or two.</li>
                  <li>I build the world around what you've told me.</li>
                  <li>Tap or write choices to shape what happens next.</li>
                </ol>
              </>
            )}
          </div>
        </GuideBubble>

        {/* Bookshelf Q&A history — taps on "Tell me how this works" etc.
            render as messenger bubbles below the welcome. Ephemeral
            (cleared every Bookshelf remount). */}
        {qaMessages.map((msg) =>
          msg.sender === "player" ? (
            <PlayerBubble key={msg.id} className="mb-3">
              {msg.content}
            </PlayerBubble>
          ) : (
            <GuideBubble
              key={msg.id}
              avatarSize={36}
              bubbleClassName="bg-card border border-border"
              className="mb-4"
            >
              <p className="text-sm leading-relaxed text-muted-foreground">{msg.content}</p>
            </GuideBubble>
          ),
        )}
        <div ref={qaEndRef} />

        {/* Version */}
        <p className="text-center text-[10px] text-muted-foreground/40 mt-6 pb-2">v1.11.6</p>
      </div>

      {/* Sticky drawer — same peek/expand pattern as the in-story drawer.
          Peek copy is "What do you want to do?" so users learn the
          affordance once and recognize it everywhere. */}
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
          onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          className="w-full flex flex-col items-center justify-center px-4 gap-4"
          style={{ height: "5rem" }}
        >
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>What do you want to do?</span>
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
          {/* Primary CTA — keeps its green color per the spec. Different
              shape from the ChoiceButtons below so the hierarchy reads:
              "this is the main action; these are side conversations." */}
          <button
            onClick={() => {
              setIsDrawerOpen(false);
              onNewStory();
            }}
            className="w-full bg-primary text-primary-foreground rounded-lg p-3 font-semibold text-base flex items-center justify-center hover:opacity-90 transition-opacity active:scale-[0.98]"
            style={{ minHeight: 44 }}
          >
            Start a New Story
          </button>
          <ChoiceButton onClick={() => handleQaSelect("Tell me how this works")}>
            Tell me how this works
          </ChoiceButton>
          <ChoiceButton onClick={() => handleQaSelect("What kinds of stories?")}>
            What kinds of stories?
          </ChoiceButton>
        </div>
      </div>

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
