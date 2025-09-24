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

// Ensure the important_tasks table exists as soon as the module is loaded
ensureImportantTasksTable().catch((err) =>
  console.error("Failed to ensure important_tasks table:", err),
)

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

function normalize(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function rollWeeklyForward(date: Date, today: Date) {
  let d = normalize(date)
  const t = normalize(today)
  while (d <= t) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)
  }
  return d
}

export async function getSubjects(): Promise<Subject[]> {
  const result = (await sql`SELECT * FROM subjects ORDER BY name`) as Subject[]

  // Ensure dates are always in the future on read so the client starts correct
  const today = new Date()
  const updates: Array<Promise<void>> = []
  const rolled = result.map((s) => {
    let theory_date = s.theory_date
    let practice_date = s.practice_date

    try {
      if (s.theory_date) {
        const d = new Date(s.theory_date)
        const rolledDate = rollWeeklyForward(d, today)
        if (normalize(d) <= normalize(today)) {
          theory_date = rolledDate.toISOString().slice(0, 10)
        }
      }
      if (s.practice_date) {
        const d = new Date(s.practice_date)
        const rolledDate = rollWeeklyForward(d, today)
        if (normalize(d) <= normalize(today)) {
          practice_date = rolledDate.toISOString().slice(0, 10)
        }
      }
    } catch {
      // If parsing fails, just keep original value
    }

    if (theory_date !== s.theory_date || practice_date !== s.practice_date) {
      updates.push(
        updateSubject(s.name, {
          theory_date: theory_date ?? undefined,
          practice_date: practice_date ?? undefined,
        }),
      )
    }

    return { ...s, theory_date, practice_date }
  })

  if (updates.length) {
    await Promise.allSettled(updates)
  }

  return rolled
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
  const tasks = await sql<ImportantTask[]>`SELECT * FROM important_tasks ORDER BY id`
  const today = new Date()
  const todayMidnight = normalize(today)
  const updatedTasks = await Promise.all(
    tasks.map(async (task) => {
      const lastUpdate = new Date(task.updated_at)
      // Decrement based on calendar days (midnight boundaries), not 24h windows
      const lastMidnight = normalize(lastUpdate)
      const diffTime = todayMidnight.getTime() - lastMidnight.getTime()
      const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)))
      if (diffDays > 0) {
        const newDaysRemaining = Math.max(task.days_remaining - diffDays, 0)
        const newNumerator = Math.min(
          task.denominator,
          task.denominator - newDaysRemaining,
        )
        const updated = await updateImportantTask(task.id, {
          days_remaining: newDaysRemaining,
          numerator: newNumerator,
        })
        return (
          updated ?? {
            ...task,
            days_remaining: newDaysRemaining,
            numerator: newNumerator,
          }
        )
      }
      return task
    }),
  )
  return updatedTasks
}

export async function createImportantTask(
  data: Partial<ImportantTask>,
): Promise<ImportantTask> {
  await ensureImportantTasksTable()
  const result = await sql<ImportantTask[]>`
    INSERT INTO important_tasks (text, numerator, denominator, days_remaining)
    VALUES (
      ${data.text ?? ""},
      ${data.numerator ?? 0},
      ${data.denominator ?? 1},
      ${data.days_remaining ?? 0}
    )
    RETURNING *
  `
  return result[0]
}

export async function updateImportantTask(
  id: number,
  data: Partial<ImportantTask>,
): Promise<ImportantTask | null> {
  await ensureImportantTasksTable()
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

  if (updates.length === 0) return null

  updates.push(`updated_at = CURRENT_TIMESTAMP`)

  const query = `UPDATE important_tasks SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`
  values.push(id)

  const result = await sql<ImportantTask[]>(query, values)
  return result[0] ?? null
}

export async function deleteImportantTask(id: number): Promise<void> {
  await ensureImportantTasksTable()
  await sql`DELETE FROM important_tasks WHERE id = ${id}`
}
