"use client";

import "./StepWishlist.css";
import Textarea from "../ui/Textarea";
import type { WishlistData } from "../types";

const QUESTIONS = [
  {
    key: "biggest_frustration" as const,
    label: "What's the single most frustrating thing about how you study right now?",
    placeholder: "e.g. I spend more time making cards than actually studying them...",
  },
  {
    key: "magic_wand" as const,
    label: "If you could snap your fingers and change one thing about your study tools, what would it be?",
    placeholder: "e.g. I wish Anki could automatically generate high-yield cards from my lecture slides...",
  },
  {
    key: "ideal_session" as const,
    label: "Describe your ideal 30-minute study session. What does the tool do for you?",
    placeholder: "e.g. I open the app, it knows exactly which cards I'm about to forget...",
  },
  {
    key: "would_pay_for" as const,
    label: "Is there a study feature you'd genuinely pay for that doesn't exist yet?",
    placeholder: "Even one sentence helps us build something better.",
  },
];

interface StepWishlistProps {
  data: WishlistData;
  onChange: (data: WishlistData) => void;
}

export default function StepWishlist({ data, onChange }: StepWishlistProps) {
  return (
    <div className="step-wishlist">
      {QUESTIONS.map((q, i) => (
        <div key={q.key} className="step-wishlist__question">
          <span className="step-wishlist__number">Question {i + 1}</span>
          <label className="step-wishlist__label" htmlFor={`wishlist-${q.key}`}>
            {q.label}
          </label>
          <Textarea
            id={`wishlist-${q.key}`}
            rows={3}
            placeholder={q.placeholder}
            value={data[q.key] ?? ""}
            onChange={(e) => onChange({ ...data, [q.key]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}
