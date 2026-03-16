CREATE TABLE study_tools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  respondent_id   UUID NOT NULL REFERENCES respondents(id) ON DELETE CASCADE,
  tool_name       TEXT NOT NULL,
  usage_frequency TEXT,
  satisfaction    INTEGER CHECK (satisfaction BETWEEN 1 AND 5),
  pros            TEXT,
  cons            TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
