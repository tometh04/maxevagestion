import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createServerClient()
    const now = new Date()

    // Buscar tareas que necesitan recordatorio:
    // - Tienen due_date y reminder_minutes
    // - reminder_sent es false
    // - due_date - reminder_minutes <= ahora
    // - status no es DONE
    const { data: tasks, error } = await (supabase
      .from("tasks" as any)
      .select("id, title, due_date, reminder_minutes, assigned_to, operation_id, customer_id, agency_id")
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
        // Crear alerta con tipo TASK_REMINDER para que sea identificable
        const { error: alertError } = await (supabase.from("alerts") as any).insert({
          user_id: task.assigned_to,
          agency_id: task.agency_id,
          operation_id: task.operation_id || null,
          customer_id: task.customer_id || null,
          type: "TASK_REMINDER",
          description: `Recordatorio: ${task.title}`,
          date_due: task.due_date,
          status: "PENDING",
          priority: "MEDIUM",
          metadata: { task_id: task.id, source: "task_reminder" },
        })

        if (!alertError) {
          // Marcar recordatorio como enviado
          await (supabase
            .from("tasks" as any) as any)
            .update({ reminder_sent: true })
            .eq("id", task.id)
          created++
        } else {
          console.error("Error creating alert for task:", task.id, alertError)
        }
      }
    }

    return NextResponse.json({
      success: true,
      remindersCreated: created,
      tasksChecked: tasks?.length || 0,
      timestamp: now.toISOString(),
    })
  } catch (error) {
    console.error("Error in task reminders cron:", error)
    return NextResponse.json({ error: "Error" }, { status: 500 })
  }
}
