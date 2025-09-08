import { NextResponse } from "next/server"
import { getProgress, updateProgress } from "@/lib/database"

export async function GET() {
  try {
    const progress = await getProgress()
    const today = new Date()

    const updatedProgress = await Promise.all(
      progress.map(async (task) => {
        const lastUpdate = new Date(task.updated_at)
        const diffTime = today.getTime() - lastUpdate.getTime()
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

        if (diffDays > 0) {
          const newProgress = task.current_progress + diffDays
          await updateProgress(
            task.subject_name,
            task.table_type,
            newProgress,
            task.total_pdfs,
          )
          return { ...task, current_progress: newProgress }
        }

        return task
      }),
    )

    return NextResponse.json(updatedProgress)
  } catch (error) {
    console.error("Error fetching progress:", error)
    return NextResponse.json({ error: "Failed to fetch progress" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const { subjectName, tableType, currentProgress, totalPdfs } = await request.json()
    await updateProgress(subjectName, tableType, currentProgress, totalPdfs)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating progress:", error)
    return NextResponse.json({ error: "Failed to update progress" }, { status: 500 })
  }
}
