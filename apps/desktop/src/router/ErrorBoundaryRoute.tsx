import { useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '../components/UI';

interface ErrorBoundaryRouteProps {
    variant: 'page' | 'inline';
    resetPath?: string;
    children: React.ReactNode;
}

export default function ErrorBoundaryRoute({ variant, resetPath, children }: ErrorBoundaryRouteProps) {
    const navigate = useNavigate();

    return (
        <ErrorBoundary
            variant={variant}
            onReset={() => resetPath ? navigate(resetPath) : navigate(-1)}
        >
            {children}
        </ErrorBoundary>
    );
}
