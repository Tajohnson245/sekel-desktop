import { Modal } from '../UI/Modal';
import { Button } from '../UI';
import type { ImportStage } from '../../types/electron';

const STAGE_LABELS: Partial<Record<ImportStage, string>> = {
    'extracting-media':    'media extraction',
    'inserting-decks':     'deck insertion',
    'inserting-note-types':'note type insertion',
    'inserting-notes':     'note insertion',
    'inserting-cards':     'card insertion',
    'inserting-reviews':   'review log insertion',
    'cleaning-up':         'cleanup',
};

function friendlyMessage(error: Error): string {
    const name = error.name;
    if (name === 'UnsupportedFormatError') return error.message;
    if (name === 'InvalidApkgError') return error.message;
    if (name === 'CorruptedZipError') return error.message;
    if (name === 'ValidationError') return error.message;
    if (name === 'CancelledError') return 'The import was cancelled.';
    return 'An unexpected error occurred during import. Please try again.';
}

interface ImportErrorModalProps {
    error: Error;
    failedStage?: ImportStage;
    onRetry: () => void;
    onClose: () => void;
}

export default function ImportErrorModal({ error, failedStage, onRetry, onClose }: ImportErrorModalProps) {
    const isCancelled = error.name === 'CancelledError';

    const footer = (
        <>
            {!isCancelled && (
                <Button variant="primary" onClick={onRetry}>
                    Try Again
                </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
                Close
            </Button>
        </>
    );

    return (
        <Modal
            isOpen
            title={isCancelled ? 'Import Cancelled' : 'Import Failed'}
            onClose={onClose}
            size="sm"
            footer={footer}
        >
            <div className="import-error-body">
                <p className="import-error-message">{friendlyMessage(error)}</p>
                {!isCancelled && failedStage && STAGE_LABELS[failedStage] && (
                    <p className="import-error-stage">
                        Failed during: {STAGE_LABELS[failedStage]}
                    </p>
                )}
            </div>
        </Modal>
    );
}
