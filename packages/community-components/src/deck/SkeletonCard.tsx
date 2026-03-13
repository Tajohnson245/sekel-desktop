import "./SkeletonCard.css";

export default function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton-card__thumbnail skeleton-pulse" />
      <div className="skeleton-card__body">
        <div className="skeleton-card__badge skeleton-pulse" />
        <div className="skeleton-card__title skeleton-pulse" />
        <div className="skeleton-card__title skeleton-card__title--short skeleton-pulse" />
        <div className="skeleton-card__author skeleton-pulse" />
        <div className="skeleton-card__stats">
          <div className="skeleton-card__stat skeleton-pulse" />
          <div className="skeleton-card__stat skeleton-pulse" />
        </div>
      </div>
    </div>
  );
}
