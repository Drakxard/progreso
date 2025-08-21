"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, Flame, Sun, TreePine, Settings } from "lucide-react"

interface TaskItem {
  id: string
  text: string
  numerator: number
  denominator: number
  nextDate?: string | null
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
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [showAverageLine, setShowAverageLine] = useState(false)
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newSubjectName, setNewSubjectName] = useState("")
  const [newPdfCount, setNewPdfCount] = useState(1)
  const [editingDaysInfo, setEditingDaysInfo] = useState<{ tableIndex: number; taskId: string } | null>(null)
  const [newDays, setNewDays] = useState(7)

  const calculateDaysRemaining = (subjectName: string, tableType: "Teoría" | "Práctica") => {
    const today = new Date()
    const currentDay = today.getDay() // 0 = domingo, 1 = lunes, etc.

    let targetDay: number

    // Configuración del horario fijo
    if (tableType === "Práctica") {
      if (subjectName === "Álgebra" || subjectName === "Cálculo") {
        targetDay = 1 // Lunes
      } else if (subjectName === "Poo") {
        targetDay = 5 // Viernes
      } else {
        return 0
      }
    } else {
      // Teoría
      if (subjectName === "Álgebra" || subjectName === "Cálculo") {
        targetDay = 4 // Jueves
      } else if (subjectName === "Poo") {
        targetDay = 2 // Martes
      } else {
        return 0
      }
    }

    // Calcular días hasta el próximo día objetivo
    let daysUntil = targetDay - currentDay
    if (daysUntil <= 0) {
      daysUntil += 7 // Si ya pasó esta semana, calcular para la próxima
    }

    return daysUntil
  }

  const [tables, setTables] = useState<Table[]>([
    {
      title: "Teoría",
      tasks: [
        {
          id: "1",
          text: "Álgebra",
          numerator: 0,
          denominator: initialData.find((d) => d.name === "Álgebra")?.count || 1,
        },
        {
          id: "2",
          text: "Cálculo",
          numerator: 0,
          denominator: initialData.find((d) => d.name === "Cálculo")?.count || 1,
        },
        { id: "3", text: "Poo", numerator: 0, denominator: initialData.find((d) => d.name === "Poo")?.count || 1 },
      ],
    },
    {
      title: "Práctica",
      tasks: [
        {
          id: "4",
          text: "Álgebra",
          numerator: 0,
          denominator: initialData.find((d) => d.name === "Álgebra")?.count || 1,
        },
        {
          id: "5",
          text: "Cálculo",
          numerator: 0,
          denominator: initialData.find((d) => d.name === "Cálculo")?.count || 1,
        },
        { id: "6", text: "Poo", numerator: 0, denominator: initialData.find((d) => d.name === "Poo")?.count || 1 },
      ],
    },
  ])

  const loadProgressFromDatabase = async () => {
    try {
      setIsLoading(true)
      const [progressRes, subjectsRes] = await Promise.all([
        fetch("/api/progress"),
        fetch("/api/subjects"),
      ])

      if (progressRes.ok && subjectsRes.ok) {
        const progressData = await progressRes.json()
        const subjectsData = await subjectsRes.json()

        const today = new Date()
        const subjectDates: Record<string, { theory_date: string | null; practice_date: string | null }> = {}

        for (const subject of subjectsData) {
          let { name, theory_date, practice_date } = subject

          if (theory_date) {
            const date = new Date(theory_date)
            if (date <= today) {
              const newDate = new Date()
              newDate.setDate(today.getDate() + 7)
              theory_date = newDate.toISOString()
              await fetch("/api/subjects", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, theory_date }),
              })
            }
          }

          if (practice_date) {
            const date = new Date(practice_date)
            if (date <= today) {
              const newDate = new Date()
              newDate.setDate(today.getDate() + 7)
              practice_date = newDate.toISOString()
              await fetch("/api/subjects", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, practice_date }),
              })
            }
          }

          subjectDates[name] = { theory_date, practice_date }
        }

        // Actualizar las tablas con el progreso y las fechas
        const updatedTables = tables.map((table) => ({
          ...table,
          tasks: table.tasks.map((task) => {
            const tableType = table.title === "Teoría" ? "theory" : "practice"
            const savedProgress = progressData.find(
              (p: any) => p.subject_name === task.text && p.table_type === tableType,
            )
            const dates = subjectDates[task.text] || { theory_date: null, practice_date: null }
            const nextDate = table.title === "Teoría" ? dates.theory_date : dates.practice_date

            if (savedProgress) {
              return {
                ...task,
                numerator: savedProgress.current_progress,
                denominator: savedProgress.total_pdfs,
                nextDate,
              }
            }
            return { ...task, nextDate }
          }),
        }))

        setTables(updatedTables)
      }
    } catch (error) {
      console.error("Error loading progress:", error)
    } finally {
      setIsLoading(false)
    }
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

  const getDaysRemaining = (task: TaskItem, tableTitle: "Teoría" | "Práctica") => {
    if (task.nextDate) {
      const today = new Date()
      const target = new Date(task.nextDate)
      let diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (diff <= 0) diff = 7
      return diff
    }
    return calculateDaysRemaining(task.text, tableTitle)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
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
  }, [])

  useEffect(() => {
    loadProgressFromDatabase()
  }, [])

  const currentTable = tables[currentTableIndex]

  const saveTask = (id: string) => {
    const newTables = [...tables]
    newTables[currentTableIndex].tasks = newTables[currentTableIndex].tasks.map((task) =>
      task.id === id ? { ...task, text: editText } : task,
    )
    setTables(newTables)
    setEditingId(null)
    setEditText("")
  }

  const updateProgress = async (id: string, numerator: number, denominator: number) => {
    const newTables = [...tables]
    const taskIndex = newTables[currentTableIndex].tasks.findIndex((task) => task.id === id)

    if (taskIndex !== -1) {
      const task = newTables[currentTableIndex].tasks[taskIndex]
      newTables[currentTableIndex].tasks[taskIndex] = { ...task, numerator, denominator }
      setTables(newTables)

      await saveProgressToDatabase(task.text, currentTable.title as "Teoría" | "Práctica", numerator, denominator)
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

  const openEditDays = (task: TaskItem) => {
    const days = getDaysRemaining(task, currentTable.title as "Teoría" | "Práctica")
    setEditingDaysInfo({ tableIndex: currentTableIndex, taskId: task.id })
    setNewDays(days)
  }

  const saveEditedDays = async () => {
    if (!editingDaysInfo) return
    const { tableIndex, taskId } = editingDaysInfo
    const newTables = [...tables]
    const task = newTables[tableIndex].tasks.find((t) => t.id === taskId)
    if (task) {
      const adjusted = newDays <= 0 ? 7 : newDays
      const newDate = new Date()
      newDate.setDate(newDate.getDate() + adjusted)
      task.nextDate = newDate.toISOString()
      setTables(newTables)
      try {
        await fetch("/api/subjects", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: task.text,
            ...(tableIndex === 0
              ? { theory_date: newDate.toISOString() }
              : { practice_date: newDate.toISOString() }),
          }),
        })
      } catch (error) {
        console.error("Error updating days:", error)
      }
    }
    setEditingDaysInfo(null)
  }

  const handleAddSubject = async () => {
    if (!newSubjectName.trim()) return
    const name = newSubjectName.trim()
    const pdfCount = newPdfCount

    const newTables = tables.map((table) => ({
      ...table,
      tasks: [
        ...table.tasks,
        {
          id: crypto.randomUUID(),
          text: name,
          numerator: 0,
          denominator: pdfCount,
          nextDate: null,
        },
      ],
    }))

    setTables(newTables)
    setShowAddForm(false)
    setNewSubjectName("")
    setNewPdfCount(1)

    try {
      await fetch("/api/subjects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, pdf_count: pdfCount }),
      })

      await fetch("/api/progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subjectName: name,
          tableType: "theory",
          totalPdfs: pdfCount,
        }),
      })

      await fetch("/api/progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subjectName: name,
          tableType: "practice",
          totalPdfs: pdfCount,
        }),
      })
    } catch (error) {
      console.error("Error adding subject:", error)
    }
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

  return (
    <div className="min-h-screen bg-background p-6 relative">
      <div className="fixed top-6 right-6 z-30 flex gap-4">
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
        <Button
          onClick={() => setShowAddForm(true)}
          className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
          size="lg"
        >
          <Settings className="h-6 w-6 text-white" />
        </Button>
      </div>
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
          <div className="bg-card p-6 rounded-lg space-y-4 w-80">
            <h2 className="text-lg font-bold">Agregar fila</h2>
            <Input
              placeholder="Nombre"
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              className="bg-white/80"
            />
            <Input
              type="number"
              min="1"
              value={newPdfCount}
              onChange={(e) => setNewPdfCount(Number.parseInt(e.target.value) || 1)}
              className="bg-white/80"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddSubject}>Agregar</Button>
            </div>
          </div>
        </div>
      )}

      {editingDaysInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
          <div className="bg-card p-6 rounded-lg space-y-4 w-80">
            <h2 className="text-lg font-bold">Editar días restantes</h2>
            <Input
              type="number"
              min="0"
              max="7"
              value={newDays}
              onChange={(e) => setNewDays(Number.parseInt(e.target.value) || 0)}
              className="bg-white/80"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingDaysInfo(null)}>
                Cancelar
              </Button>
              <Button onClick={saveEditedDays}>Guardar</Button>
            </div>
          </div>
        </div>
      )}

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
            const daysRemaining = getDaysRemaining(task, currentTable.title as "Teoría" | "Práctica")
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
                  onClick={() => openEditDays(task)}
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

                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      value={task.numerator}
                      onChange={(e) => updateProgress(task.id, Number.parseInt(e.target.value) || 0, task.denominator)}
                      className="w-16 text-center bg-white/80 backdrop-blur-sm"
                      min="0"
                    />
                    <span className="text-muted-foreground font-medium">/</span>
                    <Input
                      type="number"
                      value={task.denominator}
                      onChange={(e) => updateProgress(task.id, task.numerator, Number.parseInt(e.target.value) || 1)}
                      className="w-16 text-center bg-white/80 backdrop-blur-sm"
                      min="1"
                    />
                  </div>

                  <div className="text-sm text-muted-foreground font-medium shrink-0 w-12 text-right">
                    {Math.round(getProgressPercentage(task.numerator, task.denominator))}%
                  </div>
                </div>
              </div>
            )
          })}
        </div>

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
