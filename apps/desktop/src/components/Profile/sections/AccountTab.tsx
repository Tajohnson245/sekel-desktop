import React, { useState } from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { Lock, Trash2, Upload } from 'lucide-react';
import ImportAnkiButton from '../../Deck/ImportAnkiButton';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Input, useToast } from '../../UI';
import { deckKeys } from '../../../hooks/useDecks';
import { useQueryClient } from '@tanstack/react-query';
import { FeedbackSection } from '../FeedbackSection';

export function AccountTab() {
    const { user } = useAuthStore();
    const { t } = useTranslation();
    const { showToast } = useToast();
    const queryClient = useQueryClient();

    const [isEditingPassword, setIsEditingPassword] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const handleChangePassword = async () => {
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            showToast(t('auth.passwords_mismatch'), 'error');
            return;
        }
        try {
            await useAuthStore.getState().updatePassword(passwordForm.newPassword);
            setIsEditingPassword(false);
            setPasswordForm({ newPassword: '', confirmPassword: '' });
            showToast(t('profile.password_updated'), 'success');
        } catch (_error) {
            showToast(t('common.error'), 'error');
        }
    };

    const handleDeleteAccount = async () => {
        try {
            await useAuthStore.getState().deleteAccount();
            setIsDeleteModalOpen(false);
        } catch (_error) {
            showToast(t('common.error'), 'error');
        }
    };

    return (
        <>
            {/* Data Management Section */}
            <section className="profile-section">
                <div className="section-header">
                    <h3><Upload size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />{t('profile.data_management')}</h3>
                </div>
                <div className="profile-grid">
                    <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <label className="field-label">{t('import.importAnkiDeck')}</label>
                                <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
                                    {t('profile.import_anki_desc')}
                                </p>
                            </div>
                            <ImportAnkiButton
                                onSuccess={() => {
                                    queryClient.invalidateQueries({ queryKey: deckKeys.all });
                                }}
                            />
                        </div>
                    </div>
                </div>
            </section>

            <FeedbackSection />

            {/* Account Management (Password + Delete) */}
            <section className="profile-section">
                <div className="section-header">
                    <h3>{t('profile.account_management')}</h3>
                </div>
                <div className="profile-grid">
                    <div className="profile-field">
                        <label className="field-label">{t('profile.password')}</label>
                        {isEditingPassword ? (
                            <div className="password-change-form">
                                <Input
                                    className="field-input"
                                    type="password"
                                    placeholder={t('profile.new_password')}
                                    value={passwordForm.newPassword}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                                    style={{ marginBottom: '0.5rem' }}
                                />
                                <Input
                                    className="field-input"
                                    type="password"
                                    placeholder={t('profile.confirm_password')}
                                    value={passwordForm.confirmPassword}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                />
                                <div className="section-actions">
                                    <Button variant="secondary" onClick={() => setIsEditingPassword(false)}>{t('profile.cancel')}</Button>
                                    <Button
                                        variant="primary"
                                        onClick={handleChangePassword}
                                        disabled={!passwordForm.newPassword || passwordForm.newPassword !== passwordForm.confirmPassword}
                                    >
                                        {t('profile.save')}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <div className="field-value">••••••••</div>
                                <Button variant="secondary" onClick={() => setIsEditingPassword(true)} icon={<Lock size={14} />}>
                                    {t('profile.change_password')}
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                        <label className="field-label text-danger">{t('profile.delete_account')}</label>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <p className="text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
                                {t('profile.delete_account_warning')}
                            </p>
                            <Button variant="danger" onClick={() => setIsDeleteModalOpen(true)} icon={<Trash2 size={14} />}>
                                {t('profile.delete_account_btn')}
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            <Modal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title={t('profile.delete_account_confirm_title')}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button variant="danger" onClick={handleDeleteAccount}>
                            {t('profile.confirm_delete')}
                        </Button>
                    </>
                }
            >
                <div className="text-muted">
                    <p>{t('profile.delete_account_confirm_body')}</p>
                    <p style={{ marginTop: '1rem', fontWeight: 500, color: 'var(--danger)' }}>
                        {t('profile.delete_account_confirm_warning')}
                    </p>
                </div>
            </Modal>
        </>
    );
}
