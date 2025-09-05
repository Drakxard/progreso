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

export interface ImportantTask {
  id: number
  name: string
  current_progress: number
  total_items: number
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
  const result = await sql`SELECT * FROM important_tasks ORDER BY id`
  return result as ImportantTask[]
}

export async function createImportantTask(name: string): Promise<ImportantTask> {
  const result = await sql`INSERT INTO important_tasks (name, current_progress, total_items, days_remaining) VALUES (${name}, 0, 1, 0) RETURNING *`
  return result[0] as ImportantTask
}

export async function updateImportantTask(id: number, data: Partial<ImportantTask>) {
  const updates = []
  const values: any[] = []
  let paramIndex = 1

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex++}`)
    values.push(data.name)
  }
  if (data.current_progress !== undefined) {
    updates.push(`current_progress = $${paramIndex++}`)
    values.push(data.current_progress)
  }
  if (data.total_items !== undefined) {
    updates.push(`total_items = $${paramIndex++}`)
    values.push(data.total_items)
  }
  if (data.days_remaining !== undefined) {
    updates.push(`days_remaining = $${paramIndex++}`)
    values.push(data.days_remaining)
  }

  if (updates.length === 0) return

  updates.push(`updated_at = CURRENT_TIMESTAMP`)

  const query = `UPDATE important_tasks SET ${updates.join(", ")} WHERE id = $${paramIndex}`
  values.push(id)

  await sql(query, values)
}

export async function deleteImportantTask(id: number) {
  await sql`DELETE FROM important_tasks WHERE id = ${id}`
}
