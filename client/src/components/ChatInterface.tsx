import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import EmptyState from "./EmptyState";
import { MessageSquare, Loader2, RefreshCw, Send, Minus, Plus, BookOpen, XCircle, ChevronUp, ChevronDown, Mail, ThumbsUp, ThumbsDown } from "lucide-react";
import GuideAvatar from "./GuideAvatar";
import GuideBubble from "./GuideBubble";
import TypingDots from "./TypingDots";
import CenteredHeader from "./CenteredHeader";
import ChoiceButton from "./ChoiceButton";
import PlayerBubble from "./PlayerBubble";
import type { Message, Character, Quest, Item, GameState } from "@shared/schema";
import { useState, useRef, useEffect, useMemo } from "react";
import { analytics } from "@/lib/posthog";
import { useToast } from "@/hooks/use-toast";
import { captureError, addBreadcrumb } from "@/lib/sentry";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage?: (content: string) => void;
  isLoading?: boolean;
  className?: string;
  onEndAdventure?: () => void;
  onNavigateToBookshelf?: () => void;
  character?: Character;
  quests?: Quest[];
  items?: Item[];
  gameState?: GameState;
  /** Optimistic UI: when set, render this string as a right-aligned player
   *  bubble at the top of the conversation, plus a TypingDots indicator
   *  below it. Used during the new-story Begin flow so the user sees their
   *  character description immediately while the AI generates page 1.
   *  Cleared by App.tsx once the real messages are returned by the API. */
  pendingPlayerMessage?: string | null;
  /** Pagination (v1.11.5). When `canLoadOlder` is true, a "Load older
   *  messages" link appears above the message list; tapping it calls
   *  `onLoadOlder` which prepends the next batch into the cache. */
  canLoadOlder?: boolean;
  isLoadingOlder?: boolean;
  onLoadOlder?: () => void;
}

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

// Helper function to parse message content and extract options
function parseMessageContent(content: string): { text: string; options: string[] } {
  const lines = content.split('\n');
  const options: string[] = [];
  let text = '';
  let inOptions = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Check if line starts with bullet point (•, -, *) or numbered option (1., 2., A., B.)
    // Also match "Option A:", "Option B:" style prefixes
    if (trimmed.match(/^[•\-\*]\s+/) || trimmed.match(/^(?:Option\s+)?[A-D][.:]\s+/i) || trimmed.match(/^[1-4][.:]\s+/)) {
      inOptions = true;
      // Strip all prefix formats: bullets, "Option A:", "A.", "1.", etc.
      const cleaned = trimmed
        .replace(/^[•\-\*]\s+/, '')
        .replace(/^(?:Option\s+)?[A-D][.:]\s+/i, '')
        .replace(/^[1-4][.:]\s+/, '');
      if (cleaned.length > 0) {
        options.push(cleaned);
      }
    } else if (trimmed.toLowerCase().includes('what do you do') || trimmed.toLowerCase().includes('what will you do')) {
      inOptions = true;
      // Don't add this line to text or options
    } else if (!inOptions) {
      text += line + '\n';
    }
  }

  return { text: text.trim(), options };
}

export default function ChatInterface({
  messages,
  onSendMessage,
  isLoading = false,
  className = "",
  onEndAdventure,
  onNavigateToBookshelf,
  character,
  quests = [],
  items = [],
  gameState,
  pendingPlayerMessage = null,
  canLoadOlder = false,
  isLoadingOlder = false,
  onLoadOlder,
}: ChatInterfaceProps) {
  const [inputText, setInputText] = useState("");
  const [fontSizeIndex, setFontSizeIndex] = useState(getInitialFontSizeIndex);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [endStorySentiment, setEndStorySentiment] = useState<"up" | "down" | null>(null);
  // Initialize from gameState so revisiting a story that already has sentiment
  // (captured via the popup last time) doesn't show the footer's ask again.
  const [finishedSentimentSubmitted, setFinishedSentimentSubmitted] = useState(
    () => !!gameState?.sentiment
  );
  useEffect(() => {
    if (gameState?.sentiment) setFinishedSentimentSubmitted(true);
  }, [gameState?.sentiment]);

  // Persist sentiment to gameState so popup and footer share the same source
  // of truth. Optimistic local flip happens at the call site so the buttons
  // disappear instantly; this just shapes the network write + cache refresh.
  const persistSentiment = async (sentiment: "up" | "down") => {
    try {
      await apiRequest('PATCH', '/api/game-state', { sentiment });
      queryClient.invalidateQueries({ queryKey: ['/api/game-state'] });
    } catch (err) {
      captureError(err instanceof Error ? err : new Error(String(err)), {
        context: 'ChatInterface.persistSentiment',
        sentiment,
      });
    }
  };
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Extract choices from the latest AI message
  const latestChoices = useMemo(() => {
    const lastAiMessage = [...messages].reverse().find(m => m.sender !== 'player');
    if (!lastAiMessage) return [];
    const { options } = parseMessageContent(lastAiMessage.content);
    return options;
  }, [messages]);

  const showDrawer = !isLoading && !gameState?.storyComplete;

  // Auto-expand drawer when new choices arrive
  const prevChoicesRef = useRef<string[]>([]);
  useEffect(() => {
    if (latestChoices.length > 0 && latestChoices !== prevChoicesRef.current) {
      const choicesChanged = latestChoices.join('|') !== prevChoicesRef.current.join('|');
      if (choicesChanged) {
        setInputText("");
      }
    }
    prevChoicesRef.current = latestChoices;
  }, [latestChoices]);

  // Collapse drawer when loading starts
  useEffect(() => {
    if (isLoading) {
      setIsDrawerOpen(false);
    }
  }, [isLoading]);

  // On the FIRST messages payload we get, jump straight to the bottom so the
  // user opens to the latest content (in-progress: their place; finished:
  // the closing paragraph above the THE END footer). Exception (v1.8.0):
  // for a brand-new story (length <= 2, i.e. just the player's character
  // description + the AI's page 1), stay at the TOP so the user lands on
  // their own prompt and reads down into the Guide's reply, texting-style.
  // After the initial load, the existing per-message logic runs: a new AI
  // page scrolls its top into view; a player message pins to the bottom.
  const initialScrollDone = useRef(false);
  useEffect(() => {
    if (messages.length === 0) return;
    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      // Fresh story — leave the natural top position alone.
      if (messages.length <= 2) return;
      // rAF lets the layout settle (padding + footer height) before we measure.
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
      return;
    }
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.sender === 'player') {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    } else {
      lastMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [messages]);

  // Track scroll position for scroll-to-bottom button
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setIsScrolledUp(distanceFromBottom > 100);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };

  // Close drawer when tapping outside
  useEffect(() => {
    if (!isDrawerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setIsDrawerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isDrawerOpen]);

  const currentFontSize = FONT_SIZES[fontSizeIndex];

  const changeFontSize = (delta: number) => {
    setFontSizeIndex((prev) => {
      const next = Math.max(0, Math.min(FONT_SIZES.length - 1, prev + delta));
      try { localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  };

  const handleChoiceSelect = (option: string) => {
    analytics.buttonClicked('Quick Action Option', 'Chat Interface', {
      option_preview: option.substring(0, 50)
    });
    analytics.messageSent('action');
    setIsDrawerOpen(false);
    setInputText("");
    onSendMessage?.(option);
  };

  const handleCustomSubmit = () => {
    if (inputText.trim()) {
      analytics.messageSent('chat');
      onSendMessage?.(inputText);
      setInputText("");
      setIsDrawerOpen(false);
    }
  };

  const handleCopyDebugInfo = () => {
    analytics.buttonClicked('Copy Debug Info', 'Chat Interface');

    const debugInfo = {
      timestamp: new Date().toISOString(),
      character: character ? {
        id: character.id,
        name: character.name,
        level: character.level,
        class: character.class,
        currentHealth: character.currentHealth,
        maxHealth: character.maxHealth
      } : null,
      gameState: gameState ? {
        currentScene: gameState.currentScene,
        inCombat: gameState.inCombat,
        combatId: gameState.combatId
      } : null,
      quests: quests.map(q => ({
        id: q.id,
        title: q.title,
        status: q.status,
        progress: `${q.progress}/${q.maxProgress}`
      })),
      items: items.map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        quantity: i.quantity
      })),
      recentMessages: messages.slice(-10).map(m => ({
        id: m.id,
        sender: m.sender,
        content: m.content.substring(0, 200) + (m.content.length > 200 ? '...' : ''),
        timestamp: m.timestamp
      }))
    };

    const debugText = `STORY MODE - Debug Info
Generated: ${debugInfo.timestamp}

CHARACTER:
${debugInfo.character ? `- ID: ${debugInfo.character.id}
- Name: ${debugInfo.character.name}
- Level ${debugInfo.character.level} ${debugInfo.character.class}
- HP: ${debugInfo.character.currentHealth}/${debugInfo.character.maxHealth}` : 'No character'}

GAME STATE:
${debugInfo.gameState ? `- Scene: ${debugInfo.gameState.currentScene}
- In Combat: ${debugInfo.gameState.inCombat}` : 'No game state'}

QUESTS (${debugInfo.quests.length}):
${debugInfo.quests.map(q => `- [${q.status.toUpperCase()}] ${q.title} (${q.progress})`).join('\n') || 'None'}

ITEMS (${debugInfo.items.length}):
${debugInfo.items.slice(0, 5).map(i => `- ${i.name} (${i.type}) x${i.quantity}`).join('\n') || 'None'}

RECENT MESSAGES (Last 10):
${debugInfo.recentMessages.map((m, i) => `${i + 1}. [${m.sender}] ${m.content}`).join('\n\n')}

=== RAW JSON ===
${JSON.stringify(debugInfo, null, 2)}
`;

    navigator.clipboard.writeText(debugText).then(() => {
      toast({
        title: "Debug info copied!",
        description: "Paste this into your support ticket or browser console.",
        duration: 3000,
      });
    }).catch((err) => {
      console.error('[ChatInterface] Failed to copy debug info:', err);
      // Clipboard API unavailable — keep the manual-copy log so users on
      // older browsers can still grab the text from devtools.
      console.log('[ChatInterface] Debug info (manual copy):', debugText);
      toast({
        title: "Copy failed",
        description: "Please check browser console for debug info.",
        variant: "destructive",
        duration: 3000,
      });
    });
  };

  const handleReportIssue = () => {
    analytics.buttonClicked('Report Issue', 'Chat Interface');

    const issueContext = {
      character: character ? {
        id: character.id,
        name: character.name,
        level: character.level,
        class: character.class,
        health: `${character.currentHealth}/${character.maxHealth}`
      } : null,
      gameState: gameState ? {
        scene: gameState.currentScene,
        inCombat: gameState.inCombat,
        combatId: gameState.combatId
      } : null,
      questCount: quests.length,
      activeQuestCount: quests.filter(q => q.status === 'active').length,
      itemCount: items.length,
      messageCount: messages.length,
      recentMessages: messages.slice(-10).map(m => ({
        id: m.id,
        sender: m.sender,
        content: m.content.substring(0, 200),
        timestamp: m.timestamp
      }))
    };

    addBreadcrumb('User reported issue from chat', {
      messageCount: messages.length,
      lastMessageSender: messages[messages.length - 1]?.sender
    });

    const error = new Error('User reported chat issue');
    error.name = 'UserReportedIssue';
    captureError(error, {
      context: "User-reported issue from ChatInterface",
      ...issueContext
    });

    toast({
      title: "Issue reported!",
      description: "Thank you! We've captured your game state for investigation.",
      duration: 4000,
    });
  };

  const handleRegenerateResponse = () => {
    analytics.buttonClicked('Regenerate Response', 'Chat Interface', {
      messageCount: messages.length,
      lastMessageId: messages[messages.length - 1]?.id
    });

    const lastPlayerMessage = [...messages].reverse().find(m => m.sender === 'player');

    if (lastPlayerMessage) {
      analytics.trackEvent('ai_response_regenerated', {
        original_message_id: messages[messages.length - 1]?.id,
        player_message: lastPlayerMessage.content.substring(0, 100)
      });

      onSendMessage?.(lastPlayerMessage.content);

      toast({
        title: "Regenerating response...",
        description: "Asking Your Guide for a different response.",
        duration: 2000,
      });
    } else {
      console.warn('[ChatInterface] No player message found to regenerate');
      toast({
        title: "Can't regenerate",
        description: "No player message found to regenerate from.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const getSenderBadge = (sender: string, senderName?: string | null) => {
    switch (sender) {
      case "dm":
        return <Badge variant="secondary" className="rounded-full">Your Guide</Badge>;
      case "npc":
        return <Badge variant="secondary" className="rounded-full">{senderName || "Character"}</Badge>;
      default:
        return <Badge variant="outline" className="rounded-full">You</Badge>;
    }
  };

  return (
    <div className={`h-full min-h-0 flex flex-col relative ${className}`} data-testid="chat-interface">
      {/* Fixed top nav bar — sits outside the scroll container. Uses the
          shared CenteredHeader component (same 3-col grid pattern as the
          bookshelf and new-story wizard). Title is two-line capable, no
          truncation. Pages display as (currentPage/totalPages) inline. */}
      <CenteredHeader
        className="z-30 border-b border-border shrink-0"
        title={
          <>
            <span>{gameState?.storyTitle || "Story Mode"}</span>
            {gameState?.totalPages && gameState.totalPages > 0 && (
              <span className="text-muted-foreground font-normal">
                {" "}
                {gameState.storyComplete
                  ? "(Complete)"
                  : `(${gameState.currentPage || 1}/${gameState.totalPages})`}
              </span>
            )}
          </>
        }
        titleClassName="text-sm font-semibold text-foreground"
        right={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="focus:outline-none flex items-center justify-center" style={{ minHeight: 44, minWidth: 44 }}>
                <GuideAvatar size={28} animate={false} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => {
                  analytics.buttonClicked('Back to Library', 'Story Menu');
                  onNavigateToBookshelf?.();
                }}
              >
                <BookOpen className="w-4 h-4 mr-2" />
                Back to Library
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  analytics.trackEvent("feedback_mailto_clicked", { from: "story" });
                  window.location.href = "mailto:feedback@mystorymode.com?subject=Story%20Mode%20feedback";
                }}
              >
                <Mail className="w-4 h-4 mr-2" />
                Send Feedback
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowEndConfirm(true)}
                className="text-destructive focus:text-destructive"
              >
                <XCircle className="w-4 h-4 mr-2" />
                End Story
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {/* End Story confirmation dialog */}
      <AlertDialog
        open={showEndConfirm}
        onOpenChange={(open) => {
          setShowEndConfirm(open);
          if (!open) setEndStorySentiment(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this story?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the story as finished and return you to the library. You can still read it later from the Finished shelf.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Inline sentiment capture. Optional — selecting nothing still ends the story. */}
          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-2">How was this story?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEndStorySentiment(endStorySentiment === "up" ? null : "up")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border transition-colors ${
                  endStorySentiment === "up"
                    ? "bg-secondary/40 border-primary text-foreground"
                    : "bg-background border-border text-muted-foreground hover:border-primary/40"
                }`}
                style={{ minHeight: 44 }}
                aria-pressed={endStorySentiment === "up"}
              >
                <ThumbsUp className="w-4 h-4" />
                <span className="text-sm">Loved it</span>
              </button>
              <button
                type="button"
                onClick={() => setEndStorySentiment(endStorySentiment === "down" ? null : "down")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border transition-colors ${
                  endStorySentiment === "down"
                    ? "bg-destructive/10 border-destructive text-foreground"
                    : "bg-background border-border text-muted-foreground hover:border-destructive/40"
                }`}
                style={{ minHeight: 44 }}
                aria-pressed={endStorySentiment === "down"}
              >
                <ThumbsDown className="w-4 h-4" />
                <span className="text-sm">Not for me</span>
              </button>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Keep Reading</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                analytics.buttonClicked('End Story Confirmed', 'Chat Interface');
                if (endStorySentiment) {
                  analytics.trackEvent("story_sentiment_submitted", {
                    sentiment: endStorySentiment,
                    source: "end_story_popup",
                    currentPage: gameState?.currentPage,
                    totalPages: gameState?.totalPages,
                  });
                  // Persist before navigating away so the value lands on
                  // gameState and the footer (if the reader revisits) sees it.
                  await persistSentiment(endStorySentiment);
                }
                onEndAdventure?.();
              }}
            >
              End Story
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Messages - flexible height. Bottom padding has to clear whichever
          chrome is anchored at the bottom: ~112px gives the drawer peek
          (5rem) a comfortable air gap above the last paragraph, and ~240px
          makes room for the taller story-complete footer (The End / How was
          this / Back to library) so the closing paragraph isn't hidden. */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4"
        ref={scrollRef}
        style={{ paddingBottom: gameState?.storyComplete ? 240 : showDrawer ? 112 : 16 }}
      >
        <div className="space-y-3 sm:space-y-4 max-w-full">
            {canLoadOlder && messages.length > 0 && (
              <div className="flex justify-center pt-1 pb-3">
                <button
                  type="button"
                  onClick={onLoadOlder}
                  disabled={isLoadingOlder}
                  className="text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                  aria-label="Load older messages"
                >
                  {isLoadingOlder ? "Loading older messages..." : "Load older messages"}
                </button>
              </div>
            )}
            {messages.length === 0 && pendingPlayerMessage && (
              // Optimistic first-message UI for the new-story Begin flow.
              // Renders the player's character description as a right-aligned
              // bubble immediately while the new-story API generates page 1.
              // The TypingDots indicator below (driven by isLoading) shows
              // the Guide responding. When real messages arrive, messages.length
              // flips to > 0 and this block is replaced by the real player
              // bubble at the top of the conversation.
              <PlayerBubble fontSize={currentFontSize.px}>{pendingPlayerMessage}</PlayerBubble>
            )}
            {messages.length === 0 && !pendingPlayerMessage && !isLoading && (
              <EmptyState
                icon={MessageSquare}
                title="Your story is loading"
                description="Tap a choice below to begin."
              />
            )}
            {messages.length > 0 && (
              messages.map((message, index) => {
                const { text } = parseMessageContent(message.content);
                const isPlayer = message.sender === "player";
                const isLast = index === messages.length - 1;
                const canRegenerate = isLast && !isPlayer && !isLoading && !gameState?.storyComplete;

                // Messenger layout. AI messages use the shared GuideBubble
                // component (avatar above + left-aligned bubble). Player
                // messages render a right-aligned bubble inline — no
                // avatar; alignment is the directional cue.
                const prose = (
                  <p
                    className={`leading-relaxed text-foreground whitespace-pre-line break-words ${
                      isPlayer ? '' : 'story-prose'
                    }`}
                    style={{ fontSize: `${currentFontSize.px}px` }}
                  >
                    {text}
                  </p>
                );

                return (
                  <div key={message.id} ref={isLast ? lastMessageRef : undefined} className="space-y-1">
                    {isPlayer ? (
                      <PlayerBubble fontSize={currentFontSize.px}>{text}</PlayerBubble>
                    ) : (
                      <GuideBubble avatarSize={28}>{prose}</GuideBubble>
                    )}
                    {/* Below-bubble meta row: timestamp + (regenerate on the
                        last AI page). Aligned to the bubble's side. */}
                    <div
                      className={`flex items-center gap-2 text-xs text-muted-foreground ${
                        isPlayer ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <span>{message.timestamp}</span>
                      {canRegenerate && (
                        <button
                          onClick={() => setShowRegenConfirm(true)}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
                          aria-label="Regenerate this response"
                          title="Regenerate this response"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* AI Thinking Indicator. iMessage-style three-dot typing
                animation inside a Guide bubble — sits exactly where the
                next AI reply will land. */}
            {isLoading && (
              <GuideBubble avatarSize={28} loading>
                <TypingDots />
              </GuideBubble>
            )}

          </div>
        </div>

      {/* Regenerate confirmation dialog */}
      <AlertDialog open={showRegenConfirm} onOpenChange={setShowRegenConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate this page?</AlertDialogTitle>
            <AlertDialogDescription>
              The current response will be replaced with a new one. This uses
              one more page of your story's generation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleRegenerateResponse();
              }}
            >
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Scroll to bottom button. Has to float above whichever chrome is at
          the bottom — story-complete footer is the tallest, drawer peek is
          shorter. */}
      {isScrolledUp && (
        <button
          onClick={scrollToBottom}
          className="absolute z-20 right-4 bg-card border border-border rounded-full p-2 shadow-md hover:bg-accent/10 transition-colors"
          style={{ bottom: gameState?.storyComplete ? 252 : showDrawer ? 92 : 20 }}
          aria-label="Scroll to latest"
        >
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </button>
      )}

      {/* Story-complete footer. Replaces the drawer once the AI hits the
          final page so the reader can't extend, and offers a sentiment
          capture for stories that ended naturally (not via End Story menu). */}
      {gameState?.storyComplete && (
        <div
          className="absolute bottom-0 left-0 right-0 z-20 border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.08)]"
          style={{ backgroundColor: '#FFF9F0' }}
        >
          <div className="px-4 py-4 max-w-md mx-auto space-y-3">
            <p className="text-center font-serif text-xl text-foreground">The end.</p>

            {!finishedSentimentSubmitted && (
              <div className="space-y-2">
                <p className="text-xs text-center text-muted-foreground">How was this story?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      analytics.trackEvent("story_sentiment_submitted", {
                        sentiment: "up",
                        source: "finished_page",
                        currentPage: gameState?.currentPage,
                        totalPages: gameState?.totalPages,
                      });
                      setFinishedSentimentSubmitted(true);
                      void persistSentiment("up");
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-border bg-background text-muted-foreground hover:border-primary/40 transition-colors"
                    style={{ minHeight: 44 }}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    <span className="text-sm">Loved it</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      analytics.trackEvent("story_sentiment_submitted", {
                        sentiment: "down",
                        source: "finished_page",
                        currentPage: gameState?.currentPage,
                        totalPages: gameState?.totalPages,
                      });
                      setFinishedSentimentSubmitted(true);
                      void persistSentiment("down");
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-border bg-background text-muted-foreground hover:border-destructive/40 transition-colors"
                    style={{ minHeight: 44 }}
                  >
                    <ThumbsDown className="w-4 h-4" />
                    <span className="text-sm">Not for me</span>
                  </button>
                </div>
              </div>
            )}

            {finishedSentimentSubmitted && (
              <p className="text-xs text-center text-muted-foreground">Thanks for the feedback.</p>
            )}

            <Button
              onClick={() => {
                analytics.buttonClicked('Back to Library', 'Finished Page');
                onNavigateToBookshelf?.();
              }}
              className="w-full"
              style={{ minHeight: 44 }}
            >
              <BookOpen className="w-4 h-4 mr-2" />
              Back to library
            </Button>
          </div>
        </div>
      )}

      {/* Bottom choices drawer */}
      {showDrawer && (
        <div
          ref={drawerRef}
          className="absolute bottom-0 left-0 right-0 z-20 rounded-t-xl border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.08)] transition-all duration-300 ease-in-out"
          style={{
            backgroundColor: '#FFF9F0',
            maxHeight: isDrawerOpen ? '50vh' : '5rem',
            overflow: 'hidden',
          }}
        >
          {/* Drawer handle / collapsed bar. Fills the full peek height so
              that no content from below shows through when collapsed.
              gap-4 between the drag handle and the "What happens next?" row
              keeps the two affordances visually distinct on small screens. */}
          <button
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className="w-full flex flex-col items-center justify-center px-4 gap-4"
            style={{ height: '5rem' }}
          >
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>What happens next?</span>
              <ChevronUp
                className="w-4 h-4 transition-transform duration-300"
                style={{ transform: isDrawerOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </div>
          </button>

          {/* Expanded choices content. Each AI-generated choice renders as
              a shared ChoiceButton — same visual primitive as the bookshelf
              drawer's Q&A options, so the affordance reads identically
              across surfaces. */}
          <div className="px-4 pb-4 pt-1 space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(50vh - 5rem)' }}>
            {latestChoices.map((option, index) => (
              <ChoiceButton
                key={index}
                onClick={() => handleChoiceSelect(option)}
                disabled={isLoading}
              >
                {option}
              </ChoiceButton>
            ))}
            {/* Custom input — always visible. The placeholder doubles as
                the affordance: "I have something else in mind…" cues the
                player that free-form text is welcome here. Typing replaces
                the placeholder; no extra field spawns below. */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="I have something else in mind…"
                aria-label="Tell the Guide what you do next"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCustomSubmit();
                }}
                onFocus={() => analytics.buttonClicked('Custom Input', 'Chat Interface')}
                className="flex-1 px-3 py-2.5 bg-background rounded-md text-base text-foreground placeholder:text-muted-foreground placeholder:italic border border-input focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                disabled={isLoading}
              />
              <Button
                size="icon"
                onClick={handleCustomSubmit}
                disabled={!inputText.trim() || isLoading}
                className="h-11 w-11 shrink-0"
                aria-label="Send"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
