"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Search, X } from "lucide-react";
import "./SearchBar.css";

interface SearchBarProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export default function SearchBar({
  value,
  onChange,
  placeholder = "Search decks by title, author, or tag…",
}: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync localValue when parent value resets externally
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setLocalValue(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onChange(val);
      }, 300);
    },
    [onChange]
  );

  const handleClear = () => {
    setLocalValue("");
    onChange("");
    inputRef.current?.focus();
  };

  // Cmd/Ctrl+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="search-bar">
      <Search size={16} className="search-bar__icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        className="search-bar__input"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label="Search decks"
        autoComplete="off"
      />
      {localValue && (
        <button
          className="search-bar__clear"
          onClick={handleClear}
          aria-label="Clear search"
          type="button"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
      <kbd className="search-bar__shortcut" aria-hidden="true">⌘K</kbd>
    </div>
  );
}
