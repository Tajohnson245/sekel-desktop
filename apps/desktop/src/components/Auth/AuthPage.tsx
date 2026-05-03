import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import './Auth.css';

type AuthView = 'login' | 'signup' | 'forgot';

export const AuthPage: React.FC = () => {
    const [view, setView] = useState<AuthView>('login');
    const { t } = useTranslation();

    return (
        <div className="auth-page">
            <div className="auth-container">
                {view === 'login' && <LoginForm onForgotPassword={() => setView('forgot')} />}
                {view === 'signup' && <SignupForm />}
                {view === 'forgot' && <ForgotPasswordForm onBackToLogin={() => setView('login')} />}

                {view !== 'forgot' && (
                    <button
                        className="auth-toggle-btn"
                        onClick={() => setView(view === 'login' ? 'signup' : 'login')}
                    >
                        {view === 'login' ? t('auth.no_account') : t('auth.have_account')}
                    </button>
                )}
            </div>
        </div>
    );
};
