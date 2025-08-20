import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export interface Subject {
  id: number
  name: string
  pdf_count: number
  theory_date: string | null
  practice_date: string | null
  created_at: string
  updated_at: string
}

export interface Progress {
  id: number
  subject_name: string
  table_type: "theory" | "practice"
  current_progress: number
  total_pdfs: number
  created_at: string
  updated_at: string
}

export async function getSubjects(): Promise<Subject[]> {
  const result = await sql`SELECT * FROM subjects ORDER BY name`
  return result as Subject[]
}

export async function updateSubject(name: string, data: Partial<Subject>) {
  const updates = []
  const values = []
  let paramIndex = 1

  if (data.pdf_count !== undefined) {
    updates.push(`pdf_count = $${paramIndex++}`)
    values.push(data.pdf_count)
  }
  if (data.theory_date !== undefined) {
    updates.push(`theory_date = $${paramIndex++}`)
    values.push(data.theory_date)
  }
  if (data.practice_date !== undefined) {
    updates.push(`practice_date = $${paramIndex++}`)
    values.push(data.practice_date)
  }

  if (updates.length === 0) return

  updates.push(`updated_at = CURRENT_TIMESTAMP`)

  const query = `UPDATE subjects SET ${updates.join(", ")} WHERE name = $${paramIndex}`
  values.push(name)

  await sql(query, values)
}

export async function createSubject(name: string, pdfCount: number) {
  await sql`
    INSERT INTO subjects (name, pdf_count, theory_date, practice_date)
    VALUES (${name}, ${pdfCount}, null, null)
  `
}

export async function getProgress(): Promise<Progress[]> {
  const result = await sql`SELECT * FROM progress ORDER BY subject_name, table_type`
  return result as Progress[]
}

export async function updateProgress(
  subjectName: string,
  tableType: "theory" | "practice",
  currentProgress: number,
  totalPdfs: number,
) {
  await sql`
    UPDATE progress
    SET current_progress = ${currentProgress},
        total_pdfs = ${totalPdfs},
        updated_at = CURRENT_TIMESTAMP
    WHERE subject_name = ${subjectName} AND table_type = ${tableType}
  `
}

export async function createProgress(
  subjectName: string,
  tableType: "theory" | "practice",
  totalPdfs: number,
) {
  await sql`
    INSERT INTO progress (subject_name, table_type, current_progress, total_pdfs)
    VALUES (${subjectName}, ${tableType}, 0, ${totalPdfs})
  `
}
