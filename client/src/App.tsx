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
import { useAnalytics, useSessionTracking } from "./hooks/useAnalytics";
import { useToast } from "./hooks/use-toast";
import { setUserContext, setGameContext } from "./lib/sentry";

// Types
import type { Character, Quest, Message, GameState } from "@shared/schema";

type ViewType = "bookshelf" | "newStory" | "game";

function GameApp() {
  const [currentView, setCurrentView] = useState<ViewType>("bookshelf");
  const [activeStoryId, setActiveStory] = useState<string | null>(null);
  const [isCreatingStory, setIsCreatingStory] = useState(false);

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
    console.log('[App] View changed to:', currentView);
    analytics.screenViewed(viewNames[currentView], { view: currentView });
  }, [currentView]);

  // Fetch data from backend
  const { data: character, isLoading: characterLoading, error: characterError } = useQuery<Character>({
    queryKey: ['/api/character'],
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ['/api/messages', activeStoryId],
  });

  const { data: gameState } = useQuery<GameState>({
    queryKey: ['/api/game-state', activeStoryId],
  });

  const { data: quests = [] } = useQuery<Quest[]>({
    queryKey: ['/api/quests', activeStoryId],
  });

  // Fetch all stories for the bookshelf (not scoped by storyId)
  const { data: stories = [] } = useQuery<GameState[]>({
    queryKey: ['/api/stories'],
  });

  // Update Sentry context when character data changes
  // MOVED AFTER data declarations to prevent TDZ errors in Safari
  useEffect(() => {
    if (character) {
      console.log('[App] Updating Sentry user context', {
        characterId: character.id,
        characterName: character.name,
        level: character.level
      });
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
    mutationFn: async (message: string) => {
      const startTime = Date.now();
      console.log('[App] Sending message to AI:', message.substring(0, 100));

      try {
        const response = await apiRequest('POST', '/api/ai/chat', { message });
        const data = await response.json();
        const duration = Date.now() - startTime;

        console.log('[App] AI response received:', {
          duration,
          success: true,
          hasContent: !!data.content
        });

        // Automatic error detection: Slow response
        if (duration > 10000) {
          console.warn('[App] Slow AI response detected:', duration, 'ms');
          analytics.trackEvent('ai_response_slow', {
            duration_ms: duration,
            threshold_ms: 10000,
            message_preview: message.substring(0, 100)
          });
        }

        // Automatic error detection: Empty or missing content
        if (!data.content || data.content.trim().length === 0) {
          console.error('[App] AI response has no content');
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
            title: wasCompleted ? "Quest Complete!" : "Quest Updated",
            description: quest.title,
            duration: 3000,
          });
        }
      }

      // Refetch all data after AI response
      console.log('[App] AI response successful, refreshing data');
      analytics.messageSent("chat");
      queryClient.invalidateQueries({ queryKey: ['/api/messages', activeStoryId] });
      queryClient.invalidateQueries({ queryKey: ['/api/character'] });
      queryClient.invalidateQueries({ queryKey: ['/api/quests', activeStoryId] });
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/game-state', activeStoryId] });
      queryClient.invalidateQueries({ queryKey: ['/api/enemies'] });
    },
    onError: (error: any) => {
      console.error('[App] AI mutation error:', error);
    }
  });
  
  // Event Handlers
  const handleSendMessage = (content: string) => {
    aiChatMutation.mutate(content);
  };

  const navigateToBookshelf = () => {
    setActiveStoryId(null);
    setActiveStory(null);
    // Invalidate story-scoped queries so bookshelf shows fresh data
    queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
    setCurrentView("bookshelf");
  };

  const enterStory = (storyId: string) => {
    setActiveStoryId(storyId);
    setActiveStory(storyId);
    // Invalidate queries so they refetch with the new storyId header
    // Query keys include storyId so each story has its own cache
    queryClient.invalidateQueries({ queryKey: ['/api/character'] });
    queryClient.invalidateQueries({ queryKey: ['/api/game-state', storyId] });
    queryClient.invalidateQueries({ queryKey: ['/api/messages', storyId] });
    queryClient.invalidateQueries({ queryKey: ['/api/quests', storyId] });
    setCurrentView("game");
  };

  const handleEndAdventure = async () => {
    try {
      if (activeStoryId) {
        // Mark story as finished (not delete) so it appears on the Finished shelf
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
      <Bookshelf
        stories={stories}
        onContinueStory={(storyId) => enterStory(storyId)}
        onNewStory={() => setCurrentView("newStory")}
      />
    );
  }

  if (currentView === "newStory") {
    return (
      <NewStoryCreation
        isLoading={isCreatingStory}
        onStartStory={async (storyData) => {
          console.log('[App] New story requested:', storyData);
          setIsCreatingStory(true);
          try {
            const response = await apiRequest('POST', '/api/story/new', storyData);
            const data = await response.json();
            console.log('[App] New story created:', data);

            // Enter the newly created story
            enterStory(data.storyId);
          } catch (error) {
            console.error('[App] Error creating story:', error);
            toast({
              title: "Error Creating Story",
              description: "Something went wrong. Please try again.",
              variant: "destructive",
            });
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

      <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
        <main className="flex-1 min-h-0 flex flex-col">
          {messagesLoading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Loading story...</p>
            </div>
          ) : (
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={aiChatMutation.isPending}
              character={character}
              quests={quests}
              gameState={gameState}
              onEndAdventure={handleEndAdventure}
              onNavigateToBookshelf={navigateToBookshelf}
              className="flex-1"
            />
          )}
        </main>
      </div>
    </>
  );
}

function App() {
  // Check if we're on the admin route
  const isAdminRoute = window.location.pathname === "/admin";

  if (isAdminRoute) {
    return <AdminDashboard />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <GameApp />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;