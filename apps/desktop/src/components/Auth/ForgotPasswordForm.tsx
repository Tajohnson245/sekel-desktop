import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { resetPasswordForEmail } from '@sekel/db';
import { Button, Input } from '../UI';

interface Props {
    onBackToLogin: () => void;
}

export const ForgotPasswordForm: React.FC<Props> = ({ onBackToLogin }) => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);
    const { t } = useTranslation();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Supabase encodes redirectTo into the verification link's redirect_to
        // param. The OS opens us via the registered sekel:// protocol handler;
        // useDeepLinkAuth detects type=recovery and flags the store.
        const { error: resetError } = await resetPasswordForEmail(supabase, email, {
            redirectTo: 'sekel://auth/callback',
        });

        if (resetError) {
            setError(resetError.message);
            setLoading(false);
            return;
        }

        setSent(true);
        setLoading(false);
    };

    if (sent) {
        return (
            <div className="auth-form-container">
                <h2>{t('auth.reset_email_sent_title')}</h2>
                <p className="success-message">
                    {t('auth.reset_email_sent_desc', { email })}
                </p>
                <Button variant="ghost" onClick={onBackToLogin} fullWidth>
                    {t('auth.back_to_login')}
                </Button>
            </div>
        );
    }

    return (
        <div className="auth-form-container">
            <h2>{t('auth.forgot_password_title')}</h2>
            <p className="auth-form-desc">{t('auth.forgot_password_desc')}</p>
            <form onSubmit={handleSubmit}>
                <Input
                    label={t('auth.email')}
                    type="email"
                    id="forgot-email"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    required
                />
                {error && <p className="error-message">{error}</p>}
                <Button type="submit" disabled={loading} isLoading={loading} fullWidth>
                    {loading ? t('auth.sending') : t('auth.send_reset_link')}
                </Button>
            </form>
            <button className="auth-link-btn" onClick={onBackToLogin}>
                {t('auth.back_to_login')}
            </button>
        </div>
    );
};
