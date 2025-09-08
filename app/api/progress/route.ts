import { NextResponse } from "next/server"
import { getProgress, updateProgress } from "@/lib/database"

export async function GET() {
  try {
    const progress = await getProgress()
    const today = new Date()

    const updatedProgress = await Promise.all(
      progress.map(async (p) => {
        const lastUpdate = new Date(p.updated_at)
        const diffTime = today.getTime() - lastUpdate.getTime()
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

        if (diffDays > 0) {
          const newProgress = Math.min(
            p.current_progress + diffDays,
            p.total_pdfs,
          )
          await updateProgress(
            p.subject_name,
            p.table_type,
            newProgress,
            p.total_pdfs,
          )
          return { ...p, current_progress: newProgress }
        }

        return p
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
