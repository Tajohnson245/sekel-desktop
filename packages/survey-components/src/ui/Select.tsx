"use client";

import "./Select.css";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
}

export default function Select({
  label,
  options,
  placeholder,
  error,
  required,
  id,
  value,
  className = "",
  ...props
}: SelectProps) {
  return (
    <div className="select-wrapper">
      {label && (
        <label
          htmlFor={id}
          className={`select-label${required ? " select-label--required" : ""}`}
        >
          {label}
        </label>
      )}
      <select
        id={id}
        required={required}
        value={value}
        className={`select${!value ? " select--placeholder" : ""} ${className}`.trim()}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="select-error-msg">{error}</span>}
    </div>
  );
}
