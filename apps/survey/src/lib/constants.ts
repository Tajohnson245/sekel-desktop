export const TOOL_OPTIONS = [
  "Anki",
  "UWorld",
  "AMBOSS",
  "Sketchy",
  "Pathoma",
  "Boards & Beyond",
  "First Aid",
  "Osmosis",
  "Picmonic",
  "Firecracker",
  "Other",
] as const;

export type ToolOption = (typeof TOOL_OPTIONS)[number];

export const YEAR_OPTIONS = [
  "MS1",
  "MS2",
  "MS3",
  "MS4",
  "OMS1",
  "OMS2",
  "OMS3",
  "OMS4",
  "IMG",
  "PGY-1",
  "PGY-2",
  "Other",
] as const;

export type YearOption = (typeof YEAR_OPTIONS)[number];

export const EXAM_OPTIONS = [
  "Step 1",
  "Step 2 CK",
  "Step 3",
  "Shelf — Internal Medicine",
  "Shelf — Surgery",
  "Shelf — Pediatrics",
  "Shelf — OB/GYN",
  "Shelf — Psychiatry",
  "Shelf — Family Medicine",
  "Shelf — Neurology",
  "COMLEX Level 1",
  "COMLEX Level 2",
  "NCLEX",
  "Other",
] as const;

export type ExamOption = (typeof EXAM_OPTIONS)[number];

export const FREQUENCY_OPTIONS = [
  "Daily",
  "Few times a week",
  "Weekly",
  "Rarely",
] as const;

export type FrequencyOption = (typeof FREQUENCY_OPTIONS)[number];

export const COMMON_SCHOOLS = [
  // MD Programs
  "Case Western Reserve University School of Medicine",
  "The Ohio State University College of Medicine",
  "University of Cincinnati College of Medicine",
  "University of Toledo College of Medicine and Life Sciences",
  "Northeast Ohio Medical University (NEOMED)",
  "Wright State University Boonshoft School of Medicine",
  // DO Programs
  "Ohio University Heritage College of Osteopathic Medicine",
  "Lake Erie College of Osteopathic Medicine — Bradenton (Sylvania)",
  "Mercy Health — St. Vincent Medical Center (DO)",
] as const;

export const COMMON_SPECIALTIES = [
  "Internal Medicine",
  "Surgery",
  "Pediatrics",
  "OB/GYN",
  "Psychiatry",
  "Family Medicine",
  "Emergency Medicine",
  "Radiology",
  "Anesthesiology",
  "Neurology",
  "Orthopedic Surgery",
  "Dermatology",
  "Ophthalmology",
  "Pathology",
  "Undecided",
] as const;

export interface WishlistQuestion {
  key: string;
  label: string;
  placeholder: string;
}

export const WISHLIST_QUESTIONS: WishlistQuestion[] = [
  {
    key: "biggest_frustration",
    label: "What's the single most frustrating thing about how you study right now?",
    placeholder: "e.g. I spend more time making cards than actually studying them...",
  },
  {
    key: "magic_wand",
    label: "If you could snap your fingers and change one thing about your study tools, what would it be?",
    placeholder: "e.g. I wish Anki could automatically generate high-yield cards from my lecture slides...",
  },
  {
    key: "ideal_session",
    label: "Describe your ideal 30-minute study session. What does the tool do for you?",
    placeholder: "e.g. I open the app, it knows exactly which cards I'm about to forget, and walks me through them with explanations...",
  },
  {
    key: "would_pay_for",
    label: "Is there a study feature you'd genuinely pay for that doesn't exist yet?",
    placeholder: "Even one sentence helps us build something better.",
  },
];

export const STEPS = [
  { label: "About You", description: "Your academic profile" },
  { label: "Your Tools", description: "What you currently use" },
  { label: "Your Wishlist", description: "What you want" },
  { label: "Review", description: "Confirm and submit" },
] as const;
