import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Helper to get session ID from localStorage
function getSessionId(): string {
  return localStorage.getItem('sessionId') || '';
}

// Active story ID — set by App.tsx when entering a story
let _activeStoryId: string | null = null;

export function setActiveStoryId(storyId: string | null) {
  _activeStoryId = storyId;
}

export function getActiveStoryId(): string | null {
  return _activeStoryId;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'x-session-id': getSessionId(),
  };
  if (_activeStoryId) {
    headers['x-story-id'] = _activeStoryId;
  }
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers = getHeaders();

  if (data) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
      headers: getHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
