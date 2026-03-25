import { Timer } from 'lucide-react';

interface StudyTimerProps {
    elapsedSeconds: number;
    maxSeconds: number;
    visible: boolean;
}

export default function StudyTimer({ elapsedSeconds, maxSeconds, visible }: StudyTimerProps) {
    if (!visible) return null;

    const capped = Math.min(elapsedSeconds, maxSeconds);
    const minutes = Math.floor(capped / 60);
    const seconds = capped % 60;
    const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const ratio = maxSeconds > 0 ? elapsedSeconds / maxSeconds : 0;
    const colorClass =
        ratio >= 1 ? 'study-timer--danger' :
        ratio >= 0.75 ? 'study-timer--warning' :
        '';

    return (
        <span className={`study-timer ${colorClass}`}>
            <Timer size={14} />
            {display}
        </span>
    );
}
