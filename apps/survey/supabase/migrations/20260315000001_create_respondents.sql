CREATE TABLE respondents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT,
  email         TEXT,
  school        TEXT NOT NULL,
  specialty     TEXT,
  year          TEXT NOT NULL,
  exam_upcoming TEXT,
  exam_date     DATE,
  created_at    TIMESTAMPTZ DEFAULT now()
);
