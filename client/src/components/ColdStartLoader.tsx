import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Loader2, Server, Coffee } from "lucide-react";

interface ColdStartLoaderProps {
  isLoading: boolean;
  error?: Error | null;
}

export default function ColdStartLoader({ isLoading, error }: ColdStartLoaderProps) {
  const [loadingTime, setLoadingTime] = useState(0);
  const [showColdStartMessage, setShowColdStartMessage] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setLoadingTime(0);
      setShowColdStartMessage(false);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setLoadingTime(elapsed);
      
      // Show cold start message after 3 seconds
      if (elapsed >= 3) {
        setShowColdStartMessage(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isLoading]);

  if (!isLoading && !error) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center space-y-6">
        {error ? (
          // Error state
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
              <Server className="w-8 h-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h3 className="font-serif text-xl font-semibold">Connection Error</h3>
              <p className="text-sm text-muted-foreground">
                Unable to connect to the server. Please check your internet connection and try again.
              </p>
              {error.message && (
                <p className="text-xs text-muted-foreground mt-4 font-mono bg-muted p-2 rounded">
                  {error.message}
                </p>
              )}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
          </>
        ) : (
          // Loading state
          <>
            <div className="relative">
              <Loader2 className="w-16 h-16 mx-auto animate-spin text-primary" />
              {showColdStartMessage && (
                <Coffee className="w-8 h-8 absolute -right-2 -top-2 text-muted-foreground animate-bounce" />
              )}
            </div>
            
            <div className="space-y-2">
              <h3 className="font-serif text-xl font-semibold">
                {showColdStartMessage ? "Your Guide is stretching..." : "Loading..."}
              </h3>

              {!showColdStartMessage ? (
                <p className="text-sm text-muted-foreground">
                  Preparing your story
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  First visit in a while — your Guide takes about 30 seconds to wake up. Hang tight.
                </p>
              )}
            </div>

            {loadingTime > 45 && (
              <div className="text-xs text-muted-foreground">
                Still working on it... If this lingers, try refreshing the page.
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
