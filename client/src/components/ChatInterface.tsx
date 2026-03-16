import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import PageHeader from "./PageHeader";
import EmptyState from "./EmptyState";
import { Mic, MicOff, Send, MessageSquare, Loader2, XCircle, Bug, AlertCircle, RefreshCw } from "lucide-react";
import type { Message, Character, Quest, Item, GameState } from "@shared/schema";
import { useState, useRef, useEffect } from "react";
import { analytics } from "@/lib/posthog";
import { useToast } from "@/hooks/use-toast";
import { captureError, addBreadcrumb } from "@/lib/sentry";

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage?: (content: string) => void;
  isListening?: boolean;
  onToggleListening?: () => void;
  isLoading?: boolean;
  className?: string;
  onEndAdventure?: () => void;
  character?: Character;
  quests?: Quest[];
  items?: Item[];
  gameState?: GameState;
}

// Helper function to parse message content and extract options
function parseMessageContent(content: string): { text: string; options: string[] } {
  const lines = content.split('\n');
  const options: string[] = [];
  let text = '';
  let inOptions = false;

  for (const line of lines) {
    // Check if line starts with bullet point (•, -, or *)
    if (line.trim().match(/^[•\-\*]\s+/)) {
      inOptions = true;
      options.push(line.trim().replace(/^[•\-\*]\s+/, ''));
    } else if (line.trim().toLowerCase().includes('what do you do')) {
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
  isListening = false,
  onToggleListening,
  isLoading = false,
  className = "",
  onEndAdventure,
  character,
  quests = [],
  items = [],
  gameState
}: ChatInterfaceProps) {
  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);
  
  const handleSend = () => {
    if (inputText.trim()) {
      console.log('[ChatInterface] Send message button clicked', {
        messageLength: inputText.length
      });
      analytics.buttonClicked('Send Message', 'Chat Interface', {
        message_length: inputText.length,
        via: 'button'
      });
      analytics.messageSent('chat');
      onSendMessage?.(inputText);
      setInputText("");
    }
  };

  const handleToggleListening = () => {
    console.log('[ChatInterface] Voice toggle button clicked', {
      wasListening: isListening,
      nowListening: !isListening
    });
    analytics.buttonClicked('Toggle Voice', 'Chat Interface', {
      was_listening: isListening,
      now_listening: !isListening
    });
    onToggleListening?.();
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

    // Capture comprehensive debug info for Sentry
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

    // Add breadcrumb trail
    addBreadcrumb('User reported issue from chat', {
      messageCount: messages.length,
      lastMessageSender: messages[messages.length - 1]?.sender
    });

    // Capture as error in Sentry
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

    // Get the last player message to re-send
    const lastPlayerMessage = [...messages].reverse().find(m => m.sender === 'player');

    if (lastPlayerMessage) {
      console.log('[ChatInterface] Re-sending last player message:', lastPlayerMessage.content.substring(0, 100));
      analytics.trackEvent('ai_response_regenerated', {
        original_message_id: messages[messages.length - 1]?.id,
        player_message: lastPlayerMessage.content.substring(0, 100)
      });

      // Re-send the message to get a new AI response
      onSendMessage?.(lastPlayerMessage.content);

      toast({
        title: "Regenerating response...",
        description: "Asking the narrator for a different response.",
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
        return <Badge variant="secondary" className="rounded-full">Narrator</Badge>;
      case "npc":
        return <Badge variant="secondary" className="rounded-full">{senderName || "Character"}</Badge>;
      default:
        return <Badge variant="outline" className="rounded-full">You</Badge>;
    }
  };
  
  return (
    <div className={`h-full flex flex-col pb-20 ${className}`} data-testid="chat-interface">
      <Card className="flex-1 flex flex-col overflow-hidden">
        {/* Clean minimal header */}
        <div className="px-4 py-2.5 border-b flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-sm">Your Story</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              console.log('[ChatInterface] End Story button clicked');
              analytics.buttonClicked('End Story', 'Chat Interface');
              onEndAdventure?.();
            }}
            className="text-xs text-muted-foreground h-7 px-2"
          >
            <XCircle className="w-3.5 h-3.5 mr-1" />
            End
          </Button>
        </div>

        {/* Messages - flexible height */}
        <div className="flex-1 overflow-auto px-4 sm:px-6 py-4" ref={scrollRef}>
          <div className="space-y-3 sm:space-y-4 max-w-full">
              {messages.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  title="No messages yet"
                  description="Start your adventure by speaking or using quick actions!"
                />
              ) : (
                messages.map((message) => {
                  const { text, options } = parseMessageContent(message.content);
                  const isPlayer = message.sender === "player";

                  return (
                    <div key={message.id} className="space-y-1.5 max-w-full">
                      <div className="flex items-center gap-2">
                        {getSenderBadge(message.sender, message.senderName)}
                        <span className="text-xs text-muted-foreground">{message.timestamp}</span>
                      </div>
                      <div className={`p-2.5 sm:p-3 rounded-lg max-w-full overflow-hidden ${
                        isPlayer
                          ? "bg-primary/10 border-l-4 border-primary ml-2 sm:ml-4"
                          : "bg-muted/50"
                      }`}>
                        <p className="text-sm leading-relaxed text-foreground whitespace-pre-line break-words">{text}</p>

                        {/* Render clickable options for DM/NPC messages */}
                        {!isPlayer && options.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs sm:text-sm font-semibold text-foreground">What do you do?</p>
                            {options.map((option, index) => (
                              <Button
                                key={index}
                                variant="outline"
                                size="sm"
                                className="w-full justify-start text-left h-auto py-2.5 px-3 min-h-[44px] whitespace-normal"
                                onClick={() => {
                                  console.log('[ChatInterface] Quick action option clicked', {
                                    option: option.substring(0, 50)
                                  });
                                  analytics.buttonClicked('Quick Action Option', 'Chat Interface', {
                                    option_preview: option.substring(0, 50)
                                  });
                                  analytics.messageSent('action');
                                  onSendMessage?.(option);
                                }}
                                disabled={isLoading}
                              >
                                <span className="text-sm leading-snug break-words">{option}</span>
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* AI Thinking Indicator */}
              {isLoading && (
                <div className="flex items-center gap-2 p-2.5 sm:p-3 rounded-lg bg-muted/50 animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <p className="text-sm text-muted-foreground">Your narrator is thinking...</p>
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

          {/* Text Input - Sticky at bottom on mobile */}
          <div className="border-t border-border p-3 sm:p-4 bg-card">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant={isListening ? "destructive" : "secondary"}
                onClick={handleToggleListening}
                className="shrink-0 h-11 w-11"
                data-testid="button-voice-toggle"
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </Button>

              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  placeholder={isListening ? "Listening..." : "Type your message..."}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      if (inputText.trim()) {
                        console.log('[ChatInterface] Message sent via Enter key', {
                          messageLength: inputText.length
                        });
                        analytics.buttonClicked('Send Message', 'Chat Interface', {
                          message_length: inputText.length,
                          via: 'enter_key'
                        });
                        analytics.messageSent('chat');
                      }
                      handleSend();
                    }
                  }}
                  className="flex-1 px-3 py-2.5 bg-muted rounded-md text-sm sm:text-base text-foreground placeholder:text-muted-foreground border border-input focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                  disabled={isListening || isLoading}
                  data-testid="input-chat-message"
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!inputText.trim() || isListening || isLoading}
                  className="h-11 w-11"
                  data-testid="button-send-message"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
      </Card>
    </div>
  );
}