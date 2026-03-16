"use client";

import "./StepProfile.css";
import Input from "../ui/Input";
import Combobox from "../ui/Combobox";
import type { ProfileData } from "../types";

const YEAR_OPTIONS = [
  "MS1","MS2","MS3","MS4",
  "DO-1","DO-2","DO-3","DO-4",
  "IMG","PGY-1","PGY-2","Other",
];

const EXAM_OPTIONS = [
  "Step 1","Step 2 CK","Step 3",
  "Shelf — Internal Medicine","Shelf — Surgery","Shelf — Pediatrics",
  "Shelf — OB/GYN","Shelf — Psychiatry","Shelf — Family Medicine",
  "Shelf — Neurology","COMLEX Level 1","COMLEX Level 2","NCLEX","Other",
];

const COMMON_SCHOOLS = [
  "Harvard Medical School",
  "Johns Hopkins School of Medicine",
  "Stanford University School of Medicine",
  "UCSF School of Medicine",
  "University of Michigan Medical School",
  "Duke University School of Medicine",
  "Yale School of Medicine",
  "Columbia University Vagelos College of P&S",
  "University of Pennsylvania Perelman School of Medicine",
  "Washington University School of Medicine",
  "NYU Grossman School of Medicine",
  "Mayo Clinic Alix School of Medicine",
  "University of Chicago Pritzker School of Medicine",
  "Vanderbilt University School of Medicine",
  "Emory University School of Medicine",
];

const COMMON_SPECIALTIES = [
  "Internal Medicine","Surgery","Pediatrics","OB/GYN","Psychiatry",
  "Family Medicine","Emergency Medicine","Radiology","Anesthesiology",
  "Neurology","Dermatology","Undecided",
];

interface StepProfileProps {
  data: ProfileData;
  onChange: (data: ProfileData) => void;
  errors?: Partial<Record<keyof ProfileData, string>>;
}

export default function StepProfile({ data, onChange, errors = {} }: StepProfileProps) {
  function set<K extends keyof ProfileData>(key: K, value: ProfileData[K]) {
    onChange({ ...data, [key]: value });
  }

  return (
    <div className="step-profile">
      <div className="step-profile__row">
        <Input
          id="profile-name"
          label="Name"
          placeholder="Optional — we'll keep you anonymous either way"
          value={data.name ?? ""}
          onChange={(e) => set("name", e.target.value)}
        />
        <Input
          id="profile-email"
          label="Email"
          type="email"
          placeholder="Only if you'd like us to follow up"
          value={data.email ?? ""}
          onChange={(e) => set("email", e.target.value)}
        />
      </div>

      <Combobox
        id="profile-school"
        label="School"
        required
        placeholder="Select or type your school"
        options={COMMON_SCHOOLS}
        value={data.school}
        onChange={(v) => set("school", v)}
        error={errors.school}
      />

      <div className="step-profile__row">
        <Combobox
          id="profile-year"
          label="Year"
          required
          placeholder="Select your year"
          options={YEAR_OPTIONS}
          value={data.year}
          onChange={(v) => set("year", v)}
          error={errors.year}
        />
        <Combobox
          id="profile-specialty"
          label="Intended Specialty"
          placeholder="Select or type a specialty"
          options={COMMON_SPECIALTIES}
          value={data.specialty ?? ""}
          onChange={(v) => set("specialty", v)}
        />
      </div>

      <div className="step-profile__row">
        <Combobox
          id="profile-exam"
          label="Upcoming Exam"
          placeholder="Select or type an exam"
          options={EXAM_OPTIONS}
          value={data.exam_upcoming ?? ""}
          onChange={(v) => set("exam_upcoming", v)}
        />
        <Input
          id="profile-exam-date"
          label="Approximate Exam Date"
          type="date"
          value={data.exam_date ?? ""}
          onChange={(e) => set("exam_date", e.target.value)}
        />
      </div>
    </div>
  );
}
