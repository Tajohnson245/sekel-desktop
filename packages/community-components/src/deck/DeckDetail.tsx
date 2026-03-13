"use client";

import Link from "next/link";
import { ArrowLeft, Download, Flag, BookOpen } from "lucide-react";
import type { Deck } from "../types";
import { getCategoryGradient } from "../utils";
import StarRating from "../ui/StarRating";
import CategoryBadge from "../ui/CategoryBadge";
import DeckStats from "./DeckStats";
import FlipCard from "./FlipCard";
import "./DeckDetail.css";

interface DeckDetailProps {
  deck: Deck;
}

export default function DeckDetail({ deck }: DeckDetailProps) {
  return (
    <div className="deck-detail">
      {/* Back link */}
      <Link href="/decks" className="deck-detail__back">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to Browse
      </Link>

      {/* Header */}
      <div className="deck-detail__header">
        <div
          className="deck-detail__thumbnail"
          style={{ background: getCategoryGradient(deck.category) }}
          aria-hidden="true"
        >
          <BookOpen size={40} color="rgba(255,255,255,0.7)" />
        </div>

        <div className="deck-detail__meta">
          <CategoryBadge category={deck.category} />
          <h1 className="deck-detail__title">{deck.title}</h1>
          <p className="deck-detail__author">
            by{" "}
            <span className="deck-detail__author-name">{deck.author}</span>
          </p>
          <div className="deck-detail__rating">
            <StarRating rating={deck.rating} ratingCount={deck.ratingCount} size="md" />
          </div>

          <a
            href="#"
            className="deck-detail__download"
            onClick={(e) => e.preventDefault()}
            aria-label="Download deck as .apkg file (coming soon)"
            title="Download .apkg"
          >
            <Download size={16} aria-hidden="true" />
            Download .apkg
          </a>
        </div>
      </div>

      {/* Stats */}
      <DeckStats deck={deck} />

      {/* Description */}
      <section className="deck-detail__section">
        <span className="section-label">— About this deck —</span>
        <p className="deck-detail__description">{deck.description}</p>
      </section>

      {/* Sample cards */}
      {deck.sampleCards.length > 0 && (
        <section className="deck-detail__section">
          <span className="section-label">— Sample Cards —</span>
          <div className="deck-detail__flip-grid">
            {deck.sampleCards.map((card, i) => (
              <FlipCard key={i} card={card} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Tags */}
      {deck.tags.length > 0 && (
        <section className="deck-detail__section">
          <span className="section-label">— Tags —</span>
          <div className="deck-detail__tags">
            {deck.tags.map((tag) => (
              <Link
                key={tag}
                href={`/decks?tags=${encodeURIComponent(tag)}`}
                className="deck-detail__tag"
              >
                #{tag}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Report */}
      <div className="deck-detail__report">
        <button
          className="deck-detail__report-link"
          onClick={(e) => e.preventDefault()}
          aria-label="Report this deck (coming soon)"
        >
          <Flag size={12} aria-hidden="true" />
          Report this deck
        </button>
      </div>
    </div>
  );
}
