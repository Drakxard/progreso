import { NextResponse } from "next/server"
import {
  getImportantTasks,
  createImportantTask,
  updateImportantTask,
  deleteImportantTask,
} from "@/lib/database"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const tasks = await getImportantTasks()
    const today = new Date()

    const updatedTasks = await Promise.all(
      tasks.map(async (task) => {
        const lastUpdate = new Date(task.updated_at)
        const diffTime = today.getTime() - lastUpdate.getTime()
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

        if (diffDays > 0) {
          const newDaysRemaining = Math.max(task.days_remaining - diffDays, 0)
          const newNumerator = Math.min(
            task.denominator,
            task.denominator - newDaysRemaining,
          )
          const updated = await updateImportantTask(task.id, {
            days_remaining: newDaysRemaining,
            numerator: newNumerator,
          })
          return (
            updated ?? {
              ...task,
              days_remaining: newDaysRemaining,
              numerator: newNumerator,
            }
          )
        }

        return task
      }),
    )

    return NextResponse.json(updatedTasks)
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
    const { id, ...data } = await request.json()
    const task = await updateImportantTask(id, data)
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
