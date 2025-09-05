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
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json()
    const task = await createImportantTask(name)
    return NextResponse.json(task)
  } catch (error) {
    console.error("Error creating task:", error)
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const { id, ...data } = await request.json()
    await updateImportantTask(id, data)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating task:", error)
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()
    await deleteImportantTask(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting task:", error)
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 })
  }
}

