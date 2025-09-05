import { NextResponse } from "next/server"
import {
  getImportantTasks,
  createImportantTask,
  updateImportantTask,
  deleteImportantTask,
} from "@/lib/database"

export async function GET() {
  try {
    const tasks = await getImportantTasks()
    return NextResponse.json(tasks)
  } catch (error) {
    console.error("Error fetching important tasks:", error)
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    await createImportantTask(data)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error creating important task:", error)
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const { id, ...data } = await request.json()
    await updateImportantTask(id, data)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating important task:", error)
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()
    await deleteImportantTask(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting important task:", error)
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
