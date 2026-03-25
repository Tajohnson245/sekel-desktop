import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button } from '../UI';
import { getExportableCardCount } from '../../lib/queries';

interface ExportModalProps {
    isOpen: boolean;
    deckId: string;
    deckName: string;
    onConfirm: () => void;
    onClose: () => void;
}

export default function ExportModal({ isOpen, deckId, deckName, onConfirm, onClose }: ExportModalProps) {
    const { t } = useTranslation();
    const [counts, setCounts] = useState<{ ankiCards: number; sekelCards: number } | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            getExportableCardCount(deckId)
                .then(setCounts)
                .finally(() => setLoading(false));
        } else {
            setCounts(null);
        }
    }, [isOpen, deckId]);

    const totalCards = counts ? counts.ankiCards + counts.sekelCards : 0;
    const hasExportableCards = (counts?.ankiCards ?? 0) > 0;

    const footer = (
        <>
            <Button variant="secondary" onClick={onClose}>
                {t('export.button_cancel')}
            </Button>
            <Button
                variant="primary"
                onClick={onConfirm}
                disabled={loading || !hasExportableCards}
            >
                {t('export.button_export')}
            </Button>
        </>
    );

    return (
        <Modal isOpen={isOpen} title={t('export.modal_title')} onClose={onClose} size="md" footer={footer}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {loading ? (
                    <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
                ) : counts && hasExportableCards ? (
                    <>
                        <p>
                            {t('export.modal_body', {
                                ankiCards: counts.ankiCards,
                                totalCards: totalCards,
                                deckName,
                            })}
                        </p>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                            {t('export.modal_body_sekel_only')}
                        </p>
                    </>
                ) : (
                    <p style={{ color: 'var(--text-secondary)' }}>
                        {t('export.modal_no_anki_cards')}
                    </p>
                )}
            </div>
        </Modal>
    );
}
