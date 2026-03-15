-- Enable Row Level Security
ALTER TABLE respondents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_tools       ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses  ENABLE ROW LEVEL SECURITY;

-- Public can INSERT (survey submissions require no auth)
CREATE POLICY "Anyone can submit" ON respondents
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can submit" ON study_tools
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can submit" ON survey_responses
  FOR INSERT WITH CHECK (true);

-- Only authenticated admin can SELECT
CREATE POLICY "Admin read" ON respondents
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin read" ON study_tools
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin read" ON survey_responses
  FOR SELECT USING (auth.role() = 'authenticated');
