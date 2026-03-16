"use client";

import "./StepReview.css";
import type { ProfileData, StudyToolData, WishlistData } from "../types";

const WISHLIST_LABELS: Record<string, string> = {
  biggest_frustration: "Biggest frustration",
  magic_wand: "Magic wand",
  ideal_session: "Ideal session",
  would_pay_for: "Would pay for",
};

interface StepReviewProps {
  profile: ProfileData;
  tools: StudyToolData[];
  wishlist: WishlistData;
  onEdit: (step: number) => void;
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="step-review__row">
      <span className="step-review__row-label">{label}</span>
      {value ? (
        <span className="step-review__row-value">{value}</span>
      ) : (
        <span className="step-review__row-value step-review__row-value--empty">Not provided</span>
      )}
    </div>
  );
}

export default function StepReview({ profile, tools, wishlist, onEdit }: StepReviewProps) {
  return (
    <div className="step-review">
      {/* Profile */}
      <div className="step-review__section">
        <div className="step-review__section-header">
          <h4>About You</h4>
          <button className="step-review__edit-btn" onClick={() => onEdit(0)}>Edit</button>
        </div>
        <div className="step-review__section-body">
          <Row label="Name" value={profile.name} />
          <Row label="Email" value={profile.email} />
          <Row label="School" value={profile.school} />
          <Row label="Year" value={profile.year} />
          <Row label="Specialty" value={profile.specialty} />
          <Row label="Upcoming Exam" value={profile.exam_upcoming} />
          <Row label="Exam Date" value={profile.exam_date} />
        </div>
      </div>

      {/* Tools */}
      <div className="step-review__section">
        <div className="step-review__section-header">
          <h4>Your Tools</h4>
          <button className="step-review__edit-btn" onClick={() => onEdit(1)}>Edit</button>
        </div>
        <div className="step-review__section-body">
          {tools.length === 0 ? (
            <p className="step-review__empty-msg">No tools selected</p>
          ) : (
            <>
              <div className="step-review__tools-list">
                {tools.map((t) => (
                  <span key={t.tool_name} className="step-review__tool-tag">
                    {t.tool_name_other ?? t.tool_name}
                    {t.satisfaction && (
                      <span className="step-review__stars">{"★".repeat(t.satisfaction)}</span>
                    )}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Wishlist */}
      <div className="step-review__section">
        <div className="step-review__section-header">
          <h4>Your Wishlist</h4>
          <button className="step-review__edit-btn" onClick={() => onEdit(2)}>Edit</button>
        </div>
        <div className="step-review__section-body">
          {Object.entries(WISHLIST_LABELS).map(([key, label]) => {
            const val = wishlist[key as keyof WishlistData];
            return val ? <Row key={key} label={label} value={val} /> : null;
          })}
          {!Object.values(wishlist).some(Boolean) && (
            <p className="step-review__empty-msg">No wishlist answers provided</p>
          )}
        </div>
      </div>
    </div>
  );
}
