import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createServerClient()
    const now = new Date()

    // Find tasks that need reminders:
    // - Have due_date and reminder_minutes set
    // - reminder_sent is false
    // - due_date - reminder_minutes <= now
    // - status is not DONE
    const { data: tasks, error } = await (supabase
      .from("tasks" as any)
      .select("id, title, due_date, reminder_minutes, assigned_to, operation_id, agency_id")
      .eq("reminder_sent", false)
      .neq("status", "DONE")
      .not("due_date", "is", null)
      .not("reminder_minutes", "is", null)) as { data: any[] | null; error: any }

    if (error) {
      console.error("Error fetching tasks for reminders:", error)
      return NextResponse.json({ error: "Error" }, { status: 500 })
    }

    let created = 0

    for (const task of tasks || []) {
      const dueDate = new Date(task.due_date)
      const reminderTime = new Date(dueDate.getTime() - task.reminder_minutes * 60 * 1000)

      if (reminderTime <= now) {
        // Create alert
        const { error: alertError } = await (supabase.from("alerts") as any).insert({
          user_id: task.assigned_to,
          operation_id: task.operation_id || null,
          type: "GENERIC",
          description: `Recordatorio de tarea: ${task.title}`,
          date_due: task.due_date,
          status: "PENDING",
          priority: "INFO",
          metadata: { task_id: task.id, source: "task_reminder" },
        })

        if (!alertError) {
          // Mark reminder as sent
          await (supabase
            .from("tasks" as any) as any)
            .update({ reminder_sent: true })
            .eq("id", task.id)
          created++
        }
      }
    }

    return NextResponse.json({ success: true, remindersCreated: created })
  } catch (error) {
    console.error("Error in task reminders cron:", error)
    return NextResponse.json({ error: "Error" }, { status: 500 })
  }
}
