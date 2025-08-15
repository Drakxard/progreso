-- Script para insertar materias por defecto si no existen
INSERT INTO subjects (name, pdf_count, theory_date, practice_date) 
VALUES 
  ('Álgebra', 5, NULL, NULL),
  ('Cálculo', 8, NULL, NULL),
  ('Poo', 6, NULL, NULL)
ON CONFLICT (name) DO NOTHING;

-- Insertar registros de progreso por defecto
INSERT INTO progress (subject_name, table_type, current_progress, total_pdfs)
VALUES 
  ('Álgebra', 'theory', 0, 5),
  ('Álgebra', 'practice', 0, 5),
  ('Cálculo', 'theory', 0, 8),
  ('Cálculo', 'practice', 0, 8),
  ('Poo', 'theory', 0, 6),
  ('Poo', 'practice', 0, 6)
ON CONFLICT (subject_name, table_type) DO NOTHING;
