import { queryClient, apiRequest, setActiveStoryId } from "./lib/queryClient";
import { QueryClientProvider, useQuery, useMutation } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";

// Components
import AdminDashboard from "./components/AdminDashboard";
import ChatInterface from "./components/ChatInterface";
import ColdStartLoader from "./components/ColdStartLoader";
import Bookshelf from "./components/Bookshelf";
import NewStoryCreation from "./components/NewStoryCreation";
import TestModelBadge from "./components/TestModelBadge";
import { useAnalytics, useSessionTracking } from "./hooks/useAnalytics";
import { useToast } from "./hooks/use-toast";
import { setUserContext, setGameContext } from "./lib/sentry";
import * as Sentry from "@sentry/react";

// Types
import type { Character, Quest, Message, GameState } from "@shared/schema";

type ViewType = "bookshelf" | "newStory" | "game";

function GameApp() {
  const [currentView, setCurrentView] = useState<ViewType>("bookshelf");
  const [activeStoryId, setActiveStory] = useState<string | null>(null);
  const [isCreatingStory, setIsCreatingStory] = useState(false);
  // Optimistic UI for the new-story flow (v1.8.0): when the user taps
  // Begin Story, we navigate to the game view immediately and stash the
  // character description here so ChatInterface can render it as a
  // right-aligned player bubble while the new-story API generates page 1.
  // Cleared once a real story ID lands (enterStory) or on error.
  const [pendingPlayerMessage, setPendingPlayerMessage] = useState<string | null>(null);

  // Sync storyId to queryClient headers whenever it changes
  useEffect(() => {
    setActiveStoryId(activeStoryId);
  }, [activeStoryId]);

  // Toast notifications
  const { toast } = useToast();

  // Analytics and session tracking
  const analytics = useAnalytics();
  useSessionTracking();

  // Track view changes
  useEffect(() => {
    const viewNames: Record<ViewType, string> = {
      bookshelf: 'Bookshelf',
      newStory: 'New Story',
      game: 'Game Screen'
    };
    analytics.screenViewed(viewNames[currentView], { view: currentView });
  }, [currentView]);

  // Fetch data from backend. Story-scoped queries are gated on activeStoryId
  // (v1.8.7) so they don't fire during the optimistic new-story window when
  // activeStoryId is still null — that previously caused the server to return
  // cross-story session data and bleed an old story's messages into the new
  // story view.
  const { data: character, isLoading: characterLoading, error: characterError } = useQuery<Character>({
    queryKey: ['/api/character'],
    enabled: !!activeStoryId,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ['/api/messages', activeStoryId],
    enabled: !!activeStoryId,
  });

  const { data: gameState } = useQuery<GameState>({
    queryKey: ['/api/game-state', activeStoryId],
    enabled: !!activeStoryId,
  });

  const { data: quests = [] } = useQuery<Quest[]>({
    queryKey: ['/api/quests', activeStoryId],
    enabled: !!activeStoryId,
  });

  // Fetch all stories for the bookshelf (not scoped by storyId)
  const { data: stories = [], isLoading: storiesLoading, error: storiesError } = useQuery<GameState[]>({
    queryKey: ['/api/stories'],
  });

  // Seed character description from a "How it works" example tap on the
  // bookshelf — flows through to NewStoryCreation as a pre-filled textarea.
  const [seedDescription, setSeedDescription] = useState("");

  // Update Sentry context when character data changes
  // MOVED AFTER data declarations to prevent TDZ errors in Safari
  useEffect(() => {
    if (character) {
      setUserContext(character.id, {
        name: character.name,
        level: character.level,
        class: character.class
      });
    }
  }, [character]);

  // Update Sentry context when game state changes
  useEffect(() => {
    setGameContext({
      currentView,
      activeQuestCount: quests.filter(q => q.status === 'active').length,
    });
  }, [currentView, quests]);
  // AI Chat mutation
  const aiChatMutation = useMutation({
    onMutate: async (message: string) => {
      // Optimistic update: show the player's message immediately
      await queryClient.cancelQueries({ queryKey: ['/api/messages', activeStoryId] });
      const previousMessages = queryClient.getQueryData<Message[]>(['/api/messages', activeStoryId]);
      const optimisticMessage: Message = {
        id: `optimistic-${Date.now()}`,
        sender: 'player',
        senderName: null,
        content: message,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: new Date(),
        sessionId: '',
        storyId: activeStoryId,
      };
      queryClient.setQueryData<Message[]>(
        ['/api/messages', activeStoryId],
        (old = []) => [...old, optimisticMessage]
      );
      return { previousMessages };
    },
    mutationFn: async (message: string) => {
      const startTime = Date.now();

      try {
        const response = await apiRequest('POST', '/api/ai/chat', { message });
        const data = await response.json();
        const duration = Date.now() - startTime;

        // Automatic error detection: Slow response
        if (duration > 10000) {
          analytics.trackEvent('ai_response_slow', {
            duration_ms: duration,
            threshold_ms: 10000,
            message_preview: message.substring(0, 100)
          });
        }

        // Automatic error detection: Empty or missing content
        if (!data.content || data.content.trim().length === 0) {
          analytics.errorOccurred('ai_response_empty', 'AI returned empty content', {
            message_preview: message.substring(0, 100),
            response_keys: Object.keys(data)
          });
        }

        // Automatic error detection: Fallback response (error flag present)
        if (data.error) {
          console.error('[App] AI returned fallback response due to error:', data.error);
          analytics.errorOccurred(`ai_fallback_${data.error}`, `AI fallback: ${data.error}`, {
            message_preview: message.substring(0, 100),
            error_type: data.error,
            response_content: data.content.substring(0, 200)
          });

          // Also show toast to user
          toast({
            title: "AI Response Issue",
            description: "Your Guide had trouble processing your request. Try rephrasing or use the Regenerate button.",
            variant: "destructive",
            duration: 5000,
          });
        }

        analytics.aiResponseReceived(duration, true);
        return data;
      } catch (error: any) {
        const duration = Date.now() - startTime;
        console.error('[App] AI response failed:', {
          error: error.message,
          duration
        });

        analytics.aiResponseFailed(error.message, duration);
        analytics.errorOccurred('ai_response_error', error.message, {
          message_preview: message.substring(0, 100),
          duration_ms: duration
        });
        throw error;
      }
    },
    onSuccess: (data) => {
      // Check if quest was updated and show toast notification
      if (data.actions?.updateQuest) {
        const updatedQuestId = data.actions.updateQuest.id;
        const updatedQuestData = data.actions.updateQuest.updates;

        // Find the quest in current quests to get its title
        const quest = quests.find(q => q.id === updatedQuestId);

        if (quest) {
          // Check if quest was completed (status changed to completed OR progress reached maxProgress)
          const wasCompleted =
            updatedQuestData.status === 'completed' ||
            (updatedQuestData.progress !== undefined && updatedQuestData.progress >= quest.maxProgress);

          console.log('[App] Quest update detected', {
            questId: updatedQuestId,
            questTitle: quest.title,
            wasCompleted,
            newProgress: updatedQuestData.progress
          });

          toast({
            title: wasCompleted ? "Mission Complete!" : "Mission Updated",
            description: quest.title,
            duration: 3000,
          });
        }
      }

      // Refetch all data after AI response
      analytics.messageSent("chat");
      queryClient.invalidateQueries({ queryKey: ['/api/messages', activeStoryId] });
      queryClient.invalidateQueries({ queryKey: ['/api/character'] });
      queryClient.invalidateQueries({ queryKey: ['/api/quests', activeStoryId] });
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/game-state', activeStoryId] });
    },
    onError: (error: any, _variables: string, context: { previousMessages?: Message[] } | undefined) => {
      console.error('[App] AI mutation error:', error);
      // Rollback optimistic update on error
      if (context?.previousMessages) {
        queryClient.setQueryData(['/api/messages', activeStoryId], context.previousMessages);
      }
    }
  });
  
  // Event Handlers
  const handleSendMessage = (content: string) => {
    aiChatMutation.mutate(content);
  };

  const navigateToBookshelf = () => {
    setActiveStoryId(null);
    setActiveStory(null);
    setPendingPlayerMessage(null);
    // Invalidate story-scoped queries so bookshelf shows fresh data
    queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
    setCurrentView("bookshelf");
  };

  const enterStory = (storyId: string) => {
    setActiveStoryId(storyId);
    setActiveStory(storyId);
    setPendingPlayerMessage(null);
    // Invalidate queries so they refetch with the new storyId header
    // Query keys include storyId so each story has its own cache
    queryClient.invalidateQueries({ queryKey: ['/api/character'] });
    queryClient.invalidateQueries({ queryKey: ['/api/game-state', storyId] });
    queryClient.invalidateQueries({ queryKey: ['/api/messages', storyId] });
    queryClient.invalidateQueries({ queryKey: ['/api/quests', storyId] });
    setCurrentView("game");
  };

  const handleEndAdventure = async () => {
    // Capture storyId before any state changes clear it
    const storyIdToEnd = activeStoryId;
    try {
      if (storyIdToEnd) {
        // Mark story as finished (not delete) so it appears on the Finished shelf
        // PATCH must complete before navigateToBookshelf clears _activeStoryId
        await apiRequest('PATCH', '/api/game-state', { storyComplete: true });
      }
      navigateToBookshelf();
      analytics.trackEvent("adventure_ended");
    } catch (error) {
      console.error('Failed to end adventure:', error);
      // Still navigate back even if the API call fails
      navigateToBookshelf();
    }
  };

  // Handle different views
  if (currentView === "bookshelf") {
    return (
      <>
        <ColdStartLoader
          isLoading={storiesLoading && stories.length === 0}
          error={storiesError as Error | null}
        />
        <Bookshelf
          stories={stories}
          onContinueStory={(storyId) => enterStory(storyId)}
          onNewStory={(seed) => {
            setSeedDescription(seed ?? "");
            setCurrentView("newStory");
          }}
        />
      </>
    );
  }

  if (currentView === "newStory") {
    return (
      <NewStoryCreation
        isLoading={isCreatingStory}
        seedDescription={seedDescription}
        onStartStory={async (storyData) => {
          if (isCreatingStory) return;
          // Optimistic: jump to the game view IMMEDIATELY so the user sees
          // their character description as a right-aligned bubble + the
          // Guide's typing dots while the API generates page 1. The
          // pending state is cleared when enterStory() runs (success) or
          // when we bail back to the bookshelf (error).
          setPendingPlayerMessage(storyData.characterDescription);
          setCurrentView("game");
          setIsCreatingStory(true);
          try {
            const response = await apiRequest('POST', '/api/story/new', storyData);
            const data = await response.json();
            enterStory(data.storyId);
          } catch (error) {
            console.error('[App] Story creation failed:', error);
            toast({
              title: "Error Creating Story",
              description: "Something went wrong. Please try again.",
              variant: "destructive",
            });
            setPendingPlayerMessage(null);
            setCurrentView("newStory");
          } finally {
            setIsCreatingStory(false);
          }
        }}
        onBack={() => setCurrentView("bookshelf")}
      />
    );
  }

  // Main game view — full-screen chat with story progress
  return (
    <>
      <ColdStartLoader
        isLoading={characterLoading}
        error={characterError as Error | null}
      />

      <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
        <main className="flex-1 min-h-0 flex flex-col">
          {messagesLoading && !pendingPlayerMessage ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Loading story...</p>
            </div>
          ) : (
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              // While the new-story API is in flight, isCreatingStory drives
              // the TypingDots indicator the same way aiChatMutation does
              // for in-story replies.
              isLoading={aiChatMutation.isPending || isCreatingStory}
              character={character}
              quests={quests}
              gameState={gameState}
              onEndAdventure={handleEndAdventure}
              onNavigateToBookshelf={navigateToBookshelf}
              pendingPlayerMessage={pendingPlayerMessage}
              className="flex-1"
            />
          )}
        </main>
      </div>
    </>
  );
}

function App() {
  const isAdminRoute = window.location.pathname === "/admin";

  if (isAdminRoute) {
    return (
      <>
        <TestModelBadge />
        <AdminDashboard />
      </>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <TestModelBadge />
        <Sentry.ErrorBoundary
          fallback={({ resetError }) => (
            <div className="min-h-dvh flex items-center justify-center px-6 bg-background">
              <div className="max-w-md text-center space-y-4">
                <h1 className="font-serif text-2xl text-foreground">Something went wrong.</h1>
                <p className="text-sm text-muted-foreground">
                  Your Guide hit an unexpected snag. We've been notified. You can try again, and your stories are safe.
                </p>
                <button
                  onClick={() => { resetError(); window.location.reload(); }}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Reload Story Mode
                </button>
              </div>
            </div>
          )}
        >
          <GameApp />
        </Sentry.ErrorBoundary>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;