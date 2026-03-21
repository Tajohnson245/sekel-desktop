import { z } from "zod";
import { YEAR_OPTIONS, EXAM_OPTIONS, FREQUENCY_OPTIONS } from "./constants";

export const profileSchema = z.object({
  name: z.string().optional(),
  email: z.string().email("Please enter a valid email").optional().or(z.literal("")),
  school: z.string().min(1, "School is required"),
  year: z.enum([...YEAR_OPTIONS], {
    error: "Please select your year",
  }),
  specialty: z.string().optional(),
  exam_upcoming: z.enum([...EXAM_OPTIONS]).optional().or(z.literal("")),
  exam_date: z.string().optional(),
});

export type ProfileData = z.infer<typeof profileSchema>;

export const studyToolSchema = z.object({
  tool_name: z.string().min(1),
  tool_name_other: z.string().optional(),
  usage_frequency: z.enum([...FREQUENCY_OPTIONS]).optional(),
  satisfaction: z.number().int().min(1).max(5).optional(),
  pros: z.string().optional(),
  cons: z.string().optional(),
});

export type StudyToolData = z.infer<typeof studyToolSchema>;

export const toolsStepSchema = z.object({
  tools: z.array(studyToolSchema).min(0),
});

export type ToolsStepData = z.infer<typeof toolsStepSchema>;

export const wishlistSchema = z.object({
  biggest_frustration: z.string().optional(),
  magic_wand: z.string().optional(),
  ideal_session: z.string().optional(),
  would_pay_for: z.string().optional(),
});

export type WishlistData = z.infer<typeof wishlistSchema>;

export const surveyPayloadSchema = z.object({
  profile: profileSchema,
  tools: z.array(studyToolSchema),
  wishlist: wishlistSchema,
});

export type SurveyPayload = z.infer<typeof surveyPayloadSchema>;
