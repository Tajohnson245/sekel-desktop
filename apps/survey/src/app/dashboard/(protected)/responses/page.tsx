import { createServiceClient } from "@/lib/supabase/server";
import { ResponseTable } from "@sekel/survey-components";
import type { RespondentRow } from "@sekel/survey-components";
import "./page.css";

async function fetchRespondents(): Promise<RespondentRow[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("respondents")
    .select(
      "id, name, email, school, year, exam_upcoming, created_at, study_tools(tool_name), survey_responses(question_key, question_text, answer)"
    )
    .order("created_at", { ascending: false });

  return (data ?? []) as RespondentRow[];
}

export default async function ResponsesPage() {
  const respondents = await fetchRespondents();

  return (
    <div>
      <h1 className="responses-page__title">All Responses</h1>
      <p className="responses-page__count">{respondents.length} total</p>
      <div className="responses-page__table-card">
        <ResponseTable respondents={respondents} />
      </div>
    </div>
  );
}
