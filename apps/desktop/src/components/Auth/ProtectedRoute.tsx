import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { AuthPage } from './AuthPage';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { user, isLoading, initialize } = useAuthStore();
    const { t } = useTranslation();

    useEffect(() => {
        initialize();
    }, [initialize]);

    if (isLoading) {
        return (
            <div className="loading-screen">
                <div className="spinner"></div>
                <p>{t('common.loading_app')}</p>
            </div>
        );
    }

    if (!user) {
        return <AuthPage />;
    }

    return <>{children}</>;
};
