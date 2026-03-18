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
import { MessageSquare, Loader2, RefreshCw, Send, Minus, Plus, BookOpen, XCircle, ChevronUp, ChevronDown } from "lucide-react";
import GuideAvatar from "./GuideAvatar";
import type { Message, Character, Quest, Item, GameState } from "@shared/schema";
import { useState, useRef, useEffect, useMemo } from "react";
import { analytics } from "@/lib/posthog";
import { useToast } from "@/hooks/use-toast";
import { captureError, addBreadcrumb } from "@/lib/sentry";

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
  gameState
}: ChatInterfaceProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [inputText, setInputText] = useState("");
  const [fontSizeIndex, setFontSizeIndex] = useState(getInitialFontSizeIndex);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
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

  const showDrawer = latestChoices.length > 0 && !isLoading && !gameState?.storyComplete;

  // Auto-expand drawer when new choices arrive
  const prevChoicesRef = useRef<string[]>([]);
  useEffect(() => {
    if (latestChoices.length > 0 && latestChoices !== prevChoicesRef.current) {
      const choicesChanged = latestChoices.join('|') !== prevChoicesRef.current.join('|');
      if (choicesChanged) {
        setShowCustomInput(false);
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

  useEffect(() => {
    if (messages.length === 0) return;
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
    console.log('[ChatInterface] Quick action option clicked', {
      option: option.substring(0, 50)
    });
    analytics.buttonClicked('Quick Action Option', 'Chat Interface', {
      option_preview: option.substring(0, 50)
    });
    analytics.messageSent('action');
    setIsDrawerOpen(false);
    setShowCustomInput(false);
    setInputText("");
    onSendMessage?.(option);
  };

  const handleCustomSubmit = () => {
    if (inputText.trim()) {
      analytics.messageSent('chat');
      onSendMessage?.(inputText);
      setInputText("");
      setShowCustomInput(false);
      setIsDrawerOpen(false);
    }
  };

  const handleCopyDebugInfo = () => {
    console.log('[ChatInterface] Copy Debug Info button clicked');
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
      console.log('[ChatInterface] Debug info copied to clipboard');
      toast({
        title: "Debug info copied!",
        description: "Paste this into your support ticket or browser console.",
        duration: 3000,
      });
    }).catch((err) => {
      console.error('[ChatInterface] Failed to copy debug info:', err);
      toast({
        title: "Copy failed",
        description: "Please check browser console for debug info.",
        variant: "destructive",
        duration: 3000,
      });
      console.log('[ChatInterface] Debug info (manual copy):', debugText);
    });
  };

  const handleReportIssue = () => {
    console.log('[ChatInterface] Report Issue button clicked');
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

    console.log('[ChatInterface] Issue reported to Sentry with context:', issueContext);

    toast({
      title: "Issue reported!",
      description: "Thank you! We've captured your game state for investigation.",
      duration: 4000,
    });
  };

  const handleRegenerateResponse = () => {
    console.log('[ChatInterface] Regenerate Response button clicked');
    analytics.buttonClicked('Regenerate Response', 'Chat Interface', {
      messageCount: messages.length,
      lastMessageId: messages[messages.length - 1]?.id
    });

    const lastPlayerMessage = [...messages].reverse().find(m => m.sender === 'player');

    if (lastPlayerMessage) {
      console.log('[ChatInterface] Re-sending last player message:', lastPlayerMessage.content.substring(0, 100));
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
      {/* Fixed top nav bar — sits outside the scroll container */}
      <div className="z-30 border-b border-border shrink-0" style={{ backgroundColor: '#FFF9F0' }}>
        <div className="flex items-center justify-between h-12 px-3">
          <span className="font-bold text-sm text-primary">Story Mode</span>
          <span className="text-xs text-muted-foreground">
            {gameState?.totalPages && gameState.totalPages > 0
              ? gameState.storyComplete
                ? "Complete"
                : `Page ${gameState.currentPage || 1} of ${gameState.totalPages}`
              : ""}
          </span>
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
                onClick={() => setShowEndConfirm(true)}
                className="text-destructive focus:text-destructive"
              >
                <XCircle className="w-4 h-4 mr-2" />
                End Story
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* End Story confirmation dialog */}
      <AlertDialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this story?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the story as finished and return you to the library. You can still read it later from the Finished shelf.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Reading</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                console.log('[ChatInterface] End Story confirmed');
                analytics.buttonClicked('End Story Confirmed', 'Chat Interface');
                onEndAdventure?.();
              }}
            >
              End Story
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Messages - flexible height, with bottom padding for drawer */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4"
        ref={scrollRef}
        style={{ paddingBottom: showDrawer ? 56 : 16 }}
      >
        <div className="space-y-3 sm:space-y-4 max-w-full">
            {messages.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No messages yet"
                description="Start your adventure by speaking or using quick actions!"
              />
            ) : (
              messages.map((message, index) => {
                const { text } = parseMessageContent(message.content);
                const isPlayer = message.sender === "player";
                const isLast = index === messages.length - 1;

                return (
                  <div key={message.id} ref={isLast ? lastMessageRef : undefined} className="space-y-1.5 max-w-full">
                    <div className="flex items-center gap-2">
                      {getSenderBadge(message.sender, message.senderName)}
                      <span className="text-xs text-muted-foreground">{message.timestamp}</span>
                    </div>
                    <div className={`p-2.5 sm:p-3 rounded-lg max-w-full overflow-hidden ${
                      isPlayer
                        ? "bg-primary/10 border-l-4 border-primary ml-2 sm:ml-4"
                        : "bg-muted/50"
                    }`}>
                      <p className="leading-relaxed text-foreground whitespace-pre-line break-words" style={{ fontSize: `${currentFontSize.px}px` }}>{text}</p>
                    </div>
                  </div>
                );
              })
            )}

            {/* AI Thinking Indicator */}
            {isLoading && (
              <div className="flex items-center gap-2 p-2.5 sm:p-3 rounded-lg bg-muted/50 animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin" />
                <p className="text-sm text-muted-foreground">Your Guide is thinking...</p>
              </div>
            )}

            {/* Regenerate Response Button (after AI response, when not loading) */}
            {!isLoading && messages.length > 0 && messages[messages.length - 1].sender !== 'player' && (
              <div className="flex justify-center mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRegenerateResponse}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Regenerate response
                </Button>
              </div>
            )}
          </div>
        </div>

      {/* Scroll to bottom button */}
      {isScrolledUp && (
        <button
          onClick={scrollToBottom}
          className="absolute z-20 right-4 bg-card border border-border rounded-full p-2 shadow-md hover:bg-accent/10 transition-colors"
          style={{ bottom: showDrawer ? 68 : 20 }}
          aria-label="Scroll to latest"
        >
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </button>
      )}

      {/* Bottom choices drawer */}
      {showDrawer && (
        <div
          ref={drawerRef}
          className="absolute bottom-0 left-0 right-0 z-20 rounded-t-xl border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.08)] transition-all duration-300 ease-in-out"
          style={{
            backgroundColor: '#FFF9F0',
            maxHeight: isDrawerOpen ? '50vh' : '3.5rem',
            overflow: 'hidden',
          }}
        >
          {/* Drawer handle / collapsed bar */}
          <button
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className="w-full flex flex-col items-center pt-2 pb-3 px-4"
          >
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mb-2" />
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>What happens next?</span>
              <ChevronUp
                className="w-4 h-4 transition-transform duration-300"
                style={{ transform: isDrawerOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </div>
          </button>

          {/* Expanded choices content */}
          <div className="px-4 pb-4 space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(50vh - 3.5rem)' }}>
            {latestChoices.map((option, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="w-full justify-start text-left h-auto py-2.5 px-3 min-h-[44px] whitespace-normal"
                onClick={() => handleChoiceSelect(option)}
                disabled={isLoading}
              >
                <span className="text-sm leading-snug break-words">{option}</span>
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start text-left h-auto py-2.5 px-3 min-h-[44px] whitespace-normal text-muted-foreground italic"
              onClick={() => {
                analytics.buttonClicked('Custom Input', 'Chat Interface');
                setShowCustomInput(true);
              }}
              disabled={isLoading}
            >
              <span className="text-sm leading-snug break-words">I have something else in mind...</span>
            </Button>
            {showCustomInput && (
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  placeholder="What would you do?"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCustomSubmit();
                  }}
                  autoFocus
                  className="flex-1 px-3 py-2.5 bg-muted rounded-md text-sm text-foreground placeholder:text-muted-foreground border border-input focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                  disabled={isLoading}
                />
                <Button
                  size="icon"
                  onClick={handleCustomSubmit}
                  disabled={!inputText.trim() || isLoading}
                  className="h-11 w-11 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
