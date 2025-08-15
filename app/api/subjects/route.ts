import { NextResponse } from "next/server"
import { getSubjects, updateSubject } from "@/lib/database"

export async function GET() {
  try {
    const subjects = await getSubjects()
    return NextResponse.json(subjects)
  } catch (error) {
    console.error("Error fetching subjects:", error)
    return NextResponse.json({ error: "Failed to fetch subjects" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const { name, ...data } = await request.json()
    await updateSubject(name, data)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating subject:", error)
    return NextResponse.json({ error: "Failed to update subject" }, { status: 500 })
  }
}
