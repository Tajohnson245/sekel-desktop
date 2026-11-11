import { QueryClient } from '@tanstack/react-query';

/**
 * The app-wide React Query cache. Lives in its own module (rather than inside
 * App.tsx) so the auth store can clear it when the signed-in account changes —
 * many query keys (['decks'], ['drafts'], ['study', …]) aren't user-scoped, so a
 * second user signing in would otherwise be served the first user's data.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60, // 1 minute
            retry: 1,
        },
    },
});
