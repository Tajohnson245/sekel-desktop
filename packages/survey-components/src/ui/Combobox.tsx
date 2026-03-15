"use client";

import { useState, useRef, useEffect } from "react";
import "./Combobox.css";

interface ComboboxProps {
  id?: string;
  label?: string;
  placeholder?: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
}

export default function Combobox({
  id,
  label,
  placeholder,
  options,
  value,
  onChange,
  required,
  error,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = value
    ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase()))
    : options;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      onChange(filtered[highlighted]);
      setOpen(false);
      setHighlighted(-1);
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlighted(-1);
    }
  }

  function select(option: string) {
    onChange(option);
    setOpen(false);
    setHighlighted(-1);
    inputRef.current?.focus();
  }

  return (
    <div className="combobox-wrapper" ref={wrapperRef}>
      {label && (
        <label
          htmlFor={id}
          className={`combobox-label${required ? " combobox-label--required" : ""}`}
        >
          {label}
        </label>
      )}
      <div className="combobox-input-row">
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={value}
          className={`combobox-input${error ? " combobox-input--error" : ""}`}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setHighlighted(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <svg
          className={`combobox-chevron${open ? " combobox-chevron--open" : ""}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>

        {open && (
          <div className="combobox-dropdown" role="listbox">
            {filtered.length > 0 ? (
              filtered.map((opt, i) => (
                <div
                  key={opt}
                  role="option"
                  aria-selected={opt === value}
                  className={[
                    "combobox-option",
                    i === highlighted ? "combobox-option--highlighted" : "",
                    opt === value ? "combobox-option--selected" : "",
                  ].filter(Boolean).join(" ")}
                  onMouseDown={(e) => { e.preventDefault(); select(opt); }}
                  onMouseEnter={() => setHighlighted(i)}
                >
                  {opt}
                </div>
              ))
            ) : (
              <div className="combobox-no-results">No matches — your entry will be saved as-is</div>
            )}
          </div>
        )}
      </div>
      {error && <span className="combobox-error-msg">{error}</span>}
    </div>
  );
}
