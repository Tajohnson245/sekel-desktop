import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  school: z.string().min(1),
  year: z.string().min(1),
  specialty: z.string().optional(),
  exam_upcoming: z.string().optional(),
  exam_date: z.string().optional(),
});

const studyToolSchema = z.object({
  tool_name: z.string().min(1),
  tool_name_other: z.string().optional(),
  usage_frequency: z.string().optional(),
  satisfaction: z.number().int().min(1).max(5).optional(),
  pros: z.string().optional(),
  cons: z.string().optional(),
});

const surveyPayloadSchema = z.object({
  profile: profileSchema,
  tools: z.array(studyToolSchema),
  wishlist: z.object({
    biggest_frustration: z.string().optional(),
    magic_wand: z.string().optional(),
    ideal_session: z.string().optional(),
    would_pay_for: z.string().optional(),
  }),
});

const WISHLIST_QUESTION_TEXTS: Record<string, string> = {
  biggest_frustration: "What's the single most frustrating thing about how you study right now?",
  magic_wand: "If you could snap your fingers and change one thing about your study tools, what would it be?",
  ideal_session: "Describe your ideal 30-minute study session. What does the tool do for you?",
  would_pay_for: "Is there a study feature you'd genuinely pay for that doesn't exist yet?",
};

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = surveyPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  const { profile, tools, wishlist } = parsed.data;
  const db = await createServerClient();

  // 1. Insert respondent
  const { data: respondent, error: respondentError } = await db
    .from("respondents")
    .insert({
      name: profile.name || null,
      email: profile.email || null,
      school: profile.school,
      year: profile.year,
      specialty: profile.specialty || null,
      exam_upcoming: profile.exam_upcoming || null,
      exam_date: profile.exam_date || null,
    })
    .select("id")
    .single();

  if (respondentError || !respondent) {
    console.error("respondent insert error", respondentError);
    return NextResponse.json({ error: "Failed to save response" }, { status: 500 });
  }

  const respondentId = respondent.id;

  // 2. Insert study_tools and survey_responses in parallel
  const toolRows = tools.map((t) => ({
    respondent_id: respondentId,
    tool_name: t.tool_name === "Other" && t.tool_name_other ? t.tool_name_other : t.tool_name,
    usage_frequency: t.usage_frequency ?? null,
    satisfaction: t.satisfaction ?? null,
    pros: t.pros || null,
    cons: t.cons || null,
  }));

  const responseRows = (Object.entries(wishlist) as [string, string | undefined][])
    .filter(([, answer]) => answer && answer.trim())
    .map(([key, answer]) => ({
      respondent_id: respondentId,
      question_key: key,
      question_text: WISHLIST_QUESTION_TEXTS[key] ?? key,
      answer: answer!.trim(),
    }));

  const [toolsResult, responsesResult] = await Promise.all([
    toolRows.length > 0 ? db.from("study_tools").insert(toolRows) : Promise.resolve({ error: null }),
    responseRows.length > 0 ? db.from("survey_responses").insert(responseRows) : Promise.resolve({ error: null }),
  ]);

  if (toolsResult.error || responsesResult.error) {
    console.error("insert error", toolsResult.error ?? responsesResult.error);
    // Respondent is saved — don't surface this as a hard failure
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
