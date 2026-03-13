"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Deck, DeckCategory, SearchParams } from "../types";
import DeckCard from "./DeckCard";
import SkeletonCard from "./SkeletonCard";
import SearchBar from "../search/SearchBar";
import SearchFilters from "../search/SearchFilters";
import Pagination from "../ui/Pagination";
import "./DeckGrid.css";

interface DeckGridProps {
  initialDecks: Deck[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  initialQuery: string;
  initialCategory?: DeckCategory;
  initialSort: SearchParams["sortBy"];
  initialTags: string[];
  allTags: string[];
}

const SKELETONS = Array.from({ length: 12 });

export default function DeckGrid({
  initialDecks,
  currentPage,
  totalPages,
  totalCount,
  initialQuery,
  initialCategory,
  initialSort,
  initialTags,
  allTags,
}: DeckGridProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  // Track when searchParams change → show skeleton briefly
  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, [searchParams]);

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(updates)) {
        if (val) {
          params.set(key, val);
        } else {
          params.delete(key);
        }
      }
      // Reset to page 1 on any filter change (unless explicitly setting page)
      if (!("page" in updates)) {
        params.delete("page");
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const handleQueryChange = (q: string) => updateParams({ query: q || undefined });
  const handleCategoryChange = (cat: DeckCategory | undefined) =>
    updateParams({ category: cat });
  const handleSortChange = (sort: SearchParams["sortBy"]) =>
    updateParams({ sort });
  const handleTagToggle = (tag: string) => {
    const tags = new Set(initialTags);
    if (tags.has(tag)) {
      tags.delete(tag);
    } else {
      tags.add(tag);
    }
    updateParams({ tags: tags.size > 0 ? Array.from(tags).join(",") : undefined });
  };
  const handlePageChange = (page: number) =>
    updateParams({ page: page > 1 ? String(page) : undefined });

  return (
    <div className="deck-grid-wrapper">
      {/* Search + filters */}
      <div className="deck-grid__controls">
        <SearchBar value={initialQuery} onChange={handleQueryChange} />
        <SearchFilters
          category={initialCategory}
          sortBy={initialSort}
          activeTags={initialTags}
          allTags={allTags}
          onCategoryChange={handleCategoryChange}
          onSortChange={handleSortChange}
          onTagToggle={handleTagToggle}
        />
      </div>

      {/* Results count */}
      <p className="deck-grid__count">
        {totalCount} {totalCount === 1 ? "deck" : "decks"} found
      </p>

      {/* Grid */}
      {isLoading ? (
        <div className="deck-grid">
          {SKELETONS.map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : initialDecks.length === 0 ? (
        <div className="deck-grid__empty">
          <p className="deck-grid__empty-title">No decks found</p>
          <p className="deck-grid__empty-sub">
            Try a different search term or clear some filters.
          </p>
        </div>
      ) : (
        <div className="deck-grid">
          {initialDecks.map((deck) => (
            <DeckCard key={deck.id} deck={deck} />
          ))}
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
