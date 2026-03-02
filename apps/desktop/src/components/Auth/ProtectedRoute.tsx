import React, { useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { AuthPage } from './AuthPage';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { user, isLoading, initialize } = useAuthStore();

    useEffect(() => {
        initialize();
    }, [initialize]);

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

    return <>{children}</>;
};
