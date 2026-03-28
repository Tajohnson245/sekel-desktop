import { instrumentedHandle } from '@sekel/observability';

// We initialize a separate client for the main process if needed for admin tasks,
// but for standard auth we usually proxy the renderer's requests or handle session persistence.
// For Electron, it's safer to handle the sensitive bits like session storage here.

const supabaseUrl = process.env.VITE_SUPABASE_PROJECT_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

export const setupAuthHandlers = () => {
    // These handlers can be used for more secure auth flows or if we want to 
    // manage the session exclusively in the main process.
    // For now, we'll keep it simple and handle the basic session retrieve/set if needed.

    instrumentedHandle('get-supabase-config', () => ({
        url: supabaseUrl,
        anonKey: supabaseAnonKey,
    }));
};
