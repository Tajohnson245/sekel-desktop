// ============================================================
// Shared form/data types for the feedback survey & dashboard.
// These are plain TypeScript interfaces — no zod dependency.
// ============================================================

export interface ProfileData {
  name?: string;
  email?: string;
  school: string;
  year: string;
  specialty?: string;
  exam_upcoming?: string;
  exam_date?: string;
}

export interface StudyToolData {
  tool_name: string;
  tool_name_other?: string;
  usage_frequency?: string;
  satisfaction?: number;
  pros?: string;
  cons?: string;
}

export interface WishlistData {
  biggest_frustration?: string;
  magic_wand?: string;
  ideal_session?: string;
  would_pay_for?: string;
}

export interface SurveyPayload {
  profile: ProfileData;
  tools: StudyToolData[];
  wishlist: WishlistData;
}

// Dashboard data shapes
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

export interface DashboardStats {
  totalResponses: number;
  responsesThisWeek: number;
  mostCommonTool: string | null;
  averageSatisfaction: number | null;
}

export interface RespondentRow {
  id: string;
  name: string | null;
  email: string | null;
  school: string;
  year: string;
  exam_upcoming: string | null;
  created_at: string;
  study_tools: { tool_name: string }[];
  survey_responses: { question_key: string; question_text: string; answer: string }[];
}
