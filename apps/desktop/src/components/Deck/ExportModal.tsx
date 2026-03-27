import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, ToggleSwitch } from '../UI';
import { getExportableCardCount } from '../../lib/queries';

type ExportFormat = 'apkg' | 'sekel';

interface ExportModalProps {
    isOpen: boolean;
    deckId: string;
    deckName: string;
    userId: string;
    onConfirm: () => void;
    onClose: () => void;
}

export default function ExportModal({ isOpen, deckId, deckName, userId, onConfirm, onClose }: ExportModalProps) {
    const { t } = useTranslation();
    const [counts, setCounts] = useState<{ ankiCards: number; sekelCards: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [format, setFormat] = useState<ExportFormat>('sekel');
    const [includeMedia, setIncludeMedia] = useState(true);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            getExportableCardCount(deckId)
                .then(setCounts)
                .finally(() => setLoading(false));
        } else {
            setCounts(null);
            setFormat('sekel');
            setIncludeMedia(true);
        }
    }, [isOpen, deckId]);

    const totalCards = counts ? counts.ankiCards + counts.sekelCards : 0;
    const hasAnkiCards = (counts?.ankiCards ?? 0) > 0;
    const canExport = format === 'sekel' ? totalCards > 0 : hasAnkiCards;

    const handleExport = async () => {
        setExporting(true);
        try {
            if (format === 'sekel') {
                await window.electronAPI.db.exportSekel(userId, deckId, includeMedia);
            } else {
                onConfirm();
                return;
            }
            onClose();
        } catch {
            // Error handling done by caller
        } finally {
            setExporting(false);
        }
    };

    const footer = (
        <>
            <Button variant="secondary" onClick={onClose} disabled={exporting}>
                {t('export.button_cancel')}
            </Button>
            <Button
                variant="primary"
                onClick={handleExport}
                disabled={loading || !canExport || exporting}
            >
                {exporting ? t('common.loading') : t('export.button_export')}
            </Button>
        </>
    );

    return (
        <Modal isOpen={isOpen} title={t('export.modal_title')} onClose={onClose} size="md" footer={footer}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {loading ? (
                    <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
                ) : (
                    <>
                        {/* Format Selection */}
                        <div>
                            <label className="field-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                                {t('export.format_label')}
                            </label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => setFormat('sekel')}
                                    style={{
                                        flex: 1,
                                        padding: '0.6rem 0.8rem',
                                        borderRadius: '8px',
                                        border: `2px solid ${format === 'sekel' ? 'var(--primary)' : 'var(--border)'}`,
                                        background: format === 'sekel' ? 'var(--primary-bg, rgba(99,102,241,0.1))' : 'var(--card-bg)',
                                        color: 'var(--text)',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                    }}
                                >
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>.sekel</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                        {t('export.format_sekel_desc')}
                                    </div>
                                </button>
                                <button
                                    onClick={() => setFormat('apkg')}
                                    style={{
                                        flex: 1,
                                        padding: '0.6rem 0.8rem',
                                        borderRadius: '8px',
                                        border: `2px solid ${format === 'apkg' ? 'var(--primary)' : 'var(--border)'}`,
                                        background: format === 'apkg' ? 'var(--primary-bg, rgba(99,102,241,0.1))' : 'var(--card-bg)',
                                        color: 'var(--text)',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        opacity: hasAnkiCards ? 1 : 0.5,
                                    }}
                                    disabled={!hasAnkiCards}
                                >
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>.apkg</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                        {t('export.format_apkg_desc')}
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* Card counts */}
                        {counts && (
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {format === 'sekel' ? (
                                    <p>{t('export.sekel_body', { totalCards })}</p>
                                ) : hasAnkiCards ? (
                                    <>
                                        <p>{t('export.modal_body', { ankiCards: counts.ankiCards, totalCards, deckName })}</p>
                                        <p style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                                            {t('export.modal_body_sekel_only')}
                                        </p>
                                    </>
                                ) : (
                                    <p>{t('export.modal_no_anki_cards')}</p>
                                )}
                            </div>
                        )}

                        {/* Include media toggle (sekel format only) */}
                        {format === 'sekel' && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <label className="field-label">{t('export.include_media')}</label>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                                        {t('export.include_media_desc')}
                                    </p>
                                </div>
                                <ToggleSwitch checked={includeMedia} onChange={setIncludeMedia} />
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
}
