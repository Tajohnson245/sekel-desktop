// Types for the feedback app's tables.
// These are separate from @sekel/db types which cover the desktop app schema.

export interface Respondent {
  id: string;
  name: string | null;
  email: string | null;
  school: string;
  specialty: string | null;
  year: string;
  exam_upcoming: string | null;
  exam_date: string | null;
  created_at: string;
}

export type RespondentInsert = Omit<Respondent, "id" | "created_at">;

export interface StudyTool {
  id: string;
  respondent_id: string;
  tool_name: string;
  usage_frequency: string | null;
  satisfaction: number | null;
  pros: string | null;
  cons: string | null;
  created_at: string;
}

export type StudyToolInsert = Omit<StudyTool, "id" | "created_at">;

export interface SurveyResponse {
  id: string;
  respondent_id: string;
  question_key: string;
  question_text: string;
  answer: string;
  created_at: string;
}

export type SurveyResponseInsert = Omit<SurveyResponse, "id" | "created_at">;

// Dashboard aggregate types
export interface DashboardStats {
  totalResponses: number;
  responsesThisWeek: number;
  mostCommonTool: string | null;
  averageSatisfaction: number | null;
}

export interface ToolCount {
  tool_name: string;
  count: number;
}

export interface ToolSatisfaction {
  tool_name: string;
  avg_satisfaction: number;
}

export interface YearCount {
  year: string;
  count: number;
}

export interface ExamCount {
  exam_upcoming: string;
  count: number;
}

export interface RespondentWithDetails extends Respondent {
  study_tools: StudyTool[];
  survey_responses: SurveyResponse[];
}
