"use client";

import { useState, useRef } from "react";
import { Upload, File, X } from "lucide-react";
import "./FileDropZone.css";

interface FileDropZoneProps {
  file?: File;
  onChange: (file: File | undefined) => void;
  error?: string;
}

export default function FileDropZone({ file, onChange, error }: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onChange(dropped);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) onChange(selected);
  };

  return (
    <div className={`file-drop${isDragOver ? " file-drop--drag-over" : ""}${error ? " file-drop--error" : ""}`}>
      {file ? (
        <div className="file-drop__selected">
          <File size={20} className="file-drop__file-icon" aria-hidden="true" />
          <span className="file-drop__filename">{file.name}</span>
          <button
            type="button"
            className="file-drop__remove"
            onClick={() => onChange(undefined)}
            aria-label="Remove file"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div
          className="file-drop__zone"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          aria-label="Upload .apkg file"
        >
          <Upload size={24} className="file-drop__upload-icon" aria-hidden="true" />
          <p className="file-drop__primary">
            Drag & drop your <code>.apkg</code> file here
          </p>
          <p className="file-drop__secondary">or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            accept=".apkg"
            className="file-drop__input"
            onChange={handleInputChange}
            aria-hidden="true"
          />
        </div>
      )}
      {error && <p className="file-drop__error">{error}</p>}
    </div>
  );
}
