"use client";

import { useState } from "react";
import type { SampleCard } from "../types";
import "./FlipCard.css";

interface FlipCardProps {
  card: SampleCard;
  index: number;
}

export default function FlipCard({ card, index }: FlipCardProps) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className={`flip-card${flipped ? " flip-card--flipped" : ""}`}
      onClick={() => setFlipped((f) => !f)}
      onKeyDown={(e) => e.key === "Enter" || e.key === " " ? setFlipped((f) => !f) : undefined}
      tabIndex={0}
      role="button"
      aria-pressed={flipped}
      aria-label={flipped ? `Card ${index + 1} answer: ${card.back}` : `Card ${index + 1} question: ${card.front}. Click to reveal answer.`}
    >
      <div className="flip-card__inner">
        {/* Front */}
        <div className="flip-card__face flip-card__face--front">
          <span className="flip-card__label">Question</span>
          <p className="flip-card__text">{card.front}</p>
          <span className="flip-card__hint">Click to reveal</span>
        </div>

        {/* Back */}
        <div className="flip-card__face flip-card__face--back">
          <span className="flip-card__label flip-card__label--back">Answer</span>
          <p className="flip-card__text">{card.back}</p>
        </div>
      </div>
    </div>
  );
}
