import { NextResponse } from "next/server"
import {
  getImportantTasks,
  createImportantTask,
  updateImportantTask,
  deleteImportantTask,
} from "@/lib/database"
import type { ImportantTask } from "@/lib/database"

export const dynamic = "force-dynamic"

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
    const task = await createImportantTask(data)
    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    console.error("Error creating important task:", error)
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown> | null
    const data = { ...(payload ?? {}) } as Record<string, unknown>
    const rawId = (data as { id?: unknown }).id
    delete (data as { id?: unknown }).id

    const numericId = Number(rawId)

    if (!Number.isFinite(numericId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const task = await updateImportantTask(numericId, data as Partial<ImportantTask>)
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    return NextResponse.json(task)
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
