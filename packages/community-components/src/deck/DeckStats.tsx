import { BookOpen, Download, Star, Calendar } from "lucide-react";
import type { Deck } from "../types";
import { formatNumber, formatDate } from "../utils";
import "./DeckStats.css";

interface DeckStatsProps {
  deck: Deck;
}

export default function DeckStats({ deck }: DeckStatsProps) {
  const stats = [
    {
      icon: <BookOpen size={18} aria-hidden="true" />,
      value: formatNumber(deck.cardCount),
      label: "Cards",
    },
    {
      icon: <Download size={18} aria-hidden="true" />,
      value: formatNumber(deck.downloadCount),
      label: "Downloads",
    },
    {
      icon: <Star size={18} aria-hidden="true" />,
      value: deck.rating.toFixed(1),
      label: `Rating (${deck.ratingCount.toLocaleString()})`,
    },
    {
      icon: <Calendar size={18} aria-hidden="true" />,
      value: formatDate(deck.createdAt),
      label: "Added",
    },
  ];

  return (
    <div className="deck-stats">
      {stats.map((stat) => (
        <div key={stat.label} className="deck-stats__item">
          <div className="deck-stats__icon">{stat.icon}</div>
          <div className="deck-stats__value">{stat.value}</div>
          <div className="deck-stats__label">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
