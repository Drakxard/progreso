import { NextResponse } from "next/server"
import { getProgress, updateProgress, createProgress } from "@/lib/database"

export async function GET() {
  try {
    const progress = await getProgress()
    return NextResponse.json(progress)
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

export async function POST(request: Request) {
  try {
    const { subjectName, tableType, totalPdfs } = await request.json()
    await createProgress(subjectName, tableType, totalPdfs)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error creating progress:", error)
    return NextResponse.json({ error: "Failed to create progress" }, { status: 500 })
  }
}
