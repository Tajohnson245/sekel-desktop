import { createServiceClient } from "@/lib/supabase/server";
import {
  StatCard,
  ToolBreakdownChart,
  SatisfactionChart,
  YearDistributionChart,
  ExamDistributionChart,
  ResponseTable,
} from "@sekel/survey-components";
import type {
  ToolCount,
  ToolSatisfaction,
  YearCount,
  ExamCount,
  RespondentRow,
} from "@sekel/survey-components";
import "./page.css";

async function fetchDashboardData() {
  const db = createServiceClient();

  const [
    { count: totalResponses },
    { count: responsesThisWeek },
    toolCountsResult,
    toolSatisfactionResult,
    yearCountsResult,
    examCountsResult,
    respondentsResult,
  ] = await Promise.all([
    db.from("respondents").select("*", { count: "exact", head: true }),
    db.from("respondents")
      .select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    db.from("study_tools").select("tool_name"),
    db.from("study_tools").select("tool_name, satisfaction").not("satisfaction", "is", null),
    db.from("respondents").select("year"),
    db.from("respondents").select("exam_upcoming").not("exam_upcoming", "is", null),
    db.from("respondents")
      .select("id, name, email, school, year, exam_upcoming, created_at, study_tools(tool_name), survey_responses(question_key, question_text, answer)")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  // Aggregate tool counts
  const toolCountMap = new Map<string, number>();
  for (const row of toolCountsResult.data ?? []) {
    toolCountMap.set(row.tool_name, (toolCountMap.get(row.tool_name) ?? 0) + 1);
  }
  const toolCounts: ToolCount[] = Array.from(toolCountMap.entries()).map(([tool_name, count]) => ({ tool_name, count }));

  // Aggregate tool satisfaction
  const toolSatMap = new Map<string, number[]>();
  for (const row of toolSatisfactionResult.data ?? []) {
    if (!toolSatMap.has(row.tool_name)) toolSatMap.set(row.tool_name, []);
    toolSatMap.get(row.tool_name)!.push(row.satisfaction);
  }
  const toolSatisfaction: ToolSatisfaction[] = Array.from(toolSatMap.entries()).map(([tool_name, vals]) => ({
    tool_name,
    avg_satisfaction: vals.reduce((a, b) => a + b, 0) / vals.length,
  }));

  // Year distribution
  const yearMap = new Map<string, number>();
  for (const row of yearCountsResult.data ?? []) {
    yearMap.set(row.year, (yearMap.get(row.year) ?? 0) + 1);
  }
  const yearCounts: YearCount[] = Array.from(yearMap.entries()).map(([year, count]) => ({ year, count }));

  // Exam distribution
  const examMap = new Map<string, number>();
  for (const row of examCountsResult.data ?? []) {
    if (row.exam_upcoming) examMap.set(row.exam_upcoming, (examMap.get(row.exam_upcoming) ?? 0) + 1);
  }
  const examCounts: ExamCount[] = Array.from(examMap.entries()).map(([exam_upcoming, count]) => ({ exam_upcoming, count }));

  // Most common tool
  let mostCommonTool: string | null = null;
  let maxCount = 0;
  for (const [name, count] of toolCountMap.entries()) {
    if (count > maxCount) { maxCount = count; mostCommonTool = name; }
  }

  // Average satisfaction
  const allSat = toolSatisfactionResult.data?.map((r: { satisfaction: number }) => r.satisfaction).filter(Boolean) ?? [];
  const avgSat = allSat.length > 0 ? allSat.reduce((a: number, b: number) => a + b, 0) / allSat.length : null;

  return {
    totalResponses: totalResponses ?? 0,
    responsesThisWeek: responsesThisWeek ?? 0,
    mostCommonTool,
    avgSat,
    toolCounts,
    toolSatisfaction,
    yearCounts,
    examCounts,
    respondents: (respondentsResult.data ?? []) as RespondentRow[],
  };
}

export default async function DashboardPage() {
  const data = await fetchDashboardData();

  return (
    <div>
      <h1 className="dashboard-page__title">Overview</h1>

      <div className="dashboard-page__stat-grid">
        <StatCard label="Total Responses" value={data.totalResponses} />
        <StatCard label="This Week" value={data.responsesThisWeek} />
        <StatCard label="Most Common Tool" value={data.mostCommonTool ?? "—"} />
        <StatCard
          label="Avg. Satisfaction"
          value={data.avgSat != null ? `${data.avgSat.toFixed(1)} / 5` : "—"}
        />
      </div>

      <div className="dashboard-page__charts">
        <div className="dashboard-page__chart-card">
          <h3>Tool Popularity</h3>
          <ToolBreakdownChart data={data.toolCounts} />
        </div>

        <div className="dashboard-page__chart-card">
          <h3>Satisfaction by Tool</h3>
          <SatisfactionChart data={data.toolSatisfaction} />
        </div>

        <div className="dashboard-page__chart-card">
          <h3>Year Distribution</h3>
          <YearDistributionChart data={data.yearCounts} />
        </div>

        <div className="dashboard-page__chart-card">
          <h3>Upcoming Exams</h3>
          <ExamDistributionChart data={data.examCounts} />
        </div>
      </div>

      <div className="dashboard-page__table-section">
        <h3>Recent Responses</h3>
        <div className="dashboard-page__table-card">
          <ResponseTable respondents={data.respondents} />
        </div>
      </div>
    </div>
  );
}
