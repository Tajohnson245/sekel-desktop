import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { Button, Input } from '../UI';

/**
 * Shown when authStore.recoveryMode is true — i.e. the user just clicked a
 * password-reset email link and was returned to the app with an active
 * Supabase session via setSession(). They aren't dropped into the dashboard
 * because they didn't intentionally log in — they came here to set a new
 * password. Once submitted, recoveryMode clears and ProtectedRoute falls
 * through to the regular app.
 */
export const ResetPasswordForm: React.FC = () => {
    const { t } = useTranslation();
    const updatePassword = useAuthStore(s => s.updatePassword);
    const setRecoveryMode = useAuthStore(s => s.setRecoveryMode);
    const signOut = useAuthStore(s => s.signOut);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 6) {
            setError(t('auth.password_too_short'));
            return;
        }
        if (password !== confirmPassword) {
            setError(t('auth.passwords_mismatch'));
            return;
        }

        setLoading(true);
        try {
            await updatePassword(password);
            setRecoveryMode(false);
            // ProtectedRoute now renders the dashboard normally.
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = async () => {
        // The recovery email link minted a session for us. If the user backs
        // out without resetting, sign them out so the next launch returns
        // them to the login screen instead of into a half-recovery state.
        await signOut();
        setRecoveryMode(false);
    };

    return (
        <div className="auth-page">
            <div className="auth-container">
                <div className="auth-form-container">
                    <h2>{t('auth.reset_password_title')}</h2>
                    <p className="auth-form-desc">{t('auth.reset_password_desc')}</p>
                    <form onSubmit={handleSubmit}>
                        <Input
                            label={t('auth.new_password')}
                            type="password"
                            id="new-password"
                            value={password}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                            autoFocus
                            required
                        />
                        <Input
                            label={t('auth.confirm_new_password')}
                            type="password"
                            id="confirm-new-password"
                            value={confirmPassword}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                            required
                        />
                        {error && <p className="error-message">{error}</p>}
                        <Button type="submit" disabled={loading} isLoading={loading} fullWidth>
                            {loading ? t('auth.saving') : t('auth.set_new_password')}
                        </Button>
                    </form>
                    <button className="auth-link-btn" onClick={handleCancel}>
                        {t('auth.cancel_reset')}
                    </button>
                </div>
            </div>
        </div>
    );
};
