"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import ProgressTracker from "@/components/progress-tracker"

type Category = "Álgebra" | "Cálculo" | "Poo"
type TableType = "Teoría" | "Práctica"

interface CategoryData {
  name: Category
  count: number
  theoryDate?: string
  practiceDate?: string
}

// Normaliza el nombre de la materia a una clave estable
function canonicalSubject(name: string): "algebra" | "calculo" | "poo" | string {
  const s = (name || "").toLowerCase()
  const noAccent = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  if (noAccent.includes("poo")) return "poo"
  if (noAccent.includes("alge") || noAccent.endsWith("lgebra") || s.includes("lg")) return "algebra"
  if (noAccent.includes("calcu") || noAccent.endsWith("lculo") || noAccent.includes("culo")) return "calculo"
  return s
}

const FIXED_SCHEDULE = {
  Álgebra: {
    theory: 4, // Jueves
    practice: 1, // Lunes
  },
  Cálculo: {
    theory: 4, // Jueves
    practice: 1, // Lunes
  },
  Poo: {
    theory: 2, // Martes
    practice: 5, // Viernes
  },
}

const DAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
]

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

const formatSpanishDate = (date: Date) => {
  const dayName = DAY_NAMES[date.getDay()]
  const dayNumber = date.getDate()
  const month = MONTH_NAMES[date.getMonth()]
  return `${dayName} ${dayNumber} de ${month}`
}

const formatDateForStorage = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const normalizeDate = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const formatDateLabel = (value?: string) => {
  if (!value) return undefined

  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/)
  if (isoMatch) {
    const [year, month, day] = isoMatch[1].split("-").map(Number)
    const date = new Date(year, month - 1, day)
    const today = normalizeDate(new Date())
    const diffMs = normalizeDate(date).getTime() - today.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays >= 0 && diffDays <= 7) {
      return `${diffDays}d`
    }

    return formatSpanishDate(date)
  }

  return value
}

const prepareDateForSaving = (value?: string) => {
  if (!value) return null
  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/)
  if (isoMatch) {
    return isoMatch[1]
  }
  if (/^\d+d$/.test(value)) {
    const days = Number.parseInt(value.slice(0, -1), 10)
    if (!Number.isNaN(days)) {
      const date = new Date()
      date.setDate(date.getDate() + days)
      return formatDateForStorage(date)
    }
  }
  return null
}

export default function PDFManager() {
  const [showConfigForm, setShowConfigForm] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [currentTable, setCurrentTable] = useState<TableType>("Teoría")
  const [inputValue, setInputValue] = useState("")
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [isCalendarMode, setIsCalendarMode] = useState(false)
  const [showProgressTracker, setShowProgressTracker] = useState(true)
  const [categories, setCategories] = useState<CategoryData[]>([
    { name: "Álgebra", count: 5 },
    { name: "Cálculo", count: 8 },
    { name: "Poo", count: 6 },
  ])
  const [isLoading, setIsLoading] = useState(true)

  const inputRef = useRef<HTMLInputElement>(null)

  const subjects = ["Álgebra", "Cálculo", "Poo"] as const
  const isComplete = currentStep >= subjects.length

  const loadDataFromDatabase = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/subjects", { cache: "no-store" })
      if (response.ok) {
        const subjects = await response.json()

        const loadedCategories: CategoryData[] = [
          { name: "Álgebra", count: 5 },
          { name: "Cálculo", count: 8 },
          { name: "Poo", count: 6 },
        ]

        subjects.forEach((subject: any) => {
          const categoryIndex = loadedCategories.findIndex(
            (cat) => canonicalSubject(cat.name) === canonicalSubject(subject.name),
          )
          if (categoryIndex !== -1) {
            const existing = loadedCategories[categoryIndex]
            loadedCategories[categoryIndex] = {
              name: existing.name,
              count: subject.pdf_count,
              theoryDate: subject.theory_date || undefined,
              practiceDate: subject.practice_date || undefined,
            }
          }
        })

        setCategories(loadedCategories)
      }
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const saveDataToDatabase = async (updatedCategories: CategoryData[]) => {
    try {
      for (const category of updatedCategories) {
        const response = await fetch("/api/subjects", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: category.name,
            pdf_count: category.count,
            theory_date: prepareDateForSaving(category.theoryDate),
            practice_date: prepareDateForSaving(category.practiceDate),
          }),
        })
        if (!response.ok) {
          throw new Error(`Failed to save subject ${category.name}`)
        }
      }
    } catch (error) {
      console.error("Error saving data:", error)
    }
  }

  const calculateDaysRemaining = (targetDay: number): number => {
    const today = new Date()
    const currentDay = today.getDay()

    let daysUntil = targetDay - currentDay
    if (daysUntil <= 0) {
      daysUntil += 7
    }

    return daysUntil
  }

  const generateFixedDates = () => {
    setCategories((prevCategories) => {
      const today = new Date()
      const todayNormalized = normalizeDate(today)

      return prevCategories.map((category) => {
        const schedule = FIXED_SCHEDULE[category.name as keyof typeof FIXED_SCHEDULE]
        if (!schedule) return category
        const ensureFutureDate = (existing: string | undefined, daysUntil: number) => {
          const baseDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
          baseDate.setDate(baseDate.getDate() + daysUntil)

          if (existing && /^\d{4}-\d{2}-\d{2}$/.test(existing)) {
            const [year, month, day] = existing.split("-").map(Number)
            const existingDate = new Date(year, month - 1, day)
            if (normalizeDate(existingDate) > todayNormalized) {
              return existing
            }
          }

          return formatDateForStorage(baseDate)
        }

        const theoryDays = calculateDaysRemaining(schedule.theory)
        const practiceDays = calculateDaysRemaining(schedule.practice)

        return {
          ...category,
          theoryDate: ensureFutureDate(category.theoryDate, theoryDays),
          practiceDate: ensureFutureDate(category.practiceDate, practiceDays),
        }
      })
    })
  }

  useEffect(() => {
    loadDataFromDatabase()
  }, [])

  useEffect(() => {
    if (!isLoading) {
      generateFixedDates()
      const interval = setInterval(generateFixedDates, 60000)
      return () => clearInterval(interval)
    }
  }, [isLoading, categories.length])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "g") {
        e.preventDefault()
        setShowConfigForm(true)
        setShowProgressTracker(false)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  const formatDate = (date: Date) => formatSpanishDate(date)

  const generateCalendarDays = () => {
    const today = new Date()
    const currentMonth = today.getMonth()
    const currentYear = today.getFullYear()
    const firstDay = new Date(currentYear, currentMonth, 1)
    const lastDay = new Date(currentYear, currentMonth + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days = []

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day)
    }

    return days
  }

  const handleDateSelect = (day: number) => {
    const today = new Date()
    const selectedDateObj = new Date(today.getFullYear(), today.getMonth(), day)
    const formattedDate = formatDate(selectedDateObj)
    setSelectedDate(formattedDate)

    const storageDate = formatDateForStorage(selectedDateObj)

    const updatedCategories = categories.map((cat) =>
      cat.name === subjects[currentStep]
        ? {
            ...cat,
            ...(currentTable === "Teoría"
              ? { theoryDate: storageDate }
              : { practiceDate: storageDate }),
          }
        : cat,
    )

    setCategories(updatedCategories)
    saveDataToDatabase(updatedCategories)
  }

  const handleAccept = async () => {
    if (inputValue && !isComplete) {
      const count = Number.parseInt(inputValue)
      if (!isNaN(count) && count >= 0) {
        const updatedCategories = categories.map((cat) =>
          cat.name === subjects[currentStep] ? { ...cat, count } : cat,
        )
        setCategories(updatedCategories)
        await saveDataToDatabase(updatedCategories)

        setInputValue("")
        setIsCalendarMode(true)
        setCurrentTable("Teoría")
      }
    }
  }

  const handleReset = async () => {
    const resetCategories = [
      { name: "Álgebra" as Category, count: 0 },
      { name: "Cálculo" as Category, count: 0 },
      { name: "Poo" as Category, count: 0 },
    ]

    setCurrentStep(0)
    setCurrentTable("Teoría")
    setInputValue("")
    setSelectedDate("")
    setIsCalendarMode(false)
    setCategories(resetCategories)

    await saveDataToDatabase(resetCategories)
  }

  const handleBackToTracker = () => {
    setShowConfigForm(false)
    setShowProgressTracker(true)
    generateFixedDates()
  }

  useEffect(() => {
    if (!isComplete && !isCalendarMode && inputRef.current && showConfigForm) {
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [currentStep, isComplete, isCalendarMode, showConfigForm])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && selectedDate && isCalendarMode && showConfigForm) {
        handleCalendarNext()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [selectedDate, isCalendarMode, currentTable, showConfigForm])

  const handleCalendarNext = () => {
    if (currentTable === "Teoría") {
      setCurrentTable("Práctica")
      setSelectedDate("")
    } else {
      setCurrentStep((prev) => prev + 1)
      setCurrentTable("Teoría")
      setSelectedDate("")
      setIsCalendarMode(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando datos...</p>
        </div>
      </div>
    )
  }

  if (showProgressTracker && !showConfigForm) {
    return <ProgressTracker initialData={categories} />
  }

  if (showConfigForm) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="mb-4 text-center">
            <Button onClick={handleBackToTracker} variant="outline" className="text-sm bg-transparent">
              ← Volver al Tracker
            </Button>
          </div>

          {!isComplete ? (
            <Card className="transition-all duration-500 ease-in-out transform">
              <CardContent className="p-8 text-center space-y-6">
                <div className="space-y-2">
                  <div className="text-sm text-gray-500 font-medium">
                    {currentStep + 1} / {subjects.length}
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">{subjects[currentStep]}</h2>
                  {isCalendarMode && <div className="text-lg font-medium text-blue-600">{currentTable}</div>}
                </div>

                {isCalendarMode ? (
                  <div className="space-y-4">
                    <div className="h-8 flex items-center justify-center">
                      {selectedDate && <div className="text-lg font-medium text-green-600">{selectedDate}</div>}
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                      <div className="grid grid-cols-7 gap-1 text-xs text-gray-500 font-medium">
                        {["D", "L", "M", "M", "J", "V", "S"].map((day) => (
                          <div key={day} className="text-center p-1">
                            {day}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {generateCalendarDays().map((day, index) => (
                          <button
                            key={index}
                            onClick={() => day && handleDateSelect(day)}
                            disabled={!day}
                            className={`
                              aspect-square text-sm rounded-md transition-colors
                              ${day ? "hover:bg-blue-100 hover:text-blue-600 text-gray-700" : "invisible"}
                            `}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="h-5 flex items-center justify-center">
                      {selectedDate && (
                        <div className="text-sm text-gray-500">
                          {currentTable === "Teoría" ? "Enter para Práctica" : "Enter para siguiente materia"}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Input
                      ref={inputRef}
                      type="number"
                      min="0"
                      placeholder="Cantidad"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleAccept()
                        }
                      }}
                      className="text-xl text-center py-3 border-2 focus:border-blue-500 transition-colors"
                    />

                    <Button
                      onClick={handleAccept}
                      disabled={!inputValue}
                      className="w-full py-3 text-lg bg-blue-600 hover:bg-blue-700 transition-all duration-200"
                    >
                      Cargar
                    </Button>
                  </div>
                )}

                <div className="flex justify-center space-x-2">
                  {subjects.map((_, index) => (
                    <div
                      key={index}
                      className={`w-2 h-2 rounded-full transition-all duration-300 ${
                        index < currentStep ? "bg-green-500" : index === currentStep ? "bg-blue-500" : "bg-gray-300"
                      }`}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="transition-all duration-500 ease-in-out transform">
              <CardContent className="p-8 space-y-6">
                <h2 className="text-xl font-bold text-center text-gray-900">Estado Actual</h2>

                <div className="space-y-3">
                  {categories.map((category) => {
                    const theoryLabel = formatDateLabel(category.theoryDate)
                    const practiceLabel = formatDateLabel(category.practiceDate)

                    return (
                      <div
                        key={category.name}
                        className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0"
                      >
                        <span className="font-medium text-gray-700">{category.name}</span>
                        <div className="text-right text-sm">
                          <div className="text-gray-600">
                            {category.count} pdf{category.count !== 1 ? "s" : ""}
                          </div>
                          {theoryLabel && <div className="text-blue-600">T: {theoryLabel}</div>}
                          {practiceLabel && <div className="text-green-600">P: {practiceLabel}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <Button
                  onClick={handleBackToTracker}
                  variant="outline"
                  className="w-full py-3 text-lg transition-all duration-200 bg-transparent flex items-center justify-center gap-2"
                >
                  Volver al Tracker
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    )
  }

  return null
}
