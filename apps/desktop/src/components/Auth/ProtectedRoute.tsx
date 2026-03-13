import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { AuthPage } from './AuthPage';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { user, session, isLoading, initialize } = useAuthStore();
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncDone, setSyncDone] = useState(false);

    useEffect(() => {
        initialize();
    }, [initialize]);

    useEffect(() => {
        if (!user || syncDone || isSyncing) return;

        const runInitialSync = async () => {
            try {
                const firstRun = await window.electronAPI.db.isFirstRun(user.id);
                if (firstRun) {
                    setIsSyncing(true);
                    const supabaseUrl = import.meta.env.VITE_SUPABASE_PROJECT_URL as string;
                    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
                    const accessToken = session?.access_token ?? '';
                    await window.electronAPI.db.pullFromSupabase(supabaseUrl, supabaseAnonKey, user.id, accessToken);
                }
            } catch (err) {
                console.error('[Sync] Initial sync failed:', err);
            } finally {
                setIsSyncing(false);
                setSyncDone(true);
            }
        };

        runInitialSync();
    }, [user, syncDone, isSyncing]);

    if (isLoading) {
        return (
            <div className="loading-screen">
                <div className="spinner"></div>
                <p>Loading Sekel...</p>
            </div>
        );
    }

    if (!user) {
        return <AuthPage />;
    }

    if (!syncDone || isSyncing) {
        return (
            <div className="loading-screen">
                <div className="spinner"></div>
                <p>{isSyncing ? 'Syncing your data...' : 'Loading...'}</p>
            </div>
        );
    }

    return <>{children}</>;
};
