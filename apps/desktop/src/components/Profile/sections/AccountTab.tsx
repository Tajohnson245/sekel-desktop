import React, { useState } from 'react';
import { useAuthStore } from '../../../stores/authStore';
import { Lock, Trash2, Upload, Download, Compass } from 'lucide-react';
import ImportAnkiButton from '../../Deck/ImportAnkiButton';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Input, useToast } from '../../UI';
import { deckKeys, useDecks } from '../../../hooks/useDecks';
import { useQueryClient } from '@tanstack/react-query';
import { FeedbackSection } from '../FeedbackSection';
import { useOnboardingStore, ONBOARDING_LOCALSTORAGE_KEY } from '../../../stores/onboardingStore';
import { useVisibleTourStepIds } from '../../Onboarding/useVisibleTourStepIds';

export function AccountTab() {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const queryClient = useQueryClient();

    const { user } = useAuthStore();

    const [isEditingPassword, setIsEditingPassword] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [exportingDeck, setExportingDeck] = useState(false);
    const [selectedDeckId, setSelectedDeckId] = useState<string>('');
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const { data: decks = [] } = useDecks();

    const openExportModal = () => {
        setSelectedDeckId('');
        setIsExportModalOpen(true);
    };

    const closeExportModal = () => {
        if (exportingDeck) return;
        setIsExportModalOpen(false);
    };

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

    const handleExportDeck = async () => {
        if (!user?.id || !selectedDeckId) return;
        setExportingDeck(true);
        try {
            const result = await window.electronAPI.db.exportSekel(user.id, selectedDeckId, true);
            if (result) {
                showToast(t('export.success'), 'success');
                setIsExportModalOpen(false);
            }
        } catch {
            showToast(t('export.error'), 'error');
        } finally {
            setExportingDeck(false);
        }
    };

    const startOnboarding = useOnboardingStore((s) => s.start);
    const visibleTourStepIds = useVisibleTourStepIds();

    const handleReplayTour = () => {
        try { localStorage.removeItem(ONBOARDING_LOCALSTORAGE_KEY); } catch { /* ignore */ }
        if (visibleTourStepIds.length > 0) startOnboarding(visibleTourStepIds);
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
                    <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <label className="field-label">{t('profile.export_deck')}</label>
                                <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
                                    {decks.length === 0
                                        ? t('profile.export_deck_empty')
                                        : t('profile.export_deck_desc')}
                                </p>
                            </div>
                            <Button
                                variant="secondary"
                                onClick={openExportModal}
                                disabled={decks.length === 0}
                                icon={<Download size={14} />}
                            >
                                {t('profile.export_deck_btn')}
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Help & Tour */}
            <section className="profile-section">
                <div className="section-header">
                    <h3>
                        <Compass size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                        {t('profile.help_and_tour', 'Help & tour')}
                    </h3>
                </div>
                <div className="profile-grid">
                    <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <label className="field-label">
                                    {t('profile.replay_tour', 'Replay app tour')}
                                </label>
                                <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
                                    {t('profile.replay_tour_desc', 'Walk through the welcome slides and feature tour again.')}
                                </p>
                            </div>
                            <Button
                                variant="secondary"
                                onClick={handleReplayTour}
                                icon={<Compass size={14} />}
                            >
                                {t('profile.replay_tour_btn', 'Replay tour')}
                            </Button>
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
                isOpen={isExportModalOpen}
                onClose={closeExportModal}
                title={t('profile.export_deck_modal_title')}
                size="md"
                footer={
                    <>
                        <Button variant="secondary" onClick={closeExportModal} disabled={exportingDeck}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleExportDeck}
                            disabled={!selectedDeckId || exportingDeck}
                            icon={<Download size={14} />}
                        >
                            {exportingDeck ? t('common.loading') : t('profile.export_deck_btn')}
                        </Button>
                    </>
                }
            >
                <p className="text-muted" style={{ fontSize: '0.9rem', margin: '0 0 1rem' }}>
                    {t('profile.export_deck_desc')}
                </p>
                <div
                    role="radiogroup"
                    aria-label={t('profile.export_deck_modal_title')}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem',
                        maxHeight: '20rem',
                        overflowY: 'auto',
                    }}
                >
                    {decks.map((d) => {
                        const selected = d.id === selectedDeckId;
                        return (
                            <button
                                key={d.id}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => setSelectedDeckId(d.id)}
                                disabled={exportingDeck}
                                style={{
                                    textAlign: 'left',
                                    padding: '0.6rem 0.8rem',
                                    borderRadius: '8px',
                                    border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                                    background: selected ? 'var(--primary-bg, rgba(99,102,241,0.1))' : 'var(--card-bg)',
                                    color: 'var(--text)',
                                    cursor: exportingDeck ? 'not-allowed' : 'pointer',
                                    fontWeight: selected ? 600 : 400,
                                    fontSize: '0.9rem',
                                }}
                            >
                                {d.name}
                            </button>
                        );
                    })}
                </div>
            </Modal>

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
