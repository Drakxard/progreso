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

function removeDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function subjectNameVariants(raw: string): string[] {
  const canonical = canonicalSubjectName(raw)
  const variants = new Set<string>()

  const candidates = [raw, canonical, removeDiacritics(raw), removeDiacritics(canonical)]

  for (const candidate of candidates) {
    if (!candidate) continue
    variants.add(candidate)
    variants.add(candidate.toLowerCase())
    variants.add(candidate.toUpperCase())
    const capitalized = candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase()
    variants.add(capitalized)
  }

  if (canonical === "Álgebra") {
    variants.add("�?lgebra")
    variants.add("Algebra")
  } else if (canonical === "Cálculo") {
    variants.add("Cǭlculo")
    variants.add("Calculo")
  } else if (canonical === "Poo") {
    variants.add("POO")
  }

  return Array.from(variants).filter((name) => name.trim().length > 0)
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
    VALUES ('Álgebra', 0), ('Cálculo', 0), ('Poo', 0)
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
  const rows = (await sql`
    SELECT *
    FROM subjects
    ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
  `) as Subject[]

  const deduped = new Map<string, Subject>()
  for (const row of rows) {
    const canonical = canonicalSubjectName(row.name)
    const existing = deduped.get(canonical)
    if (!existing) {
      deduped.set(canonical, { ...row, name: canonical })
      continue
    }

    deduped.set(canonical, {
      ...existing,
      pdf_count: existing.pdf_count ?? row.pdf_count ?? 0,
      theory_date: existing.theory_date ?? row.theory_date,
      practice_date: existing.practice_date ?? row.practice_date,
      created_at: existing.created_at ?? row.created_at,
      updated_at: existing.updated_at ?? row.updated_at,
    })
  }

  const result = Array.from(deduped.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
  )

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
  const variantList = (() => {
    const variants = subjectNameVariants(name)
    if (!variants.includes(canonical)) {
      variants.push(canonical)
    }
    const filtered = variants.filter((value) => value.trim().length > 0)
    return Array.from(new Set(filtered))
  })()

  const values = [
    ...variantList,
    data.pdf_count ?? null,
    data.theory_date ?? null,
    data.practice_date ?? null,
  ]

  let affectedNames: string[] = []

  if (variantList.length > 0) {
    const updateConditions = variantList.map((_, index) => `name = $${index + 1}`).join(" OR ")
    const updateQuery = `
      UPDATE subjects
      SET
        pdf_count = COALESCE($${variantList.length + 1}, subjects.pdf_count),
        theory_date = COALESCE($${variantList.length + 2}, subjects.theory_date),
        practice_date = COALESCE($${variantList.length + 3}, subjects.practice_date),
        updated_at = CURRENT_TIMESTAMP
      WHERE ${updateConditions}
      RETURNING name
    `
    const updated = await sql.unsafe<Subject[]>(updateQuery, values)
    affectedNames = updated.map((row) => row.name)
  }

  if (affectedNames.length === 0) {
    const inserted = await sql<Subject[]>`
      INSERT INTO subjects (name, pdf_count, theory_date, practice_date)
      VALUES (
        ${canonical},
        ${data.pdf_count ?? 0},
        ${data.theory_date ?? null},
        ${data.practice_date ?? null}
      )
      ON CONFLICT (name) DO UPDATE SET
        pdf_count = COALESCE(EXCLUDED.pdf_count, subjects.pdf_count),
        theory_date = COALESCE(EXCLUDED.theory_date, subjects.theory_date),
        practice_date = COALESCE(EXCLUDED.practice_date, subjects.practice_date),
        updated_at = CURRENT_TIMESTAMP
      RETURNING name
    `
    affectedNames = inserted.map((row) => row.name)
  }

  const ensureProgressPromises = Array.from(new Set(affectedNames)).map(async (subjectName) => {
    await sql`
      INSERT INTO progress (subject_name, table_type, current_progress, total_pdfs)
      VALUES (${subjectName}, 'theory', 0, 0)
      ON CONFLICT (subject_name, table_type) DO NOTHING
    `
    await sql`
      INSERT INTO progress (subject_name, table_type, current_progress, total_pdfs)
      VALUES (${subjectName}, 'practice', 0, 0)
      ON CONFLICT (subject_name, table_type) DO NOTHING
    `
  })

  if (ensureProgressPromises.length) {
    await Promise.all(ensureProgressPromises)
  }
}

export async function getProgress(): Promise<Progress[]> {
  const sql = getSql()
  const rows = (await sql`
    SELECT *
    FROM progress
    ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
  `) as Progress[]

  const deduped = new Map<string, Progress>()
  for (const row of rows) {
    const canonical = canonicalSubjectName(row.subject_name)
    const key = `${canonical}-${row.table_type}`
    if (!deduped.has(key)) {
      deduped.set(key, { ...row, subject_name: canonical })
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    if (a.subject_name === b.subject_name) {
      return a.table_type.localeCompare(b.table_type)
    }
    return a.subject_name.localeCompare(b.subject_name, "es", { sensitivity: "base" })
  })
}

export async function updateProgress(
  subjectName: string,
  tableType: "theory" | "practice",
  currentProgress: number,
  totalPdfs: number,
) {
  const sql = getSql()
  const canonical = canonicalSubjectName(subjectName)
  const variantList = (() => {
    const variants = subjectNameVariants(subjectName)
    if (!variants.includes(canonical)) {
      variants.push(canonical)
    }
    const filtered = variants.filter((value) => value.trim().length > 0)
    return Array.from(new Set(filtered))
  })()

  let updated: Progress[] = []

  if (variantList.length > 0) {
    const updateConditions = variantList.map((_, index) => `subject_name = $${index + 1}`).join(" OR ")
    const updateQuery = `
      UPDATE progress
      SET current_progress = $${variantList.length + 1},
          total_pdfs = $${variantList.length + 2},
          updated_at = CURRENT_TIMESTAMP
      WHERE (${updateConditions}) AND table_type = $${variantList.length + 3}
      RETURNING subject_name
    `
    const values = [...variantList, currentProgress, totalPdfs, tableType]
    updated = await sql.unsafe<Progress[]>(updateQuery, values)
  }

  if (updated.length === 0) {
    const lookupVariants = variantList.length > 0 ? variantList : [canonical]
    const lookupConditions = lookupVariants.map((_, index) => `name = $${index + 1}`).join(" OR ")
    const lookupQuery = `
      SELECT name FROM subjects
      WHERE ${lookupConditions}
      LIMIT 1
    `
    const subjectMatch = await sql.unsafe<{ name: string }[]>(lookupQuery, lookupVariants)
    const targetName = subjectMatch[0]?.name ?? canonical

    await sql`
      INSERT INTO subjects (name, pdf_count)
      VALUES (${targetName}, 0)
      ON CONFLICT (name) DO NOTHING
    `

    await sql`
      INSERT INTO progress (subject_name, table_type, current_progress, total_pdfs)
      VALUES (${targetName}, ${tableType}, ${currentProgress}, ${totalPdfs})
      ON CONFLICT (subject_name, table_type) DO UPDATE SET
        current_progress = EXCLUDED.current_progress,
        total_pdfs = EXCLUDED.total_pdfs,
        updated_at = CURRENT_TIMESTAMP
    `
  }
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
