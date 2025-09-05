import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

async function ensureImportantTasksTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS important_tasks (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL,
      numerator INTEGER DEFAULT 0,
      denominator INTEGER DEFAULT 1,
      days_remaining INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
}

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

export interface ImportantTask {
  id: number
  text: string
  numerator: number
  denominator: number
  days_remaining: number
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

export async function getImportantTasks(): Promise<ImportantTask[]> {
  await ensureImportantTasksTable()
  const result = await sql`SELECT * FROM important_tasks ORDER BY id`
  return result as ImportantTask[]
}

export async function createImportantTask(data: Partial<ImportantTask>) {
  await ensureImportantTasksTable()
  await sql`
    INSERT INTO important_tasks (text, numerator, denominator, days_remaining)
    VALUES (${data.text || ""}, ${data.numerator || 0}, ${data.denominator || 1}, ${
    data.days_remaining || 0
  })
  `
}

export async function updateImportantTask(id: number, data: Partial<ImportantTask>) {
  const updates = []
  const values: any[] = []
  let paramIndex = 1

  if (data.text !== undefined) {
    updates.push(`text = $${paramIndex++}`)
    values.push(data.text)
  }
  if (data.numerator !== undefined) {
    updates.push(`numerator = $${paramIndex++}`)
    values.push(data.numerator)
  }
  if (data.denominator !== undefined) {
    updates.push(`denominator = $${paramIndex++}`)
    values.push(data.denominator)
  }
  if (data.days_remaining !== undefined) {
    updates.push(`days_remaining = $${paramIndex++}`)
    values.push(data.days_remaining)
  }

  if (updates.length === 0) return

  updates.push(`updated_at = CURRENT_TIMESTAMP`)

  const query = `UPDATE important_tasks SET ${updates.join(", ")} WHERE id = $${paramIndex}`
  values.push(id)

  await ensureImportantTasksTable()
  await sql(query, values)
}

export async function deleteImportantTask(id: number) {
  await ensureImportantTasksTable()
  await sql`DELETE FROM important_tasks WHERE id = ${id}`
}
