"use client";

import { useState } from "react";
import "./SurveyShell.css";
import Button from "../ui/Button";
import StepProfile from "./StepProfile";
import StepTools from "./StepTools";
import StepWishlist from "./StepWishlist";
import StepReview from "./StepReview";
import type { ProfileData, StudyToolData, WishlistData, SurveyPayload } from "../types";

const STEPS = [
  { label: "About You",    description: "Your academic profile" },
  { label: "Your Tools",   description: "What you currently use" },
  { label: "Your Wishlist",description: "What you want" },
  { label: "Review",       description: "Confirm and submit" },
];

const EMPTY_PROFILE: ProfileData = { school: "", year: "" };
const EMPTY_WISHLIST: WishlistData = {};

interface SurveyShellProps {
  onSubmit: (payload: SurveyPayload) => Promise<void>;
}

export default function SurveyShell({ onSubmit }: SurveyShellProps) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE);
  const [tools, setTools] = useState<StudyToolData[]>([]);
  const [wishlist, setWishlist] = useState<WishlistData>(EMPTY_WISHLIST);
  const [profileErrors, setProfileErrors] = useState<Partial<Record<keyof ProfileData, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validateProfile(): boolean {
    const errs: typeof profileErrors = {};
    if (!profile.school.trim()) errs.school = "School is required";
    if (!profile.year) errs.year = "Year is required";
    setProfileErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (step === 0 && !validateProfile()) return;
    setStep((s) => s + 1);
  }

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit({ profile, tools, wishlist });
    } catch {
      setSubmitError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="survey-shell">
      {/* Stepper */}
      <div className="survey-shell__header">
        <div className="survey-shell__stepper">
          {STEPS.map((s, i) => (
            <div key={i} className="survey-shell__step-item">
              <div className="survey-shell__step-pill">
                <div
                  className={[
                    "survey-shell__step-dot",
                    i === step ? "survey-shell__step-dot--active" : "",
                    i < step ? "survey-shell__step-dot--done" : "",
                  ].filter(Boolean).join(" ")}
                >
                  {i < step ? "✓" : i + 1}
                </div>
                <span
                  className={`survey-shell__step-label${i === step ? " survey-shell__step-label--active" : ""}`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`survey-shell__step-connector${i < step ? " survey-shell__step-connector--done" : ""}`} />
              )}
            </div>
          ))}
        </div>

        <h2 className="survey-shell__title">{STEPS[step].label}</h2>
        <p className="survey-shell__subtitle">{STEPS[step].description}</p>
      </div>

      {/* Step body */}
      <div className="survey-shell__body">
        {step === 0 && (
          <StepProfile data={profile} onChange={setProfile} errors={profileErrors} />
        )}
        {step === 1 && (
          <StepTools tools={tools} onChange={setTools} />
        )}
        {step === 2 && (
          <StepWishlist data={wishlist} onChange={setWishlist} />
        )}
        {step === 3 && (
          <StepReview
            profile={profile}
            tools={tools}
            wishlist={wishlist}
            onEdit={(s) => setStep(s)}
          />
        )}
      </div>

      {/* Navigation */}
      {submitError && <p className="survey-shell__error">{submitError}</p>}
      <div className={`survey-shell__nav${step === 0 ? " survey-shell__nav--end" : ""}`}>
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={submitting}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 && (
          <Button onClick={handleNext}>Next</Button>
        )}
        {step === STEPS.length - 1 && (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        )}
      </div>
    </div>
  );
}
