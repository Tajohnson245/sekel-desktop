import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader } from 'lucide-react';
import './Button.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    icon?: React.ReactNode;
    fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className = '', variant = 'primary', size = 'md', isLoading, icon, fullWidth, children, disabled, ...props }, ref) => {
        const baseClass = variant === 'icon' ? 'btn-icon' : 'btn';

        let variantClass = '';
        if (variant !== 'icon') {
            variantClass = `btn-${variant}`;
        }

        const sizeClass = size === 'lg' ? 'btn-large' : '';
        const widthClass = fullWidth ? 'w-full' : '';

        return (
            <button
                ref={ref}
                className={`${baseClass} ${variantClass} ${sizeClass} ${widthClass} ${className}`}
                disabled={disabled || isLoading}
                {...props}
            >
                {isLoading && <Loader className="animate-spin" size={16} />}
                {!isLoading && icon && <span className="btn-icon-wrapper">{icon}</span>}
                {children}
            </button>
        );
    }
);

Button.displayName = 'Button';
