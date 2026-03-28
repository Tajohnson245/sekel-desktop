import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import './Auth.css';

export const AuthPage: React.FC = () => {
    const [isLogin, setIsLogin] = useState(true);
    const { t } = useTranslation();

    return (
        <div className="auth-page">
            <div className="auth-container">
                {isLogin ? <LoginForm /> : <SignupForm />}
                <button
                    className="auth-toggle-btn"
                    onClick={() => setIsLogin(!isLogin)}
                >
                    {isLogin ? t('auth.no_account') : t('auth.have_account')}
                </button>
            </div>
        </div>
    );
};
