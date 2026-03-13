import type { DeckCategory } from "../types";
import "./CategoryBadge.css";

interface CategoryBadgeProps {
  category: DeckCategory;
}

export default function CategoryBadge({ category }: CategoryBadgeProps) {
  return (
    <span className="category-badge" data-category={category}>
      {category}
    </span>
  );
}
