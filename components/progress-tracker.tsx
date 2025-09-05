"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, Flame, Sun, TreePine, Trash } from "lucide-react"

interface TaskItem {
  id: string
  text: string
  numerator: number
  denominator: number
  daysRemaining?: number
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
    {
      title: "IMPORTANTES",
      tasks: [],
    },
  ])

  const loadProgressFromDatabase = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/progress")
      if (response.ok) {
        const progressData = await response.json()

        // Actualizar las tablas con el progreso guardado
        const updatedTables = tables.map((table) => ({
          ...table,
          tasks: table.tasks.map((task) => {
            const tableType = table.title === "Teoría" ? "theory" : "practice"
            const savedProgress = progressData.find(
              (p: any) => p.subject_name === task.text && p.table_type === tableType,
            )

            if (savedProgress) {
              return {
                ...task,
                numerator: savedProgress.current_progress,
                denominator: savedProgress.total_pdfs,
              }
            }
            return task
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

  const loadImportantTasksFromDatabase = async () => {
    try {
      const response = await fetch("/api/important-tasks")
      if (response.ok) {
        const data = await response.json()
        setTables((prev) => {
          const newTables = [...prev]
          const index = newTables.findIndex((t) => t.title === "IMPORTANTES")
          if (index !== -1) {
            newTables[index] = {
              ...newTables[index],
              tasks: data.map((t: any) => ({
                id: String(t.id),
                text: t.name,
                numerator: t.current_progress,
                denominator: t.total_items,
                daysRemaining: t.days_remaining,
              })),
            }
          }
          return newTables
        })
      }
    } catch (error) {
      console.error("Error loading important tasks:", error)
    }
  }

  const saveImportantTaskToDatabase = async (task: TaskItem) => {
    try {
      await fetch("/api/important-tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: Number(task.id),
          name: task.text,
          current_progress: task.numerator,
          total_items: task.denominator,
          days_remaining: task.daysRemaining ?? 0,
        }),
      })
    } catch (error) {
      console.error("Error saving important task:", error)
    }
  }

  const addImportantTask = async () => {
    try {
      const response = await fetch("/api/important-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Nueva tarea" }),
      })
      if (response.ok) {
        const newTask = await response.json()
        setTables((prev) => {
          const newTables = [...prev]
          const index = newTables.findIndex((t) => t.title === "IMPORTANTES")
          if (index !== -1) {
            newTables[index].tasks.push({
              id: String(newTask.id),
              text: newTask.name,
              numerator: newTask.current_progress,
              denominator: newTask.total_items,
              daysRemaining: newTask.days_remaining,
            })
          }
          return newTables
        })
      }
    } catch (error) {
      console.error("Error adding task:", error)
    }
  }

  const deleteImportantTask = async (id: string) => {
    try {
      await fetch("/api/important-tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(id) }),
      })
      setTables((prev) => {
        const newTables = [...prev]
        const index = newTables.findIndex((t) => t.title === "IMPORTANTES")
        if (index !== -1) {
          newTables[index].tasks = newTables[index].tasks.filter((task) => task.id !== id)
        }
        return newTables
      })
    } catch (error) {
      console.error("Error deleting task:", error)
    }
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
    loadImportantTasksFromDatabase()
  }, [])

  const currentTable = tables[currentTableIndex]

  const saveTask = (id: string) => {
    const newTables = [...tables]
    newTables[currentTableIndex].tasks = newTables[currentTableIndex].tasks.map((task) =>
      task.id === id ? { ...task, text: editText } : task,
    )
    setTables(newTables)
    const savedTask = newTables[currentTableIndex].tasks.find((t) => t.id === id)
    if (currentTable.title === "IMPORTANTES" && savedTask) {
      void saveImportantTaskToDatabase(savedTask)
    }
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

      if (currentTable.title === "IMPORTANTES") {
        await saveImportantTaskToDatabase(newTables[currentTableIndex].tasks[taskIndex])
      } else {
        await saveProgressToDatabase(task.text, currentTable.title as "Teoría" | "Práctica", numerator, denominator)
      }
    }
  }

  const saveDays = async (id: string) => {
    const newTables = [...tables]
    const taskIndex = newTables[currentTableIndex].tasks.findIndex((task) => task.id === id)
    if (taskIndex !== -1) {
      const task = newTables[currentTableIndex].tasks[taskIndex]
      const updated = { ...task, daysRemaining: Number.parseInt(editDaysValue) || 0 }
      newTables[currentTableIndex].tasks[taskIndex] = updated
      setTables(newTables)
      await saveImportantTaskToDatabase(updated)
    }
    setEditingDaysId(null)
    setEditDaysValue("")
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
      <div className="fixed top-6 left-6 z-30">
        <Button
          onClick={() =>
            setCurrentTableIndex(tables.findIndex((t) => t.title === "IMPORTANTES"))
          }
          className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
          size="lg"
        >
          <div className="flex flex-col items-center">
            <span className="text-xs text-white font-bold">Imp</span>
          </div>
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
              currentTable.title === "IMPORTANTES"
                ? task.daysRemaining ?? 0
                : calculateDaysRemaining(task.text, currentTable.title as "Teoría" | "Práctica")
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
                >
                  {currentTable.title === "IMPORTANTES" && editingDaysId === task.id ? (
                    <Input
                      type="number"
                      value={editDaysValue}
                      onChange={(e) => setEditDaysValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          void saveDays(task.id)
                        }
                      }}
                      onBlur={() => void saveDays(task.id)}
                      className="w-12 h-4 text-black text-xs"
                      min="0"
                    />
                  ) : (
                    <div
                      className="flex items-center gap-1 cursor-pointer"
                      onClick={() => {
                        if (currentTable.title === "IMPORTANTES") {
                          setEditingDaysId(task.id)
                          setEditDaysValue(String(task.daysRemaining ?? 0))
                        }
                      }}
                    >
                      <IconComponent className={`h-3 w-3 ${iconColor}`} />
                      <span>{daysRemaining}d</span>
                    </div>
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
                  {currentTable.title === "IMPORTANTES" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteImportantTask(task.id)}
                      className="shrink-0"
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  )}
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
        {currentTable.title === "IMPORTANTES" && (
          <div className="flex justify-center mt-6">
            <Button onClick={addImportantTask}>Agregar</Button>
          </div>
        )}
      </div>
    </div>
  )
}
