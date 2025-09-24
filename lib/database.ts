import { neon } from "@neondatabase/serverless"

// Lazily initialize the SQL client so we can give a clearer error
// when DATABASE_URL is missing in local/dev environments.
let _sql: ReturnType<typeof neon> | null = null
function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL no está configurada. Define DATABASE_URL en .env.local o variables de entorno.",
    )
  }
  if (_sql) return _sql
  _sql = neon(url)
  return _sql
}

// Intenta mapear cualquier variante (con o sin acentos o con caracteres corruptos)
// a los nombres canónicos usados en la BD y UI.
function canonicalSubjectName(raw: string): string {
  const s = (raw || "").toLowerCase()
  // Quitar diacríticos estándar (no arregla caracteres ya corruptos, pero ayuda)
  const noAccent = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")

  // Heurísticas tolerantes a texto mal codificado
  if (noAccent.includes("poo")) return "Poo"
  if (noAccent.includes("alge") || noAccent.endsWith("lgebra") || s.includes("lg")) {
    return "Álgebra"
  }
  if (noAccent.includes("calcu") || noAccent.endsWith("lculo") || noAccent.includes("culo")) {
    return "Cálculo"
  }
  return raw
}

async function ensureImportantTasksTable() {
  const sql = getSql()
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

async function ensureSubjectsAndProgressTables() {
  const sql = getSql()
  // subjects base
  await sql`
    CREATE TABLE IF NOT EXISTS subjects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      pdf_count INTEGER DEFAULT 0,
      theory_date DATE,
      practice_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `

  // Useful index for lookups
  await sql`CREATE INDEX IF NOT EXISTS idx_subjects_name ON subjects(name)`

  // progress per subject and table type
  await sql`
    CREATE TABLE IF NOT EXISTS progress (
      id SERIAL PRIMARY KEY,
      subject_name VARCHAR(50) NOT NULL,
      table_type VARCHAR(20) NOT NULL CHECK (table_type IN ('theory', 'practice')),
      current_progress INTEGER DEFAULT 0,
      total_pdfs INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_name) REFERENCES subjects(name) ON DELETE CASCADE
    )
  `

  // Ensure unique pair (subject_name, table_type) to avoid duplicates
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_unique ON progress(subject_name, table_type)`

  // Seed default subjects only if missing
  await sql`
    INSERT INTO subjects (name, pdf_count)
    VALUES ('�?lgebra', 0), ('Cǭlculo', 0), ('Poo', 0)
    ON CONFLICT (name) DO NOTHING
  `

  // Seed progress rows only when not present for a given subject/table_type
  // (idempotent, avoids duplicates)
  await sql`
    INSERT INTO progress (subject_name, table_type, current_progress, total_pdfs)
    SELECT s.name, 'theory', 0, 0 FROM subjects s
    WHERE NOT EXISTS (
      SELECT 1 FROM progress p WHERE p.subject_name = s.name AND p.table_type = 'theory'
    )
  `
  await sql`
    INSERT INTO progress (subject_name, table_type, current_progress, total_pdfs)
    SELECT s.name, 'practice', 0, 0 FROM subjects s
    WHERE NOT EXISTS (
      SELECT 1 FROM progress p WHERE p.subject_name = s.name AND p.table_type = 'practice'
    )
  `
}

// Ensure the important_tasks table exists as soon as the module is loaded
Promise.all([ensureImportantTasksTable(), ensureSubjectsAndProgressTables()]).catch(
  (err) => console.error("Error inicializando tablas:", err),
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
  const sql = getSql()
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
  const sql = getSql()
  const canonical = canonicalSubjectName(name)

  // UPSERT: inserta si no existe y actualiza sólo los campos provistos
  await sql`
    INSERT INTO subjects (name, pdf_count, theory_date, practice_date)
    VALUES (
      ${canonical},
      ${data.pdf_count ?? null},
      ${data.theory_date ?? null},
      ${data.practice_date ?? null}
    )
    ON CONFLICT (name) DO UPDATE SET
      pdf_count = COALESCE(EXCLUDED.pdf_count, subjects.pdf_count),
      theory_date = COALESCE(EXCLUDED.theory_date, subjects.theory_date),
      practice_date = COALESCE(EXCLUDED.practice_date, subjects.practice_date),
      updated_at = CURRENT_TIMESTAMP
  `
}

export async function getProgress(): Promise<Progress[]> {
  const sql = getSql()
  const result = await sql`SELECT * FROM progress ORDER BY subject_name, table_type`
  return result as Progress[]
}

export async function updateProgress(
  subjectName: string,
  tableType: "theory" | "practice",
  currentProgress: number,
  totalPdfs: number,
) {
  const sql = getSql()
  const canonical = canonicalSubjectName(subjectName)

  // Ensure the canonical subject exists so the FK constraint is satisfied when inserting
  await updateSubject(canonical, {})

  await sql`
    INSERT INTO progress (subject_name, table_type, current_progress, total_pdfs)
    VALUES (${canonical}, ${tableType}, ${currentProgress}, ${totalPdfs})
    ON CONFLICT (subject_name, table_type) DO UPDATE SET
      current_progress = EXCLUDED.current_progress,
      total_pdfs = EXCLUDED.total_pdfs,
      updated_at = CURRENT_TIMESTAMP
  `
}

export async function getImportantTasks(): Promise<ImportantTask[]> {
  const sql = getSql()
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
  const sql = getSql()
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
  const sql = getSql()
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
  // Use unsafe to execute dynamic query text with placeholders
  const result = await sql.unsafe<ImportantTask[]>(query, values)
  return result[0] ?? null
}

export async function deleteImportantTask(id: number): Promise<void> {
  const sql = getSql()
  await ensureImportantTasksTable()
  await sql`DELETE FROM important_tasks WHERE id = ${id}`
}
