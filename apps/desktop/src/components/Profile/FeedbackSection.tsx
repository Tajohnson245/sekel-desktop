import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Upload, X } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { insertFeedback } from '@sekel/db';
import { Button, Input, Modal, useToast } from '../UI';

const FEEDBACK_AREAS = [
    'Study Sessions',
    'Card Editor',
    'Deck Management',
    'Import/Export',
    'AI Card Generation',
    'FSRS Scheduling',
    'Time Travel',
    'Settings',
    'Performance',
    'Other',
] as const;

const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024; // 5 MB

interface FeedbackSectionProps {
    /** When provided, component runs in controlled mode — no trigger button rendered. */
    isOpen?: boolean;
    onClose?: () => void;
}

export const FeedbackSection: React.FC<FeedbackSectionProps> = ({ isOpen: controlledOpen, onClose: controlledClose }) => {
    const controlled = controlledOpen !== undefined;
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const { showToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isOpen, setIsOpen] = useState(false);
    const modalOpen   = controlled ? controlledOpen! : isOpen;
    const closeModal  = controlled ? (controlledClose ?? (() => {})) : () => setIsOpen(false);
    const [areas, setAreas] = useState<string[]>([]);
    const [description, setDescription] = useState('');
    const [desiredFix, setDesiredFix] = useState('');
    const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
    const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [os, setOs] = useState<string>('');
    const [macChip, setMacChip] = useState<string>('');

    const toggleArea = (area: string) => {
        setAreas(prev =>
            prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area],
        );
    };

    const handleScreenshotSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > MAX_SCREENSHOT_SIZE) {
            showToast(t('feedback.screenshot_too_large'), 'error');
            return;
        }

        if (!file.type.startsWith('image/')) {
            showToast(t('feedback.invalid_image'), 'error');
            return;
        }

        setScreenshotFile(file);
        setScreenshotPreview(URL.createObjectURL(file));
    };

    const removeScreenshot = () => {
        setScreenshotFile(null);
        if (screenshotPreview) {
            URL.revokeObjectURL(screenshotPreview);
            setScreenshotPreview(null);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const resetForm = () => {
        setAreas([]);
        setDescription('');
        setDesiredFix('');
        setOs('');
        setMacChip('');
        removeScreenshot();
    };

    const handleClose = () => {
        closeModal();
    };

    const handleSubmit = async () => {
        if (!user) return;
        if (areas.length === 0 || !description.trim()) {
            showToast(t('feedback.validation_error'), 'error');
            return;
        }

        setSubmitting(true);
        try {
            let screenshotUrl: string | null = null;

            if (screenshotFile) {
                const fileExt = screenshotFile.name.split('.').pop();
                const fileName = `${user.id}-${Date.now()}.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('feedback-screenshots')
                    .upload(fileName, screenshotFile);

                if (uploadError) throw uploadError;

                const { data } = supabase.storage
                    .from('feedback-screenshots')
                    .getPublicUrl(fileName);

                screenshotUrl = data.publicUrl;
            }

            await insertFeedback(supabase, {
                user_id: user.id,
                areas,
                description: description.trim(),
                screenshot_url: screenshotUrl,
                desired_fix: desiredFix.trim() || null,
                os: os || null,
                mac_chip: os === 'macOS' ? (macChip || null) : null,
            });

            showToast(t('feedback.submitted'), 'success');
            resetForm();
            closeModal();
        } catch (err) {
            console.error('Feedback submission failed:', err);
            showToast(t('feedback.error'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            {!controlled && (
                <section className="profile-section">
                    <div className="section-header">
                        <h3>
                            <MessageSquare size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                            {t('feedback.title')}
                        </h3>
                    </div>
                    <div className="profile-grid">
                        <div className="profile-field" style={{ gridColumn: '1 / -1' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <p className="text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
                                    {t('feedback.section_description')}
                                </p>
                                <Button
                                    variant="primary"
                                    onClick={() => setIsOpen(true)}
                                    icon={<MessageSquare size={14} />}
                                >
                                    {t('feedback.send_feedback')}
                                </Button>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            <Modal
                isOpen={modalOpen}
                onClose={handleClose}
                title={t('feedback.title')}
                size="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={handleClose}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSubmit}
                            disabled={submitting || areas.length === 0 || !description.trim()}
                        >
                            {submitting ? t('feedback.submitting') : t('feedback.submit')}
                        </Button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Problem area checkboxes */}
                    <div>
                        <label className="field-label">{t('feedback.problem_area')}</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                            {FEEDBACK_AREAS.map(area => (
                                <label key={area} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        className="fsrs-deck-checkbox"
                                        checked={areas.includes(area)}
                                        onChange={() => toggleArea(area)}
                                    />
                                    <span>{t(`feedback.area_${area.toLowerCase().replace(/[/ ]/g, '_')}`)}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* OS selection */}
                    <div>
                        <label className="field-label">{t('feedback.os_label')}</label>
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                            {(['Windows', 'macOS', 'Linux'] as const).map(option => (
                                <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="os"
                                        checked={os === option}
                                        onChange={() => { setOs(option); if (option !== 'macOS') setMacChip(''); }}
                                    />
                                    <span>{t(`feedback.os_${option.toLowerCase().replace('macos', 'macos')}`)}</span>
                                </label>
                            ))}
                        </div>

                        {os === 'macOS' && (
                            <div style={{ marginTop: '0.75rem' }}>
                                <label className="field-label" style={{ fontSize: '0.85rem' }}>{t('feedback.mac_chip_label')}</label>
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem' }}>
                                    {(['Intel', 'Apple Silicon'] as const).map(chip => (
                                        <label key={chip} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name="mac_chip"
                                                checked={macChip === chip}
                                                onChange={() => setMacChip(chip)}
                                            />
                                            <span>{t(`feedback.mac_chip_${chip === 'Intel' ? 'intel' : 'apple_silicon'}`)}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Description textarea */}
                    <div>
                        <label className="field-label">{t('feedback.describe_problem')}</label>
                        <Input
                            multiline
                            rows={4}
                            className="field-input"
                            value={description}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                            placeholder={t('feedback.describe_placeholder')}
                        />
                    </div>

                    {/* Screenshot upload */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label className="field-label" style={{ marginBottom: 0 }}>{t('feedback.screenshot_optional')}</label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleScreenshotSelect}
                            style={{ display: 'none' }}
                        />
                        {screenshotPreview ? (
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                <img
                                    src={screenshotPreview}
                                    alt="Screenshot preview"
                                    style={{ maxWidth: '300px', maxHeight: '200px', borderRadius: '0.5rem', border: '1px solid var(--border)' }}
                                />
                                <button
                                    type="button"
                                    onClick={removeScreenshot}
                                    style={{
                                        position: 'absolute',
                                        top: '-8px',
                                        right: '-8px',
                                        background: 'var(--danger)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '50%',
                                        width: '24px',
                                        height: '24px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    border: '2px dashed var(--border)',
                                    borderRadius: '0.5rem',
                                    padding: '1.25rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                    fontSize: '0.875rem',
                                    transition: 'border-color 0.2s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                            >
                                <Upload size={20} />
                                <span>{t('feedback.upload_screenshot')}</span>
                                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{t('feedback.max_file_size')}</span>
                            </div>
                        )}
                    </div>

                    {/* Desired fix textarea */}
                    <div>
                        <label className="field-label">{t('feedback.desired_fix')}</label>
                        <Input
                            multiline
                            rows={3}
                            className="field-input"
                            value={desiredFix}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDesiredFix(e.target.value)}
                            placeholder={t('feedback.desired_fix_placeholder')}
                        />
                    </div>
                </div>
            </Modal>
        </>
    );
};
