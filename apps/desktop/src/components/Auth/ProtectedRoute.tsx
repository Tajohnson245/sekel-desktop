import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useDeepLinkAuth } from '../../hooks/useDeepLinkAuth';
import { AuthPage } from './AuthPage';
import { ResetPasswordForm } from './ResetPasswordForm';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { user, isLoading, initialize, recoveryMode } = useAuthStore();
    const { t } = useTranslation();

    useEffect(() => {
        initialize();
    }, [initialize]);

    // Apply any sekel:// auth callbacks (email confirmation, password reset).
    useDeepLinkAuth();

    if (isLoading) {
        return (
            <div className="loading-screen">
                <div className="spinner"></div>
                <p>{t('common.loading_app')}</p>
            </div>
        );
    }

    // Recovery mode wins over the regular signed-in tree: the user clicked a
    // password-reset link and we should require them to set a new password
    // before letting them into the app.
    if (user && recoveryMode) {
        return <ResetPasswordForm />;
    }

    if (!user) {
        return <AuthPage />;
    }

    return <>{children}</>;
};
