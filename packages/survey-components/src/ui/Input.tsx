"use client";

import "./Input.css";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  list?: string;
}

export default function Input({
  label,
  error,
  hint,
  required,
  id,
  className = "",
  ...props
}: InputProps) {
  return (
    <div className="input-wrapper">
      {label && (
        <label
          htmlFor={id}
          className={`input-label${required ? " input-label--required" : ""}`}
        >
          {label}
        </label>
      )}
      <input
        id={id}
        required={required}
        className={`input${error ? " input--error" : ""} ${className}`.trim()}
        {...props}
      />
      {error && <span className="input-error-msg">{error}</span>}
      {hint && !error && <span className="input-hint">{hint}</span>}
    </div>
  );
}
