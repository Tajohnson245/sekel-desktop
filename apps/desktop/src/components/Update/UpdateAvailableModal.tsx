import { useEffect, useState } from 'react';
import { Modal, Button } from '../UI';
import type { UpdateDownloadedPayload } from '../../types/electron';
import './Update.css';

const RELEASES_REPO = 'Tajohnson245/sekel';

function parseBullets(notes: string): string[] {
    return notes
        .split('\n')
        .map((line) => line.trim().replace(/^[-*]\s+/, ''))
        .filter((line) => line.length > 0);
}

export default function UpdateAvailableModal() {
    const [payload, setPayload] = useState<UpdateDownloadedPayload | null>(null);
    const [installing, setInstalling] = useState(false);

    useEffect(() => {
        return window.electronAPI.update.onDownloaded((data) => setPayload(data));
    }, []);

    if (!payload) return null;

    const bullets = payload.notes ? parseBullets(payload.notes) : [];
    const tag = payload.version.startsWith('v') ? payload.version : `v${payload.version}`;
    const releaseUrl = `https://github.com/${RELEASES_REPO}/releases/tag/${tag}`;

    const handleInstall = async () => {
        setInstalling(true);
        try {
            await window.electronAPI.update.install();
        } catch {
            setInstalling(false);
        }
    };

    const footer = (
        <>
            <Button variant="secondary" onClick={() => setPayload(null)} disabled={installing}>
                Later
            </Button>
            <Button variant="primary" onClick={handleInstall} disabled={installing}>
                {installing ? 'Restarting…' : 'Install & Restart'}
            </Button>
        </>
    );

    return (
        <Modal
            isOpen
            title={`Update available — ${tag}`}
            onClose={() => setPayload(null)}
            size="md"
            footer={footer}
        >
            <div className="update-modal-body">
                <p className="update-modal-intro">
                    {bullets.length > 0
                        ? 'A new version of Sekel has been downloaded. Here is what changed:'
                        : 'A new version of Sekel has been downloaded.'}
                </p>

                {bullets.length > 0 ? (
                    <ul className="update-notes-list">
                        {bullets.map((b, i) => (
                            <li key={i}>{b}</li>
                        ))}
                    </ul>
                ) : (
                    <p className="update-modal-fallback">
                        Release notes are not yet available.{' '}
                        <a href={releaseUrl} target="_blank" rel="noreferrer">
                            View on GitHub
                        </a>
                    </p>
                )}
            </div>
        </Modal>
    );
}
