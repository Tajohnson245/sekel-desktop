import { SelectHTMLAttributes, forwardRef } from 'react';

interface SelectOption {
    label: string;
    value: string | number;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
    options: SelectOption[];
    placeholder?: string;
    containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
    ({ label, error, options, placeholder, className = '', containerClassName = '', children, ...props }, ref) => {
        return (
            <div className={`form-group ${containerClassName}`}>
                {label && <label className="form-label">{label}</label>}
                <select
                    ref={ref}
                    className={`form-select ${error ? 'input-error' : ''} ${className}`}
                    {...props}
                >
                    {placeholder && <option value="">{placeholder}</option>}
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                    {children}
                </select>
                {error && <div className="form-error-text">{error}</div>}
            </div>
        );
    }
);

Select.displayName = 'Select';
