-- Creating tables for subjects, PDFs and dates
CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  pdf_count INTEGER DEFAULT 0,
  theory_date DATE,
  practice_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default subjects
INSERT INTO subjects (name, pdf_count) VALUES 
  ('Álgebra', 0),
  ('Cálculo', 0),
  ('Poo', 0)
ON CONFLICT (name) DO NOTHING;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_subjects_name ON subjects(name);
