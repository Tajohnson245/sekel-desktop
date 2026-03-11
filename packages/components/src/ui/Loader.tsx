import { Loader as LucideLoader } from 'lucide-react';
import './Loader.css';

interface LoaderProps {
    size?: number;
    className?: string;
    center?: boolean;
    text?: string;
}

export const Loader = ({ size = 24, className = '', center = false, text }: LoaderProps) => {
    const loaderContent = (
        <div className={`loader-container ${center ? 'loader-center' : ''} ${className}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LucideLoader className="animate-spin" size={size} />
            {text && <span className="loader-text">{text}</span>}
        </div>
    );

    if (center) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', padding: '2rem' }}>
                {loaderContent}
            </div>
        );
    }

    return loaderContent;
};
