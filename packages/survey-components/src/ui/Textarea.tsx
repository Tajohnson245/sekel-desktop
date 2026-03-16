"use client";

import "./Textarea.css";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export default function Textarea({
  label,
  hint,
  id,
  rows = 3,
  className = "",
  ...props
}: TextareaProps) {
  return (
    <div className="textarea-wrapper">
      {label && (
        <label htmlFor={id} className="textarea-label">
          {label}
        </label>
      )}
      {hint && <span className="textarea-hint">{hint}</span>}
      <textarea
        id={id}
        rows={rows}
        className={`textarea ${className}`.trim()}
        {...props}
      />
    </div>
  );
}
