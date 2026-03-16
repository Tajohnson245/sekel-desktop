"use client";

import { useRouter } from "next/navigation";
import { SurveyShell } from "@sekel/survey-components";
import type { SurveyPayload } from "@sekel/survey-components";

export default function SurveyPage() {
  const router = useRouter();

  async function handleSubmit(payload: SurveyPayload) {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Submission failed");
    }

    router.push("/thank-you");
  }

  return <SurveyShell onSubmit={handleSubmit} />;
}
