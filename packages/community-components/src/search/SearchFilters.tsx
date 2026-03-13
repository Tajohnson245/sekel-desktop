"use client";

import type { DeckCategory, SearchParams } from "../types";
import "./SearchFilters.css";

const CATEGORIES: DeckCategory[] = [
  "Languages", "Medicine", "Science", "Mathematics", "History",
  "Geography", "Computer Science", "Music", "Art", "Law", "Business", "Other",
];

const SORT_OPTIONS: { value: SearchParams["sortBy"]; label: string }[] = [
  { value: "popular", label: "Most Popular" },
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Highest Rated" },
  { value: "most-cards", label: "Most Cards" },
];

interface SearchFiltersProps {
  category?: DeckCategory;
  sortBy: SearchParams["sortBy"];
  activeTags: string[];
  allTags: string[];
  onCategoryChange: (cat: DeckCategory | undefined) => void;
  onSortChange: (sort: SearchParams["sortBy"]) => void;
  onTagToggle: (tag: string) => void;
}

export default function SearchFilters({
  category,
  sortBy,
  activeTags,
  allTags,
  onCategoryChange,
  onSortChange,
  onTagToggle,
}: SearchFiltersProps) {
  return (
    <div className="search-filters">
      {/* Category pills */}
      <div className="search-filters__section">
        <span className="search-filters__label">Category</span>
        <div className="search-filters__pills">
          <button
            className={`search-filters__pill${!category ? " search-filters__pill--active" : ""}`}
            onClick={() => onCategoryChange(undefined)}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`search-filters__pill${category === cat ? " search-filters__pill--active" : ""}`}
              onClick={() => onCategoryChange(category === cat ? undefined : cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Sort + active tag pills row */}
      <div className="search-filters__row">
        <div className="search-filters__sort">
          <label htmlFor="sort-select" className="search-filters__label">
            Sort by
          </label>
          <select
            id="sort-select"
            className="search-filters__select"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SearchParams["sortBy"])}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {activeTags.length > 0 && (
          <div className="search-filters__active-tags">
            {activeTags.map((tag) => (
              <button
                key={tag}
                className="search-filters__tag search-filters__tag--active"
                onClick={() => onTagToggle(tag)}
                aria-label={`Remove tag: ${tag}`}
              >
                #{tag} &times;
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Popular tags */}
      {allTags.length > 0 && (
        <div className="search-filters__section">
          <span className="search-filters__label">Tags</span>
          <div className="search-filters__pills search-filters__pills--tags">
            {allTags.slice(0, 24).map((tag) => (
              <button
                key={tag}
                className={`search-filters__tag${activeTags.includes(tag) ? " search-filters__tag--active" : ""}`}
                onClick={() => onTagToggle(tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
