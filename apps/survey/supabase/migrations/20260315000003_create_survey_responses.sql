CREATE TABLE survey_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  respondent_id   UUID NOT NULL REFERENCES respondents(id) ON DELETE CASCADE,
  question_key    TEXT NOT NULL,
  question_text   TEXT NOT NULL,
  answer          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
