"use client";

import { useState } from "react";
import type { DeckCategory, DeckFormData } from "../types";
import TagInput from "./TagInput";
import FileDropZone from "./FileDropZone";
import DeckCard from "../deck/DeckCard";
import { Toast } from "@sekel/web-components";
import "./AddDeckForm.css";

const CATEGORIES: DeckCategory[] = [
  "Languages", "Medicine", "Science", "Mathematics", "History",
  "Geography", "Computer Science", "Music", "Art", "Law", "Business", "Other",
];

const EMPTY_FORM: DeckFormData = {
  title: "",
  description: "",
  author: "",
  category: "Languages",
  tags: [],
};

type Errors = Partial<Record<keyof DeckFormData, string>>;

export default function AddDeckForm() {
  const [form, setForm] = useState<DeckFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [toastVisible, setToastVisible] = useState(false);

  const set = <K extends keyof DeckFormData>(key: K, value: DeckFormData[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = (): boolean => {
    const errs: Errors = {};
    if (!form.title.trim()) errs.title = "Title is required";
    else if (form.title.length > 100) errs.title = "Title must be 100 characters or fewer";
    if (!form.author.trim()) errs.author = "Author name is required";
    if (!form.description.trim()) errs.description = "Description is required";
    else if (form.description.length > 500) errs.description = "Description must be 500 characters or fewer";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setToastVisible(true);
    setForm(EMPTY_FORM);
    setErrors({});
  };

  // Preview deck (fake id for display only)
  const previewDeck = {
    id: "preview",
    title: form.title || "Deck Title",
    description: form.description || "",
    author: form.author || "Author",
    category: form.category,
    tags: form.tags,
    cardCount: 0,
    downloadCount: 0,
    rating: 0,
    ratingCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sampleCards: [],
  };

  return (
    <>
      <div className="add-deck-layout">
        {/* Form */}
        <form className="add-deck-form" onSubmit={handleSubmit} noValidate aria-label="Add a new deck">
          <h1 className="add-deck-form__title">Add a Deck</h1>
          <p className="add-deck-form__subtitle">
            Share your study deck with the SEKEL community.
          </p>

          {/* Title */}
          <div className="add-deck-form__field">
            <label htmlFor="title" className="add-deck-form__label">
              Title <span aria-hidden="true">*</span>
            </label>
            <input
              id="title"
              type="text"
              className={`add-deck-form__input${errors.title ? " add-deck-form__input--error" : ""}`}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Spanish 5000 Most Common Words"
              maxLength={120}
              aria-describedby={errors.title ? "title-error" : undefined}
              aria-required="true"
            />
            {errors.title && (
              <p id="title-error" className="add-deck-form__error">{errors.title}</p>
            )}
          </div>

          {/* Author */}
          <div className="add-deck-form__field">
            <label htmlFor="author" className="add-deck-form__label">
              Author name <span aria-hidden="true">*</span>
            </label>
            <input
              id="author"
              type="text"
              className={`add-deck-form__input${errors.author ? " add-deck-form__input--error" : ""}`}
              value={form.author}
              onChange={(e) => set("author", e.target.value)}
              placeholder="Your username or name"
              aria-describedby={errors.author ? "author-error" : undefined}
              aria-required="true"
            />
            {errors.author && (
              <p id="author-error" className="add-deck-form__error">{errors.author}</p>
            )}
          </div>

          {/* Description */}
          <div className="add-deck-form__field">
            <div className="add-deck-form__label-row">
              <label htmlFor="description" className="add-deck-form__label">
                Description <span aria-hidden="true">*</span>
              </label>
              <span className="add-deck-form__char-count">
                {form.description.length} / 500
              </span>
            </div>
            <textarea
              id="description"
              className={`add-deck-form__textarea${errors.description ? " add-deck-form__input--error" : ""}`}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Describe what this deck covers and who it's for…"
              maxLength={600}
              rows={4}
              aria-describedby={errors.description ? "desc-error" : undefined}
              aria-required="true"
            />
            {errors.description && (
              <p id="desc-error" className="add-deck-form__error">{errors.description}</p>
            )}
          </div>

          {/* Category */}
          <div className="add-deck-form__field">
            <label htmlFor="category" className="add-deck-form__label">
              Category <span aria-hidden="true">*</span>
            </label>
            <select
              id="category"
              className="add-deck-form__select"
              value={form.category}
              onChange={(e) => set("category", e.target.value as DeckCategory)}
              aria-required="true"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="add-deck-form__field">
            <label className="add-deck-form__label">Tags</label>
            <TagInput
              tags={form.tags}
              onChange={(tags) => set("tags", tags)}
            />
          </div>

          {/* File upload */}
          <div className="add-deck-form__field">
            <label className="add-deck-form__label">Deck file (.apkg)</label>
            <FileDropZone
              file={form.file}
              onChange={(file) => set("file", file)}
            />
          </div>

          <button type="submit" className="add-deck-form__submit">
            Submit Deck
          </button>
        </form>

        {/* Live preview */}
        <div className="add-deck-preview">
          <span className="section-label">— Live Preview —</span>
          <div className="add-deck-preview__card">
            <DeckCard deck={previewDeck} />
          </div>
          <p className="add-deck-preview__hint">
            Preview updates as you type
          </p>
        </div>
      </div>

      <Toast
        message="Deck submitted for review! We'll notify you when it's live."
        visible={toastVisible}
        onDismiss={() => setToastVisible(false)}
      />
    </>
  );
}
