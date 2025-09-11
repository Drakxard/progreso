"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, Flame, Sun, TreePine, X } from "lucide-react"

interface TaskItem {
  id: string
  text: string
  numerator: number
  denominator: number
  days?: number
  topics?: string[]
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

export default function ProgressTracker({ initialData }: ProgressTrackerProps) {
  const [currentTableIndex, setCurrentTableIndex] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [editingDaysId, setEditingDaysId] = useState<string | null>(null)
  const [editDaysValue, setEditDaysValue] = useState("")
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [showAverageLine, setShowAverageLine] = useState(false)
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null)
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

  const parseDateInput = (input?: string): Date | null => {
    if (!input) return null
    if (/^\d+d$/.test(input)) {
      const days = parseInt(input.slice(0, -1), 10)
      const date = new Date()
      date.setDate(date.getDate() + days)
      return date
    }
    const date = new Date(input)
    return isNaN(date.getTime()) ? null : date
  }

  const calendarEvents = useMemo(() => {
    const events: { date: Date; label: string; color: string }[] = []

    const teoriaTasks = tables.find((t) => t.title === "Teoría")?.tasks || []
    const practicaTasks = tables.find((t) => t.title === "Práctica")?.tasks || []

    initialData.forEach((subject) => {
      const theoryDate = parseDateInput(subject.theoryDate)
      if (theoryDate) {
        const tTask = teoriaTasks.find((t) => t.text === subject.name)
        const remaining = tTask ? tTask.denominator - tTask.numerator : undefined
        events.push({
          date: theoryDate,
          label: `${subject.name} teoría${
            remaining !== undefined ? ` (${remaining})` : ""
          }`,
          color: "bg-blue-500",
        })
      }
      const practiceDate = parseDateInput(subject.practiceDate)
      if (practiceDate) {
        const pTask = practicaTasks.find((t) => t.text === subject.name)
        const remaining = pTask ? pTask.denominator - pTask.numerator : undefined
        events.push({
          date: practiceDate,
          label: `${subject.name} práctica${
            remaining !== undefined ? ` (${remaining})` : ""
          }`,
          color: "bg-green-500",
        })
      }
    })

    const today = new Date()
    tables
      .find((t) => t.title === "Importantes")
      ?.tasks.forEach((task) => {
        if (task.days !== undefined && task.days >= 0) {
          const due = new Date(today)
          due.setDate(due.getDate() + (task.days || 0))
          events.push({
            date: due,
            label: `${task.text} (${task.days}d)` ,
            color: "bg-orange-500",
          })
        }
      })

    return events
  }, [tables, initialData])

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

        // Actualizar las tablas con el progreso guardado
        setTables((prevTables) =>
          prevTables.map((table) => ({
            ...table,
            tasks: table.tasks.map((task) => {
              const tableType = table.title === "Teoría" ? "theory" : "practice"
              const savedProgress = progressData.find(
                (p: any) => p.subject_name === task.text && p.table_type === tableType,
              )

              if (savedProgress) {
                return {
                  ...task,
                  numerator: savedProgress.current_progress % 7,
                  denominator: 7,
                }
              }
              return task
            }),
          }))
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
                }
              }),
            }
          }
          return newTables
        })
        return Array.isArray(tasks) && tasks.length > 0
      }
    } catch (error) {
      console.error("Error loading important tasks:", error)
    } finally {
      setIsLoading(false)
    }
    return false
  }

  const fetchData = async () => {
    await loadProgressFromDatabase()
    const hasDbImportant = await loadImportantFromDatabase()
    loadTopicsFromLocalStorage()
    if (!hasDbImportant) {
      loadImportantFromLocalStorage()
    } else {
      hasLoadedImportant.current = true
    }
  }

  const saveProgressToDatabase = async (
    subjectName: string,
    tableType: "Teoría" | "Práctica",
    numerator: number,
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
          totalPdfs: 7,
        }),
      })
    } catch (error) {
      console.error("Error saving progress:", error)
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "q" && !editingId && !editingDaysId) {
        event.preventDefault()
        fetchData()
        return
      }
      if (event.key.toLowerCase() === "c" && !editingId && !editingDaysId) {
        event.preventDefault()
        setIsCalendarMode((prev) => !prev)
        return
      }
      if (isCalendarMode) {
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
      if (event.key.toLowerCase() === "i" && !editingId && !editingDaysId) {
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
                  table.title === "Importantes"
                    ? task.days || 0
                    : task.denominator - task.numerator,
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
  }, [isEventMode, editingId, editingDaysId, tables, eventTasks, isCalendarMode, fetchData])

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    const scheduleMidnightUpdate = () => {
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      const msUntilMidnight = nextMidnight.getTime() - now.getTime()
      return setTimeout(() => {
        fetchData()
        interval = setInterval(fetchData, 24 * 60 * 60 * 1000)
      }, msUntilMidnight)
    }
    const timeout = scheduleMidnightUpdate()
    return () => {
      clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [fetchData])

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
      await fetch("/api/important", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: Number(updatedTask.id),
          text: updatedTask.text,
          numerator: updatedTask.numerator,
          denominator: updatedTask.denominator,
          days_remaining: updatedTask.days || 0,
        }),
      })
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

  const updateDays = async (id: string, days: number) => {
    const newTables = [...tables]
    const taskIndex = newTables[currentTableIndex].tasks.findIndex((task) => task.id === id)
    if (taskIndex !== -1) {
      const task = newTables[currentTableIndex].tasks[taskIndex]
      if (currentTable.title === "Importantes") {
        const newDenominator = Math.max(task.denominator, days)
        const newNumerator = newDenominator - days
        newTables[currentTableIndex].tasks[taskIndex] = {
          ...task,
          days,
          numerator: newNumerator,
          denominator: newDenominator,
        }
        setTables(newTables)
        await fetch("/api/important", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: Number(task.id),
            text: task.text,
            numerator: newNumerator,
            denominator: newDenominator,
            days_remaining: days,
          }),
        })
      } else {
        const newNumerator = 7 - days
        newTables[currentTableIndex].tasks[taskIndex] = {
          ...task,
          numerator: newNumerator,
          denominator: 7,
        }
        setTables(newTables)
        await saveProgressToDatabase(
          task.text,
          currentTable.title as "Teoría" | "Práctica",
          newNumerator,
        )
      }
    }
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

      cells.push(
        <div
          key={day}
          className={`border h-24 p-1 overflow-hidden ${
            isToday ? "bg-blue-200 dark:bg-blue-900" : ""
          }`}
        >
          <div className="text-[10px] font-bold">{day}</div>
          <div className="space-y-1 mt-1">
            {dayEvents.map((ev, idx) => (
              <div
                key={idx}
                className={`text-[9px] text-white px-1 rounded ${ev.color}`}
              >
                {ev.label}
              </div>
            ))}
          </div>
        </div>,
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
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setCalendarDate(
                  (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                )
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-bold capitalize">
              {calendarDate.toLocaleString("es-ES", { month: "long" })}{" "}
              {calendarDate.getFullYear()}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setCalendarDate(
                  (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                )
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-2 text-xs text-center mb-2">
            {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
              <div key={d} className="font-semibold">
                {d}
              </div>
            ))}
            {renderCalendarCells()}
          </div>
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
              {task.denominator - daysRemaining}/{task.denominator}
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
              currentTable.title === "Importantes"
                ? task.days || 0
                : task.denominator - task.numerator
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
                  className={`absolute top-0 right-0 z-20 flex items-center gap-1 bg-gradient-to-r ${bgColor} text-white px-2 py-1 rounded-bl-lg text-xs font-bold shadow-lg`}
                  onClick={() => {
                    setEditingDaysId(task.id)
                    const current =
                      currentTable.title === "Importantes"
                        ? task.days || 0
                        : task.denominator - task.numerator
                    setEditDaysValue(String(current))
                  }}
                >
                  <IconComponent className={`h-3 w-3 ${iconColor}`} />
                  {editingDaysId === task.id ? (
                    <Input
                      value={editDaysValue}
                      onChange={(e) => setEditDaysValue(e.target.value)}
                      onBlur={() => {
                        updateDays(task.id, Number.parseInt(editDaysValue) || 0)
                        setEditingDaysId(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          updateDays(task.id, Number.parseInt(editDaysValue) || 0)
                          setEditingDaysId(null)
                        }
                      }}
                      className="w-10 h-4 text-black text-center bg-white rounded"
                    />
                  ) : (
                    <span>{daysRemaining}d</span>
                  )}
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
                    {task.denominator - daysRemaining}/{task.denominator}
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
      </div>
    </div>
  )
}
