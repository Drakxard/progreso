-- Creating progress tracking table
CREATE TABLE IF NOT EXISTS progress (
  id SERIAL PRIMARY KEY,
  subject_name VARCHAR(50) NOT NULL,
  table_type VARCHAR(20) NOT NULL CHECK (table_type IN ('theory', 'practice')),
  current_progress INTEGER DEFAULT 0,
  total_pdfs INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_name) REFERENCES subjects(name) ON DELETE CASCADE
);

-- Insert default progress records
INSERT INTO progress (subject_name, table_type, current_progress, total_pdfs) VALUES 
  ('Álgebra', 'theory', 0, 0),
  ('Álgebra', 'practice', 0, 0),
  ('Cálculo', 'theory', 0, 0),
  ('Cálculo', 'practice', 0, 0),
  ('Poo', 'theory', 0, 0),
  ('Poo', 'practice', 0, 0)
ON CONFLICT DO NOTHING;
