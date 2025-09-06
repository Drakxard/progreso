-- Creating table for important tasks
CREATE TABLE IF NOT EXISTS important_tasks (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  numerator INTEGER DEFAULT 0,
  denominator INTEGER DEFAULT 1,
  days_remaining INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
