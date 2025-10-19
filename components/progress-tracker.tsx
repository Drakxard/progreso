"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import type { MouseEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, Flame, Sun, TreePine, X } from "lucide-react"

const parseDateInput = (input?: string): Date | null => {
  if (!input) return null
  if (/^\d+d$/.test(input)) {
    const days = parseInt(input.slice(0, -1), 10)
    const date = new Date()
    date.setDate(date.getDate() + days)
    return date
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [year, month, day] = input.split("-").map(Number)
    return new Date(year, month - 1, day)
  }
  const date = new Date(input)
  if (isNaN(date.getTime())) {
    return null
  }
  if (/[zZ]$/.test(input) || /[+-]\d{2}:\d{2}$/.test(input)) {
    return new Date(date.getTime() + date.getTimezoneOffset() * 60000)
  }
  return date
}

const normalizeDate = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

const computeDaysUntil = (targetDate: Date) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const normalizedSelected = normalizeDate(targetDate)
  const diffMs = normalizedSelected.getTime() - today.getTime()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

const formatDateForStorage = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const ABSOLUTE_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(?:$|T)/

const rollDateForwardWeekly = (date: Date, today: Date) => {
  let nextDate = normalizeDate(date)
  while (nextDate <= today) {
    nextDate = normalizeDate(
      new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate() + 7),
    )
  }
  return nextDate
}

const SUBJECT_RESOURCE_LINKS: Record<string, { theory?: string; practice?: string }> = {
  Álgebra: {
    theory: "https://v0-pdf-navigation-app.vercel.app/teoria/algebra",
    practice: "https://v0-pdf-navigation-app.vercel.app/practica/algebra",
  },
  Cálculo: {
    theory: "https://v0-pdf-navigation-app.vercel.app/teoria/calculo",
    practice: "https://v0-pdf-navigation-app.vercel.app/practica/calculo",
  },
  Poo: {
    theory: "https://v0-pdf-navigation-app.vercel.app/teoria/poo",
    practice: "https://v0-pdf-navigation-app.vercel.app/práctica/poo",
  },
}

interface CalendarEvent {
  date: Date
  label: string
  color: string
  url?: string
  source?: {
    kind: "important" | "theory" | "practice"
    taskId?: string
    tableIndex?: number
  }
}

interface TaskItem {
  id: string
  text: string
  numerator: number
  denominator: number
  days?: number
  topics?: string[]
  url?: string
}

type LinkModalState =
  | { isOpen: false }
  | {
      isOpen: true
      taskId: string
      tableIndex: number
      url: string
      label: string
    }

interface Table {
  title: string
  tasks: TaskItem[]
}

interface ProgressTrackerProps {
  initialData: {
    name: string
    count: number
    theoryDate?: string
    practiceDate?: string
  }[]
}

interface SubjectSchedule {
  name: string
  count: number
  theoryDate?: string
  practiceDate?: string
  theoryTotal?: number
  practiceTotal?: number
}

export default function ProgressTracker({ initialData }: ProgressTrackerProps) {
  const [currentTableIndex, setCurrentTableIndex] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [showAverageLine, setShowAverageLine] = useState(false)
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null)
  const [linkModalState, setLinkModalState] = useState<LinkModalState>({
    isOpen: false,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [topicInputs, setTopicInputs] = useState<Record<string, string>>({})
 
  const [isEventMode, setIsEventMode] = useState(false)
  const [eventTasks, setEventTasks] = useState<
    { task: TaskItem; tableTitle: string; daysRemaining: number }[]
  >([])
  const [eventIndex, setEventIndex] = useState(0)
  const [eventZoom, setEventZoom] = useState(2)
  const [isCalendarMode, setIsCalendarMode] = useState(false)
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [calendarSelection, setCalendarSelection] = useState<
    { taskId: string; tableIndex: number } | null
  >(null)
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  )
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 2000)
  }

  const handleCalendarEventContextMenu = (
    event: MouseEvent<HTMLDivElement>,
    calendarEvent: CalendarEvent,
  ) => {
    if (calendarEvent.source?.kind !== "important") {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const { tableIndex, taskId } = calendarEvent.source
    if (tableIndex === undefined || taskId === undefined) {
      return
    }
    const table = tables[tableIndex]
    const task = table?.tasks.find((item) => item.id === taskId)
    setLinkModalState({
      isOpen: true,
      tableIndex,
      taskId,
      url: task?.url ?? "",
      label: task?.text ?? calendarEvent.label,
    })
  }

  const handleLinkModalClose = () => {
    setLinkModalState({ isOpen: false })
  }

  const handleLinkModalSave = async () => {
    if (!linkModalState.isOpen) return
    const trimmedUrl = linkModalState.url.trim()
    const payloadUrl = trimmedUrl === "" ? null : trimmedUrl
    const { tableIndex, taskId } = linkModalState
    try {
      const response = await fetch("/api/important", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: Number(taskId),
          url: payloadUrl,
        }),
      })
      if (!response.ok) {
        throw new Error("Failed to save link")
      }
      const sanitizedUrl = trimmedUrl === "" ? undefined : trimmedUrl
      setTables((prev) =>
        prev.map((table, index) => {
          if (index !== tableIndex) return table
          return {
            ...table,
            tasks: table.tasks.map((task) =>
              task.id === taskId
                ? { ...task, url: sanitizedUrl }
                : task,
            ),
          }
        }),
      )
      showToast("Link guardado")
      setLinkModalState({ isOpen: false })
    } catch (error) {
      console.error("Error updating important task link:", error)
      showToast("Error al guardar", "error")
    }
  }
  const [subjectSchedules, setSubjectSchedules] = useState<SubjectSchedule[]>(
    () =>
      initialData.map((subject) => ({
        name: subject.name,
        count: subject.count,
        theoryDate: subject.theoryDate,
        practiceDate: subject.practiceDate,
        theoryTotal: 7,
        practiceTotal: 7,
      })),
  )
  const subjectSchedulesRef = useRef(subjectSchedules)

  useEffect(() => {
    setSubjectSchedules((prev) =>
      initialData.map((subject) => {
        const existing = prev.find((item) => item.name === subject.name)
        return {
          name: subject.name,
          count: subject.count,
          theoryDate: subject.theoryDate ?? existing?.theoryDate,
          practiceDate: subject.practiceDate ?? existing?.practiceDate,
          theoryTotal: existing?.theoryTotal ?? 7,
          practiceTotal: existing?.practiceTotal ?? 7,
        }
      }),
    )
  }, [initialData])

  const persistSubjectScheduleUpdates = useCallback(
    (updates: Record<string, { theoryDate?: string; practiceDate?: string }>) => {
      const requests = Object.entries(updates)
        .map(([name, update]) => {
          if (!update.theoryDate && !update.practiceDate) {
            return null
          }

          const payload: Record<string, unknown> = { name }
          if (update.theoryDate) {
            payload.theory_date = update.theoryDate
          }
          if (update.practiceDate) {
            payload.practice_date = update.practiceDate
          }

          return fetch("/api/subjects", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        })
        .filter((request): request is Promise<Response> => request !== null)

      if (requests.length > 0) {
        void Promise.all(requests).catch((error) => {
          console.error("Error updating recurring subject dates:", error)
        })
      }
    },
    [],
  )

  const syncCountdowns = useCallback((schedules: SubjectSchedule[]) => {
    const todayNormalized = normalizeDate(new Date())
    const rolledUpdates: Record<string, { theoryDate?: string; practiceDate?: string }> = {}

    setTables((prevTables) => {
      let tablesChanged = false

      const updatedTables = prevTables.map((table) => {
        if (table.title !== "Teoría" && table.title !== "Práctica") {
          return table
        }

        const tableType = table.title === "Teoría" ? "theory" : "practice"
        let tasksChanged = false

        const updatedTasks = table.tasks.map((task) => {
          const schedule = schedules.find((item) => item.name === task.text)
          if (!schedule) {
            if (task.days !== undefined) {
              tasksChanged = true
              const updatedTask = { ...task, days: undefined }
              return updatedTask
            }
            return task
          }

          const rawDate =
            tableType === "theory" ? schedule.theoryDate : schedule.practiceDate
          const total =
            tableType === "theory"
              ? schedule.theoryTotal ?? task.denominator
              : schedule.practiceTotal ?? task.denominator
          const eventDate = parseDateInput(rawDate)

          if (!eventDate) {
            if (task.days !== undefined || (total && total !== task.denominator)) {
              tasksChanged = true
              const updatedTask: TaskItem = { ...task, days: undefined }
              if (total && total > 0) {
                updatedTask.denominator = total
                if (updatedTask.numerator > total) {
                  updatedTask.numerator = total
                }
              }
              return updatedTask
            }
            return task
          }

          const normalizedEventDate = normalizeDate(eventDate)
          let effectiveEventDate = normalizedEventDate

          if (rawDate && ABSOLUTE_DATE_REGEX.test(rawDate.trim())) {
            const rolledDate = rollDateForwardWeekly(normalizedEventDate, todayNormalized)
            if (rolledDate.getTime() !== normalizedEventDate.getTime()) {
              effectiveEventDate = rolledDate
              const storedDate = formatDateForStorage(rolledDate)
              const existingUpdate = rolledUpdates[task.text] ?? {}
              if (tableType === "theory") {
                existingUpdate.theoryDate = storedDate
              } else {
                existingUpdate.practiceDate = storedDate
              }
              rolledUpdates[task.text] = existingUpdate
            }
          }

          const diffDays = computeDaysUntil(effectiveEventDate)
          const baselineTotal =
            total && total > 0
              ? Math.max(total, diffDays)
              : Math.max(diffDays, task.denominator)
          const newDenominator = Math.max(baselineTotal, 1)
          const newNumerator = Math.min(
            newDenominator,
            Math.max(newDenominator - diffDays, 0),
          )

          if (
            task.days === diffDays &&
            task.denominator === newDenominator &&
            task.numerator === newNumerator
          ) {
            return task
          }

          tasksChanged = true
          return {
            ...task,
            days: diffDays,
            denominator: newDenominator,
            numerator: newNumerator,
          }
        })

        if (tasksChanged) {
          tablesChanged = true
          return { ...table, tasks: updatedTasks }
        }

        return table
      })

      return tablesChanged ? updatedTables : prevTables
    })

    if (Object.keys(rolledUpdates).length > 0) {
      let shouldPersist = false
      setSubjectSchedules((prev) => {
        let didChange = false
        const next = prev.map((subject) => {
          const update = rolledUpdates[subject.name]
          if (!update) {
            return subject
          }

          let subjectChanged = false
          const updatedSubject: SubjectSchedule = { ...subject }

          if (update.theoryDate && update.theoryDate !== subject.theoryDate) {
            updatedSubject.theoryDate = update.theoryDate
            subjectChanged = true
          }

          if (update.practiceDate && update.practiceDate !== subject.practiceDate) {
            updatedSubject.practiceDate = update.practiceDate
            subjectChanged = true
          }

          if (subjectChanged) {
            didChange = true
            return updatedSubject
          }

          return subject
        })

        if (didChange) {
          shouldPersist = true
          subjectSchedulesRef.current = next
          return next
        }

        return prev
      })

    if (shouldPersist) {
      persistSubjectScheduleUpdates(rolledUpdates)
    }
    }
  }, [persistSubjectScheduleUpdates])

  useEffect(() => {
    subjectSchedulesRef.current = subjectSchedules
    syncCountdowns(subjectSchedules)
  }, [subjectSchedules, syncCountdowns])

  useEffect(() => {
    const interval = setInterval(() => {
      syncCountdowns(subjectSchedulesRef.current)
    }, 60000)

    return () => clearInterval(interval)
  }, [syncCountdowns])

  useEffect(() => {
    const stored = localStorage.getItem("eventZoom")
    if (stored) {
      const value = parseFloat(stored)
      if (!isNaN(value)) {
        setEventZoom(value)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem("eventZoom", eventZoom.toString())
  }, [eventZoom])

  const [tables, setTables] = useState<Table[]>([
    {
      title: "Teoría",
      tasks: [
        {
          id: "1",
          text: "Álgebra",
          numerator: 0,
          denominator: 7,
          topics: [],
        },
        {
          id: "2",
          text: "Cálculo",
          numerator: 0,
          denominator: 7,
          topics: [],
        },
        {
          id: "3",
          text: "Poo",
          numerator: 0,
          denominator: 7,
          topics: [],
        },
      ],
    },
    {
      title: "Práctica",
      tasks: [
        {
          id: "4",
          text: "Álgebra",
          numerator: 0,
          denominator: 7,
          topics: [],
        },
        {
          id: "5",
          text: "Cálculo",
          numerator: 0,
          denominator: 7,
          topics: [],
        },
        {
          id: "6",
          text: "Poo",
          numerator: 0,
          denominator: 7,
          topics: [],
        },
      ],
    },
    {
      title: "Importantes",
      tasks: [],
    },
  ])

  const hasLoadedImportant = useRef(false)

  const calendarEvents = useMemo(() => {
    const events: CalendarEvent[] = []

    const teoriaTasks = tables.find((t) => t.title === "Teoría")?.tasks || []
    const practicaTasks = tables.find((t) => t.title === "Práctica")?.tasks || []
    const importantTableIndex = tables.findIndex((t) => t.title === "Importantes")
    const importantTasks =
      importantTableIndex === -1 ? [] : tables[importantTableIndex].tasks

    subjectSchedules.forEach((subject) => {
      const theoryDate = parseDateInput(subject.theoryDate)
      if (theoryDate) {
        const tTask = teoriaTasks.find((t) => t.text === subject.name)
        const remaining =
          tTask && typeof tTask.days === "number"
            ? tTask.days
            : tTask
              ? Math.max(tTask.denominator - tTask.numerator, 0)
              : undefined
        events.push({
          date: theoryDate,
          label: `${subject.name} teoría${
            remaining !== undefined ? ` (${remaining})` : ""
          }`,
          color: "bg-blue-500",
          url: SUBJECT_RESOURCE_LINKS[subject.name]?.theory,
          source: { kind: "theory" },
        })
      }
      const practiceDate = parseDateInput(subject.practiceDate)
      if (practiceDate) {
        const pTask = practicaTasks.find((t) => t.text === subject.name)
        const remaining =
          pTask && typeof pTask.days === "number"
            ? pTask.days
            : pTask
              ? Math.max(pTask.denominator - pTask.numerator, 0)
              : undefined
        events.push({
          date: practiceDate,
          label: `${subject.name} práctica${
            remaining !== undefined ? ` (${remaining})` : ""
          }`,
          color: "bg-green-500",
          url: SUBJECT_RESOURCE_LINKS[subject.name]?.practice,
          source: { kind: "practice" },
        })
      }
    })

    const today = new Date()
    importantTasks.forEach((task) => {
      if (task.days !== undefined && task.days >= 0) {
        const due = new Date(today)
        due.setDate(due.getDate() + (task.days || 0))
        const trimmedUrl =
          typeof task.url === "string" && task.url.trim() !== ""
            ? task.url
            : undefined
        events.push({
          date: due,
          label: `${task.text} (${task.days}d)`,
          color: "bg-orange-500",
          url: trimmedUrl,
          source: {
            kind: "important",
            taskId: task.id,
            tableIndex: importantTableIndex,
          },
        })
      }
    })

    return events
  }, [tables, subjectSchedules])

  const selectedCalendarTask = useMemo(() => {
    if (!calendarSelection) return null
    const table = tables[calendarSelection.tableIndex]
    if (!table) return null
    const task = table.tasks.find((t) => t.id === calendarSelection.taskId)
    if (!task) return null

    let dueDate: Date | null = null
    if (table.title === "Importantes" && typeof task.days === "number") {
      const base = new Date()
      base.setHours(0, 0, 0, 0)
      base.setDate(base.getDate() + task.days)
      dueDate = base
    } else if (table.title === "Teoría" || table.title === "Práctica") {
      const subject = subjectSchedules.find((item) => item.name === task.text)
      if (subject) {
        const rawDate =
          table.title === "Teoría" ? subject.theoryDate : subject.practiceDate
        const parsedDate = parseDateInput(rawDate)
        if (parsedDate) {
          dueDate = parsedDate
        }
      }
    }

    return {
      task,
      tableTitle: table.title,
      dueDate,
    }
  }, [calendarSelection, tables, subjectSchedules])

  const saveTopicsToLocalStorage = (tables: Table[]) => {
    const topicsData: Record<string, string[]> = {}
    tables.forEach((table) => {
      table.tasks.forEach((task) => {
        if (task.topics && task.topics.length > 0) {
          topicsData[task.id] = task.topics
        }
      })
    })
    localStorage.setItem("taskTopics", JSON.stringify(topicsData))
  }

  const loadTopicsFromLocalStorage = () => {
    const stored = localStorage.getItem("taskTopics")
    if (stored) {
      const topicsData = JSON.parse(stored) as Record<string, string[]>
      setTables((prev) => {
        const updatedTables = prev.map((table) => ({
          ...table,
          tasks: table.tasks.map((task) => ({
            ...task,
            topics: topicsData[task.id] || [],
          })),
        }))
        saveTopicsToLocalStorage(updatedTables)
        return updatedTables
      })
    }
  }

  const loadSubjectsFromDatabase = async () => {
    try {
      const response = await fetch("/api/subjects", { cache: "no-store" })
      if (response.ok) {
        const subjects = await response.json()
        setSubjectSchedules((prev) => {
          const mapped: SubjectSchedule[] = subjects.map((subject: any) => {
            const existing = prev.find((item) => item.name === subject.name)
            return {
              name: subject.name,
              count: subject.pdf_count ?? existing?.count ?? 0,
              theoryDate: subject.theory_date ?? existing?.theoryDate,
              practiceDate: subject.practice_date ?? existing?.practiceDate,
              theoryTotal: existing?.theoryTotal ?? 7,
              practiceTotal: existing?.practiceTotal ?? 7,
            }
          })

          const names = new Set(mapped.map((item) => item.name))
          prev.forEach((item) => {
            if (!names.has(item.name)) {
              mapped.push(item)
            }
          })

          return mapped
        })
        return true
      }
    } catch (error) {
      console.error("Error loading subjects:", error)
    }
    return false
  }

  const saveImportantToLocalStorage = (tasks: TaskItem[]) => {
    localStorage.setItem("importantTasks", JSON.stringify(tasks))
  }

  const loadImportantFromLocalStorage = () => {
    const stored = localStorage.getItem("importantTasks")
    if (stored) {
      const tasks = JSON.parse(stored) as TaskItem[]
      setTables((prev) => {
        const newTables = [...prev]
        const index = newTables.findIndex((t) => t.title === "Importantes")
        if (index !== -1) {
          newTables[index] = { ...newTables[index], tasks }
        }
        return newTables
      })
    }
    hasLoadedImportant.current = true
  }

  useEffect(() => {
    if (hasLoadedImportant.current) {
      const important =
        tables.find((t) => t.title === "Importantes")?.tasks ?? []
      saveImportantToLocalStorage(important)
    }
  }, [tables])

  const loadProgressFromDatabase = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/progress", { cache: "no-store" })
      if (response.ok) {
        const progressData = await response.json()

        const progressMap = new Map<string, any>()
        progressData.forEach((record: any) => {
          progressMap.set(`${record.subject_name}-${record.table_type}`, record)
        })

        setTables((prevTables) =>
          prevTables.map((table) => {
            if (table.title !== "Teoría" && table.title !== "Práctica") {
              return table
            }

            const tableType = table.title === "Teoría" ? "theory" : "practice"

            return {
              ...table,
              tasks: table.tasks.map((task) => {
                const savedProgress = progressMap.get(`${task.text}-${tableType}`)

                if (savedProgress) {
                  const denominator = Math.max(
                    savedProgress.total_pdfs ?? task.denominator ?? 0,
                    1,
                  )
                  const numerator = Math.min(
                    denominator,
                    Math.max(savedProgress.current_progress ?? 0, 0),
                  )
                  return {
                    ...task,
                    numerator,
                    denominator,
                  }
                }
                return task
              }),
            }
          }),
        )

        setSubjectSchedules((prev) =>
          prev.map((subject) => {
            const theoryRecord = progressMap.get(`${subject.name}-theory`)
            const practiceRecord = progressMap.get(`${subject.name}-practice`)

            return {
              ...subject,
              theoryTotal:
                theoryRecord && theoryRecord.total_pdfs
                  ? Math.max(theoryRecord.total_pdfs, 1)
                  : subject.theoryTotal ?? 7,
              practiceTotal:
                practiceRecord && practiceRecord.total_pdfs
                  ? Math.max(practiceRecord.total_pdfs, 1)
                  : subject.practiceTotal ?? 7,
            }
          }),
        )
      }
    } catch (error) {
      console.error("Error loading progress:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadImportantFromDatabase = async (): Promise<boolean> => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/important", { cache: "no-store" })
      if (response.ok) {
        const tasks = await response.json()
        setTables((prev) => {
          const newTables = [...prev]
          const index = newTables.findIndex((t) => t.title === "Importantes")
          if (index !== -1) {
            newTables[index] = {
              ...newTables[index],
              tasks: tasks.map((t: any) => {
                const denominator = Math.max(
                  t.denominator ?? 7,
                  t.days_remaining ?? 0,
                )
                const daysRemaining = t.days_remaining ?? denominator
                const numerator = denominator - daysRemaining
                return {
                  id: String(t.id),
                  text: t.text,
                  days: daysRemaining,
                  numerator,
                  denominator,
                  topics: [],
                  url:
                    typeof t.url === "string" && t.url.trim() !== ""
                      ? t.url
                      : undefined,
                }
              }),
            }
          }
          return newTables
        })
        hasLoadedImportant.current = true
        return Array.isArray(tasks) && tasks.length > 0
      }
    } catch (error) {
      console.error("Error loading important tasks:", error)
    } finally {
      setIsLoading(false)
    }
    hasLoadedImportant.current = true
    return false
  }

  const saveProgressToDatabase = async (
    subjectName: string,
    tableType: "Teoría" | "Práctica",
    numerator: number,
    denominator: number,
  ) => {
    try {
      await fetch("/api/progress", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subjectName,
          tableType: tableType === "Teoría" ? "theory" : "practice",
          currentProgress: numerator,
          totalPdfs: denominator,
        }),
      })
    } catch (error) {
      console.error("Error saving progress:", error)
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "c" && !editingId) {
        event.preventDefault()
        setCalendarSelection(null)
        setIsCalendarMode((prev) => !prev)
        return
      }
      if (isCalendarMode) {
        if (event.key === "Escape") {
          event.preventDefault()
          setCalendarSelection(null)
          setIsCalendarMode(false)
          return
        }
        if (event.key === "ArrowRight") {
          event.preventDefault()
          setCalendarDate(
            (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
          )
        } else if (event.key === "ArrowLeft") {
          event.preventDefault()
          setCalendarDate(
            (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
          )
        }
        return
      }
      if (event.key.toLowerCase() === "i" && !editingId) {
        event.preventDefault()
        if (isEventMode) {
          setIsEventMode(false)
        } else {
          const tasks = tables
            .flatMap((table) =>
              table.tasks.map((task) => ({
                task,
                tableTitle: table.title,
                daysRemaining:
                  typeof task.days === "number"
                    ? task.days
                    : Math.max(task.denominator - task.numerator, 0),
              })),
            )
            .sort((a, b) => a.daysRemaining - b.daysRemaining)
          setEventTasks(tasks)
          setEventIndex(0)
          setIsEventMode(true)
        }
        return
      }
      if (isEventMode) {
        if (event.ctrlKey && (event.key === "+" || event.key === "=")) {
          event.preventDefault()
          setEventZoom((prev) => Math.min(prev + 0.1, 3))
        } else if (event.ctrlKey && (event.key === "-" || event.key === "_")) {
          event.preventDefault()
          setEventZoom((prev) => Math.max(prev - 0.1, 0.5))
        } else if (event.ctrlKey && event.key === "0") {
          event.preventDefault()
          setEventZoom(2)
        } else if (event.key === "ArrowRight") {
          event.preventDefault()
          setEventIndex((prev) =>
            eventTasks.length ? (prev + 1) % eventTasks.length : 0,
          )
        } else if (event.key === "ArrowLeft") {
          event.preventDefault()
          setEventIndex((prev) =>
            eventTasks.length
              ? (prev - 1 + eventTasks.length) % eventTasks.length
              : 0,
          )
        }
        return
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault()
        goToPreviousTable()
      } else if (event.key === "ArrowRight") {
        event.preventDefault()
        goToNextTable()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isEventMode, editingId, tables, eventTasks, isCalendarMode])

  useEffect(() => {
    const fetchData = async () => {
      await loadSubjectsFromDatabase()
      await loadProgressFromDatabase()
      const hasDbImportant = await loadImportantFromDatabase()
      loadTopicsFromLocalStorage()
      if (!hasDbImportant) {
        loadImportantFromLocalStorage()
      }
    }
    void fetchData()
  }, [])

  const currentTable = tables[currentTableIndex]

  const saveTask = async (id: string) => {
    const newTables = [...tables]
    newTables[currentTableIndex].tasks = newTables[currentTableIndex].tasks.map((task) =>
      task.id === id ? { ...task, text: editText } : task,
    )
    setTables(newTables)
    const updatedTask = newTables[currentTableIndex].tasks.find((t) => t.id === id)
    setEditingId(null)
    setEditText("")

    if (currentTable.title === "Importantes" && updatedTask) {
      try {
        // Al guardar texto, enviamos solo los campos necesarios para evitar conflictos
        const payload: any = { id: Number(updatedTask.id), text: updatedTask.text }
        const res = await fetch("/api/important", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error("Failed to save")
        showToast("Importante guardado")
      } catch (err) {
        console.error("Error saving important task:", err)
        showToast("Error al guardar", "error")
      }
    }
  }

  const getProgressPercentage = (numerator: number, denominator: number) => {
    if (denominator === 0) return 0
    return Math.min((numerator / denominator) * 100, 100)
  }

  const calculateAveragePercentage = () => {
    const currentTasks = currentTable.tasks
    const totalPercentage = currentTasks.reduce((sum, task) => {
      return sum + getProgressPercentage(task.numerator, task.denominator)
    }, 0)
    return Math.round(totalPercentage / currentTasks.length)
  }

  const calculatePdfsNeeded = (task: TaskItem) => {
    const currentTasks = currentTable.tasks
    const currentPercentage = getProgressPercentage(task.numerator, task.denominator)

    // Calcular la media actual
    const currentAverage = calculateAveragePercentage()

    if (currentPercentage >= currentAverage) return 0

    let pdfsNeeded = 0
    let testNumerator = task.numerator

    while (pdfsNeeded < task.denominator) {
      testNumerator = task.numerator + pdfsNeeded

      const newTotalPercentage = currentTasks.reduce((sum, t) => {
        if (t.id === task.id) {
          return sum + getProgressPercentage(testNumerator, t.denominator)
        }
        return sum + getProgressPercentage(t.numerator, t.denominator)
      }, 0)

      const newAverage = newTotalPercentage / currentTasks.length
      const newTaskPercentage = getProgressPercentage(testNumerator, task.denominator)

      if (newTaskPercentage >= newAverage) {
        break
      }

      pdfsNeeded++
    }

    return pdfsNeeded
  }

  const updateDays = async (
    id: string,
    days: number,
    tableIndexOverride?: number,
    options?: { eventDate?: Date },
  ) => {
    const targetTableIndex =
      tableIndexOverride !== undefined ? tableIndexOverride : currentTableIndex
    const newTables = [...tables]
    const targetTable = newTables[targetTableIndex]
    if (!targetTable) return

    const taskIndex = targetTable.tasks.findIndex((task) => task.id === id)
    if (taskIndex === -1) return

    const task = targetTable.tasks[taskIndex]
    const normalizedDays = Math.max(0, days)
    const isCalendarUpdate = Boolean(options?.eventDate)

    if (targetTable.title === "Importantes") {
      const newDenominator = Math.max(task.denominator, normalizedDays, 1)
      const newNumerator = Math.min(
        newDenominator,
        Math.max(newDenominator - normalizedDays, 0),
      )
      targetTable.tasks[taskIndex] = {
        ...task,
        days: normalizedDays,
        numerator: newNumerator,
        denominator: newDenominator,
      }
      setTables(newTables)
      try {
        const res = await fetch("/api/important", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: Number(task.id),
            text: task.text,
            numerator: newNumerator,
            denominator: newDenominator,
            days_remaining: normalizedDays,
          }),
        })
        if (!res.ok) throw new Error("Failed to save")
        showToast("Fecha actualizada")
      } catch (err) {
        console.error("Error updating important task:", err)
        showToast("Error al guardar", "error")
      }
      return
    }

    const newDenominator = isCalendarUpdate
      ? Math.max(normalizedDays, 1)
      : Math.max(task.denominator, normalizedDays, 1)
    const newNumerator = Math.min(
      newDenominator,
      Math.max(newDenominator - normalizedDays, 0),
    )
    targetTable.tasks[taskIndex] = {
      ...task,
      numerator: newNumerator,
      denominator: newDenominator,
      days: normalizedDays,
    }
    setTables(newTables)
    await saveProgressToDatabase(
      task.text,
      targetTable.title as "Teoría" | "Práctica",
      newNumerator,
      newDenominator,
    )
  }

  const handleCalendarDateSelection = async (selectedDate: Date) => {
    if (!calendarSelection) return

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const normalizedSelected = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
    )
    const diffMs = normalizedSelected.getTime() - today.getTime()
    const diffDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))

    const targetTable = tables[calendarSelection.tableIndex]
    if (!targetTable) {
      setCalendarSelection(null)
      setIsCalendarMode(false)
      return
    }

    const task = targetTable.tasks.find((item) => item.id === calendarSelection.taskId)
    if (!task) {
      setCalendarSelection(null)
      setIsCalendarMode(false)
      return
    }

    if (targetTable.title === "Teoría" || targetTable.title === "Práctica") {
      const storedDate = formatDateForStorage(normalizedSelected)
      const tableTitle = targetTable.title

      setSubjectSchedules((prev) =>
        prev.map((subject) => {
          if (subject.name !== task.text) {
            return subject
          }
          return {
            ...subject,
            theoryDate:
              tableTitle === "Teoría" ? storedDate : subject.theoryDate,
            practiceDate:
              tableTitle === "Práctica" ? storedDate : subject.practiceDate,
            theoryTotal:
              tableTitle === "Teoría"
                ? Math.max(diffDays, 1)
                : subject.theoryTotal ?? 7,
            practiceTotal:
              tableTitle === "Práctica"
                ? Math.max(diffDays, 1)
                : subject.practiceTotal ?? 7,
          }
        }),
      )

      const payload: Record<string, unknown> = { name: task.text }
      if (tableTitle === "Teoría") {
        payload.theory_date = storedDate
      } else {
        payload.practice_date = storedDate
      }

      try {
        await fetch("/api/subjects", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } catch (error) {
        console.error("Error saving subject date:", error)
      }
    }

    await updateDays(
      calendarSelection.taskId,
      diffDays,
      calendarSelection.tableIndex,
      { eventDate: normalizedSelected },
    )
    showToast("Guardado")
    setCalendarSelection(null)
    setIsCalendarMode(false)
  }

  const addImportantTask = async () => {
    const response = await fetch("/api/important", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ denominator: 7, days_remaining: 7 }),
    })
    if (response.ok) {
      const task = await response.json()
      setTables((prev) => {
        const newTables = [...prev]
        const index = newTables.findIndex((t) => t.title === "Importantes")
        if (index !== -1) {
          const denominator = Math.max(task.denominator ?? 7, task.days_remaining ?? 0)
          const daysRemaining = task.days_remaining ?? denominator
          const numerator = denominator - daysRemaining
          newTables[index].tasks.push({
            id: String(task.id),
            text: task.text,
            days: daysRemaining,
            numerator,
            denominator,
            topics: [],
            url:
              typeof task.url === "string" && task.url.trim() !== ""
                ? task.url
                : undefined,
          })
        }
        return newTables
      })
    }
  }

  const addTopic = (id: string, topic: string) => {
    setTables((prev) => {
      const newTables = [...prev]
      const tasks = newTables[currentTableIndex].tasks
      const taskIndex = tasks.findIndex((t) => t.id === id)
      if (taskIndex !== -1 && topic.trim() !== "") {
        const task = tasks[taskIndex]
        const topics = task.topics || []
        tasks[taskIndex] = { ...task, topics: [...topics, topic.trim()] }
        saveTopicsToLocalStorage(newTables)
      }
      return newTables
    })
  }

  const removeTopic = (id: string, index: number) => {
    setTables((prev) => {
      const newTables = [...prev]
      const tasks = newTables[currentTableIndex].tasks
      const taskIndex = tasks.findIndex((t) => t.id === id)
      if (taskIndex !== -1) {
        const task = tasks[taskIndex]
        const topics = task.topics || []
        tasks[taskIndex] = { ...task, topics: topics.filter((_, i) => i !== index) }
        saveTopicsToLocalStorage(newTables)
      }
      return newTables
    })
  }

  const removeImportantTask = async (id: string) => {
    await fetch("/api/important", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: Number(id) }),
    })
    setTables((prev) => {
      const newTables = [...prev]
      const index = newTables.findIndex((t) => t.title === "Importantes")
      if (index !== -1) {
        newTables[index].tasks = newTables[index].tasks.filter((t) => t.id !== id)
        saveTopicsToLocalStorage(newTables)
      }
      return newTables
    })
  }

  const goToPreviousTable = () => {
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentTableIndex((prev) => (prev > 0 ? prev - 1 : tables.length - 1))
      setIsTransitioning(false)
    }, 150)
  }

  const goToNextTable = () => {
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentTableIndex((prev) => (prev < tables.length - 1 ? prev + 1 : 0))
      setIsTransitioning(false)
    }, 150)
  }

  const getIconAndColor = (daysRemaining: number) => {
    if (daysRemaining === 1) {
      return {
        icon: Flame,
        bgColor: "from-orange-500 to-red-500",
        iconColor: "text-yellow-200",
      }
    } else if (daysRemaining >= 3) {
      return {
        icon: TreePine,
        bgColor: "from-green-500 to-emerald-600",
        iconColor: "text-green-100",
      }
    } else {
      return {
        icon: Sun,
        bgColor: "from-yellow-400 to-orange-400",
        iconColor: "text-yellow-100",
      }
    }
  }

  const renderCalendarCells = () => {
    const year = calendarDate.getFullYear()
    const month = calendarDate.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const startDay = new Date(year, month, 1).getDay()
    const cells = []
    const today = new Date()
    const selectedDate = selectedCalendarTask?.dueDate || null
    const isSelectingDate = Boolean(calendarSelection)

    for (let i = 0; i < startDay; i++) {
      cells.push(<div key={`empty-${i}`} />)
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dayEvents = calendarEvents.filter(
        (e) =>
          e.date.getFullYear() === year &&
          e.date.getMonth() === month &&
          e.date.getDate() === day,
      )
      const isToday =
        year === today.getFullYear() &&
        month === today.getMonth() &&
        day === today.getDate()
      const isSelected =
        selectedDate !== null &&
        selectedDate.getFullYear() === year &&
        selectedDate.getMonth() === month &&
        selectedDate.getDate() === day

      cells.push(
        <button
          type="button"
          key={day}
          onClick={() => {
            if (isSelectingDate) {
              void handleCalendarDateSelection(new Date(year, month, day))
            }
          }}
          className={`border h-24 p-1 overflow-hidden text-left transition-colors ${
            isToday ? "bg-blue-200 dark:bg-blue-900" : ""
          } ${isSelected ? "ring-2 ring-blue-500" : ""} ${
            isSelectingDate ? "cursor-pointer hover:border-blue-500" : "cursor-default"
          }`}
        >
          <div className="text-[10px] font-bold">{day}</div>
          <div className="space-y-1 mt-1">
            {dayEvents.map((ev, idx) => (
              <div
                key={idx}
                className={`text-[9px] text-white px-1 rounded ${ev.color} ${
                  ev.url
                    ? "cursor-pointer underline decoration-transparent hover:decoration-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:ring-white/60"
                    : ""
                }`}
                onContextMenu={(event) =>
                  handleCalendarEventContextMenu(event, ev)
                }
                onClick={
                  ev.url
                    ? (event) => {
                        event.stopPropagation()
                        window.open(ev.url, "_blank", "noopener,noreferrer")
                      }
                    : undefined
                }
                onKeyDown={
                  ev.url
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          event.stopPropagation()
                          window.open(ev.url, "_blank", "noopener,noreferrer")
                        }
                      }
                    : undefined
                }
                role={ev.url ? "link" : undefined}
                tabIndex={ev.url ? 0 : undefined}
              >
                {ev.label}
              </div>
            ))}
          </div>
        </button>,
      )
    }
    return cells
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando progreso...</p>
        </div>
      </div>
    )
  }

  if (isCalendarMode) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-card p-4 rounded-lg shadow-lg w-full max-w-3xl">
          <div className="flex items-center justify-between mb-4 gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setCalendarDate(
                  (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                )
              }
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 text-center">
              <h2 className="text-xl font-bold capitalize">
                {calendarDate.toLocaleString("es-ES", { month: "long" })}{" "}
                {calendarDate.getFullYear()}
              </h2>
              {calendarSelection && selectedCalendarTask && (
                <p className="text-xs text-muted-foreground mt-1">
                  Selecciona la fecha del evento para {" "}
                  <span className="font-semibold">
                    {selectedCalendarTask.task.text}
                  </span>
                  {selectedCalendarTask.tableTitle
                    ? ` (${selectedCalendarTask.tableTitle})`
                    : ""}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  setCalendarDate(
                    (prev) =>
                      new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                  )
                }
                aria-label="Mes siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setCalendarSelection(null)
                  setIsCalendarMode(false)
                }}
                aria-label="Cerrar calendario"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2 text-xs text-center mb-2">
            {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
              <div key={d} className="font-semibold">
                {d}
              </div>
            ))}
            {renderCalendarCells()}
          </div>
          {calendarSelection && (
            <p className="text-xs text-muted-foreground text-center">
              Haz clic en una fecha para asignar los días restantes de este evento.
            </p>
          )}
        </div>
      </div>
    )
  }

  if (isEventMode && eventTasks.length > 0) {
    const current = eventTasks[eventIndex]
    const { task, tableTitle, daysRemaining } = current
    const { icon: IconComponent, bgColor, iconColor } = getIconAndColor(daysRemaining)

    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div
          className="relative overflow-hidden bg-card border rounded-lg shadow-sm w-full max-w-md"
          style={{ transform: `scale(${eventZoom})`, transformOrigin: "center" }}
        >
          <div
            className={`absolute top-0 right-0 z-20 flex items-center gap-1 bg-gradient-to-r ${bgColor} text-white px-2 py-1 rounded-bl-lg text-xs font-bold shadow-lg`}
          >
            <IconComponent className={`h-3 w-3 ${iconColor}`} />
            <span>{daysRemaining}d</span>
          </div>

          <div
            className="absolute inset-0 bg-gradient-to-r from-green-200 to-green-400 transition-all duration-300 ease-out"
            style={{ width: `${getProgressPercentage(task.numerator, task.denominator)}%` }}
          />

          <div className="relative z-10 flex items-center gap-4 p-6">
            <div className="flex-1 p-3 text-foreground">{task.text}</div>
            <div className="text-sm text-muted-foreground font-medium shrink-0">
              {Math.max(task.denominator - daysRemaining, 0)}/{task.denominator}
            </div>
            <div className="text-sm text-muted-foreground font-medium shrink-0 w-12 text-right">
              {Math.round(getProgressPercentage(task.numerator, task.denominator))}%
            </div>
          </div>
          <div className="absolute bottom-2 left-3 text-xs text-muted-foreground">
            {tableTitle}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-6 relative">
      <div className="fixed top-6 left-6 z-30">
        <Button
          onClick={() =>
            setCurrentTableIndex(tables.findIndex((t) => t.title === "Importantes"))
          }
          className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
          size="lg"
        >
          <span className="text-xs text-white font-bold">IMP</span>
        </Button>
      </div>
      <div className="fixed top-6 right-6 z-30">
        <Button
          onClick={() => setShowAverageLine(!showAverageLine)}
          className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
          size="lg"
        >
          <div className="flex flex-col items-center">
            <span className="text-xs text-white font-bold">Plus +</span>
            <span className="text-xs text-white font-bold">{calculateAveragePercentage()}%</span>
          </div>
        </Button>
      </div>

      <div className="max-w-4xl mx-auto">
        <h1
          className={`text-3xl font-bold mb-8 text-center transition-all duration-300 ${isTransitioning ? "opacity-0 transform scale-95" : "opacity-100 transform scale-100"}`}
        >
          {currentTable.title}
        </h1>

        <div
          className={`space-y-3 transition-all duration-300 ${isTransitioning ? "opacity-0 transform translate-x-4" : "opacity-100 transform translate-x-0"}`}
        >
          {currentTable.tasks.map((task) => {
            const daysRemaining =
              typeof task.days === "number"
                ? task.days
                : Math.max(task.denominator - task.numerator, 0)
            const { icon: IconComponent, bgColor, iconColor } = getIconAndColor(daysRemaining)
            const currentPercentage = getProgressPercentage(task.numerator, task.denominator)
            const averagePercentage = calculateAveragePercentage()
            const isBelowAverage = currentPercentage < averagePercentage
            const isHovered = hoveredTaskId === task.id
            const missingPdfs = calculatePdfsNeeded(task)

            return (
              <div
                key={task.id}
                className="relative overflow-hidden bg-card border rounded-lg shadow-sm"
                onMouseEnter={() => setHoveredTaskId(task.id)}
                onMouseLeave={() => setHoveredTaskId(null)}
              >
                <div
                  className={`absolute top-0 right-0 z-20 flex items-center gap-1 bg-gradient-to-r ${bgColor} text-white px-2 py-1 rounded-bl-lg text-xs font-bold shadow-lg cursor-pointer`}
                  onClick={() => {
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    let initialDate = new Date(
                      today.getFullYear(),
                      today.getMonth(),
                      1,
                    )

                    if (currentTable.title === "Importantes") {
                      if (typeof task.days === "number") {
                        const dueDate = new Date(today)
                        dueDate.setDate(dueDate.getDate() + task.days)
                        initialDate = new Date(
                          dueDate.getFullYear(),
                          dueDate.getMonth(),
                          1,
                        )
                      }
                    } else {
                      const subject = subjectSchedules.find(
                        (item) => item.name === task.text,
                      )
                      const rawDate =
                        currentTable.title === "Teoría"
                          ? subject?.theoryDate
                          : subject?.practiceDate
                      const parsedDate = parseDateInput(rawDate)
                      if (parsedDate) {
                        initialDate = new Date(
                          parsedDate.getFullYear(),
                          parsedDate.getMonth(),
                          1,
                        )
                      }
                    }

                    setCalendarDate(initialDate)
                    setCalendarSelection({
                      taskId: task.id,
                      tableIndex: currentTableIndex,
                    })
                    setIsCalendarMode(true)
                  }}
                >
                  <IconComponent className={`h-3 w-3 ${iconColor}`} />
                  <span>{daysRemaining}d</span>
                </div>

                <div
                  className="absolute inset-0 bg-gradient-to-r from-green-200 to-green-400 transition-all duration-300 ease-out"
                  style={{
                    width: `${getProgressPercentage(task.numerator, task.denominator)}%`,
                  }}
                />

                {showAverageLine && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 z-15 shadow-sm transition-all duration-300"
                    style={{
                      left: `${calculateAveragePercentage()}%`,
                      background:
                        showAverageLine && isHovered && isBelowAverage
                          ? "linear-gradient(to bottom, #374151 0%, #374151 100%)"
                          : "repeating-linear-gradient(to bottom, #ef4444 0px, #ef4444 4px, transparent 4px, transparent 8px)",
                    }}
                  >
                    {showAverageLine && isHovered && isBelowAverage && (
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-gradient-radial from-white via-gray-200 to-gray-800 flex items-center justify-center shadow-lg z-30">
                        <div className="text-center">
                          <div className="text-xs font-bold text-gray-800">Faltan</div>
                          <div className="text-sm font-bold text-gray-900">{missingPdfs} pdfs</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="relative z-10 flex items-center gap-4 p-3">
                  <div className="flex-1">
                    {editingId === task.id ? (
                      <Input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            saveTask(task.id)
                          }
                        }}
                        onBlur={() => saveTask(task.id)}
                        placeholder="Escribe tu tarea..."
                        className="bg-transparent border-none shadow-none focus-visible:ring-0"
                        autoFocus
                      />
                    ) : (
                      <div
                        className="p-3 text-foreground cursor-pointer hover:text-muted-foreground transition-colors min-h-[2.5rem] flex items-center"
                        onClick={() => {
                          setEditingId(task.id)
                          setEditText(task.text)
                        }}
                      >
                        {task.text || "Haz clic para escribir..."}
                      </div>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground font-medium shrink-0">
                    {Math.max(task.denominator - daysRemaining, 0)}/{task.denominator}
                  </div>

                  <div className="text-sm text-muted-foreground font-medium shrink-0 w-12 text-right">
                    {Math.round(getProgressPercentage(task.numerator, task.denominator))}%
                  </div>
                  {currentTable.title === "Importantes" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-2 bg-transparent"
                      onClick={() => removeImportantTask(task.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="relative z-10 flex flex-wrap gap-2 px-3 pb-3">
                  {(task.topics || []).map((topic, index) => (
                    <span
                      key={index}
                      className="bg-green-500 text-white text-xs px-2 py-1 rounded cursor-pointer"
                      onClick={() => removeTopic(task.id, index)}
                    >
                      {topic}
                    </span>
                  ))}
                  <Input
                    value={topicInputs[task.id] || ""}
                    onChange={(e) =>
                      setTopicInputs((prev) => ({ ...prev, [task.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        addTopic(task.id, topicInputs[task.id] || "")
                        setTopicInputs((prev) => ({ ...prev, [task.id]: "" }))
                      }
                    }}
                    placeholder="Agregar tema..."
                    className="w-32 h-7 bg-white/80 backdrop-blur-sm text-xs"
                  />
                </div>
              </div>
            )
          })}
        </div>

        {currentTable.title === "Importantes" && (
          <div className="flex justify-center mt-8">
            <Button onClick={addImportantTask} className="bg-blue-500 hover:bg-blue-600">
              Agregar
            </Button>
          </div>
        )}

        <div className="flex justify-center gap-4 mt-8">
          <Button onClick={goToPreviousTable} variant="outline" size="lg" className="w-16 h-16 bg-transparent">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button onClick={goToNextTable} variant="outline" size="lg" className="w-16 h-16 bg-transparent">
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
        {toast && (
          <div
            className={`fixed top-4 right-4 px-4 py-2 rounded shadow text-white transition-opacity duration-300 ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}`}
            role="status"
            aria-live="polite"
          >
            {toast.message}
          </div>
        )}
        {isClient &&
          linkModalState.isOpen &&
          createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
                <h2 className="text-lg font-semibold">Agregar link</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {linkModalState.label}
                </p>
                <Input
                  value={linkModalState.url}
                  onChange={(event) => {
                    const value = event.target.value
                    setLinkModalState((prev) =>
                      prev.isOpen ? { ...prev, url: value } : prev,
                    )
                  }}
                  placeholder="https://..."
                  className="mt-4"
                  autoFocus
                />
                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="outline" onClick={handleLinkModalClose}>
                    Cancelar
                  </Button>
                  <Button onClick={() => void handleLinkModalSave()}>
                    Guardar
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )}
      </div>
    </div>
  )
}
