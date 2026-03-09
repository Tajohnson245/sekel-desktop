import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';

interface BaseInputProps {
    label?: string;
    error?: string;
    multiline?: boolean;
    rows?: number;
    className?: string;
    containerClassName?: string;
    labelClassName?: string;
}

type InputProps = BaseInputProps & InputHTMLAttributes<HTMLInputElement>;
type TextareaProps = BaseInputProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps | TextareaProps>(
    ({ label, error, multiline, className = '', containerClassName = '', labelClassName = '', ...props }, ref) => {
        const inputClass = `form-input ${error ? 'input-error' : ''} ${className}`;

        return (
            <div className={`form-group ${containerClassName}`}>
                {label && <label className={`form-label ${labelClassName}`}>{label}</label>}

                {multiline ? (
                    <textarea
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        ref={ref as any}
                        className={inputClass}
                        {...(props as TextareaProps)}
                    />
                ) : (
                    <input
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        ref={ref as any}
                        className={inputClass}
                        {...(props as InputProps)}
                    />
                )}

                {error && <div className="form-error-text">{error}</div>}
            </div>
        );
    }
);

Input.displayName = 'Input';
