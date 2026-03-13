"use client";

import { useState, useRef } from "react";
import { X } from "lucide-react";
import "./TagInput.css";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  error?: string;
}

export default function TagInput({
  tags,
  onChange,
  placeholder = "Add tags (press Enter or comma to add)",
  error,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (tag && !tags.includes(tag) && tags.length < 10) {
      onChange([...tags, tag]);
    }
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) addTag(inputValue);
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
    inputRef.current?.focus();
  };

  return (
    <div className={`tag-input${error ? " tag-input--error" : ""}`}>
      <div
        className="tag-input__field"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span key={tag} className="tag-input__pill">
            #{tag}
            <button
              type="button"
              className="tag-input__remove"
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              aria-label={`Remove tag ${tag}`}
            >
              <X size={10} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="tag-input__input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={tags.length === 0 ? placeholder : ""}
          aria-label="Add tag"
        />
      </div>
      {error && <p className="tag-input__error">{error}</p>}
    </div>
  );
}
