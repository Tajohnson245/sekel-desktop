import { Modal } from '../UI/Modal';
import { Button } from '../UI';
import type { ImportResult, ImportOptionsDeck } from '../../types/electron';

interface ImportSuccessModalProps {
    result: ImportResult;
    deckOptions: ImportOptionsDeck[];
    onGoToDeck?: (deckId?: string) => void;
    onClose: () => void;
}

export default function ImportSuccessModal({ result, deckOptions, onGoToDeck, onClose }: ImportSuccessModalProps) {
    const createdDeckNames = deckOptions
        .filter(d => d.selected)
        .map(d => d.deckName);

    const usedKeepScheduling = deckOptions.some(d => d.selected && d.scheduling === 'keep');
    const allWarnings = result.mediaWarnings;

    const stats: { value: number | string; label: string }[] = [
        { value: result.notesInserted, label: 'Notes imported' },
        { value: result.cardsInserted, label: 'Cards imported' },
        { value: usedKeepScheduling ? result.reviewsInserted : '—', label: 'Reviews imported' },
        { value: result.mediaExtracted, label: 'Media files stored' },
    ];
    if (result.mediaSkipped > 0) {
        stats.push({ value: result.mediaSkipped, label: 'Media deduplicated' });
    }

    const footer = (
        <>
            {onGoToDeck && (
                <Button variant="primary" onClick={() => onGoToDeck()}>
                    Go to Deck
                </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
                Close
            </Button>
        </>
    );

    return (
        <Modal isOpen title="Import Complete" onClose={onClose} size="md" footer={footer}>
            <div className="import-success-body">
                <div className="import-success-stats">
                    {stats.map(s => (
                        <div key={s.label} className="import-success-stat">
                            <span className="import-success-stat-value">{s.value}</span>
                            <span className="import-success-stat-label">{s.label}</span>
                        </div>
                    ))}
                </div>

                {createdDeckNames.length > 0 && (
                    <div className="import-success-decks">
                        <p className="import-success-decks-title">
                            {result.decksCreated > 0 ? 'Decks created' : 'Decks updated'}
                        </p>
                        <ul className="import-success-deck-list">
                            {createdDeckNames.map(name => (
                                <li key={name}>{name}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {!usedKeepScheduling && (
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        Scheduling reset — all cards start fresh.
                    </p>
                )}

                {allWarnings.length > 0 && (
                    <div className="import-success-warnings">
                        <p className="import-success-warnings-title">Warnings ({allWarnings.length})</p>
                        <ul>
                            {allWarnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                    </div>
                )}
            </div>
        </Modal>
    );
}
