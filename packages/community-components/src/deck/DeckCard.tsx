import Link from "next/link";
import { BookOpen, Download } from "lucide-react";
import type { Deck } from "../types";
import { getCategoryGradient, formatNumber } from "../utils";
import StarRating from "../ui/StarRating";
import CategoryBadge from "../ui/CategoryBadge";
import "./DeckCard.css";

interface DeckCardProps {
  deck: Deck;
}

export default function DeckCard({ deck }: DeckCardProps) {
  return (
    <Link href={`/decks/${deck.id}`} className="deck-card" aria-label={`${deck.title} by ${deck.author}`}>
      {/* Thumbnail */}
      <div
        className="deck-card__thumbnail"
        style={{ background: getCategoryGradient(deck.category) }}
        aria-hidden="true"
      >
        <BookOpen size={32} color="rgba(255,255,255,0.7)" />
      </div>

      {/* Body */}
      <div className="deck-card__body">
        <CategoryBadge category={deck.category} />
        <h3 className="deck-card__title">{deck.title}</h3>
        <p className="deck-card__author">by {deck.author}</p>

        <div className="deck-card__footer">
          <StarRating rating={deck.rating} size="sm" />
          <div className="deck-card__stats">
            <span className="deck-card__stat" title="Cards">
              <BookOpen size={11} aria-hidden="true" />
              {formatNumber(deck.cardCount)}
            </span>
            <span className="deck-card__stat" title="Downloads">
              <Download size={11} aria-hidden="true" />
              {formatNumber(deck.downloadCount)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
