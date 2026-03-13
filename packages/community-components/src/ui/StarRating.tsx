import "./StarRating.css";

interface StarRatingProps {
  rating: number; // 1–5
  ratingCount?: number;
  size?: "sm" | "md";
}

export default function StarRating({ rating, ratingCount, size = "sm" }: StarRatingProps) {
  const stars = Array.from({ length: 5 }, (_, i) => {
    const filled = i < Math.floor(rating);
    const partial = !filled && i < rating;
    return { filled, partial };
  });

  return (
    <div className={`star-rating star-rating--${size}`} aria-label={`Rating: ${rating} out of 5`}>
      <div className="star-rating__stars" aria-hidden="true">
        {stars.map((star, i) => (
          <svg
            key={i}
            className={`star-rating__star${star.filled ? " star-rating__star--filled" : ""}${star.partial ? " star-rating__star--partial" : ""}`}
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {star.partial && (
              <defs>
                <linearGradient id={`partial-${i}`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset={`${(rating % 1) * 100}%`} stopColor="var(--teal)" />
                  <stop offset={`${(rating % 1) * 100}%`} stopColor="var(--cloud)" />
                </linearGradient>
              </defs>
            )}
            <path
              d="M10 1.25l2.472 5.009 5.528.804-4 3.898.944 5.504L10 13.75l-4.944 2.695.944-5.504-4-3.898 5.528-.804L10 1.25z"
              fill={
                star.filled
                  ? "var(--teal)"
                  : star.partial
                  ? `url(#partial-${i})`
                  : "var(--cloud)"
              }
            />
          </svg>
        ))}
      </div>
      {ratingCount !== undefined && (
        <span className="star-rating__count">({ratingCount.toLocaleString()})</span>
      )}
    </div>
  );
}
