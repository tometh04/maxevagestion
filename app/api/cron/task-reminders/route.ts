import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { sendPushToUser } from "@/lib/push"

export async function POST(request: Request) {
  const startedAt = new Date()
  console.log(`[task-reminders cron] STARTED at ${startedAt.toISOString()}`)

  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      console.warn(`[task-reminders cron] UNAUTHORIZED — missing/invalid Bearer token`)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createServerClient()
    const now = new Date()

    // Buscar tareas que necesitan recordatorio:
    // - Tienen due_date y reminder_minutes
    // - reminder_sent es false
    // - due_date - reminder_minutes <= ahora
    // - status no es DONE
    const { data: tasks, error } = await (supabase as any)
      .from("tasks")
      .select("id, title, due_date, reminder_minutes, assigned_to, operation_id, customer_id, agency_id, status")
      .eq("reminder_sent", false)
      .neq("status", "DONE")
      .not("due_date", "is", null)
      .not("reminder_minutes", "is", null)

    if (error) {
      console.error(`[task-reminders cron] FAILED to fetch tasks:`, error)
      return NextResponse.json({ error: "Error", detail: error.message }, { status: 500 })
    }

    const candidateTasks = tasks || []
    console.log(`[task-reminders cron] candidates=${candidateTasks.length} (tareas con reminder pendiente)`)

    let created = 0
    let pushSent = 0
    let pushFailed = 0
    let alertErrors = 0
    const skippedFutureCount = candidateTasks.length // se decrementa por cada uno disparado

    for (const task of candidateTasks) {
      const dueDate = new Date(task.due_date)
      const reminderTime = new Date(dueDate.getTime() - task.reminder_minutes * 60 * 1000)

      if (reminderTime <= now) {
        // Crear alerta con tipo TASK_REMINDER
        const { error: alertError } = await (supabase as any)
          .from("alerts")
          .insert({
            user_id: task.assigned_to,
            operation_id: task.operation_id || null,
            customer_id: task.customer_id || null,
            type: "TASK_REMINDER",
            description: `Recordatorio: ${task.title}`,
            date_due: task.due_date,
            status: "PENDING",
            priority: "MEDIUM",
            metadata: { task_id: task.id },
          })

        if (!alertError) {
          // Marcar recordatorio como enviado
          await (supabase as any)
            .from("tasks")
            .update({ reminder_sent: true })
            .eq("id", task.id)
          created++
          console.log(
            `[task-reminders cron] FIRED task=${task.id} title="${task.title}" due_date=${task.due_date} reminder_minutes=${task.reminder_minutes}`
          )

          // Enviar push notification al usuario asignado
          if (task.assigned_to) {
            try {
              await sendPushToUser(supabase, task.assigned_to, {
                title: "📋 Recordatorio de Tarea",
                body: task.title,
                url: "/tools/tasks",
              })
              pushSent++
            } catch (pushError) {
              pushFailed++
              console.error(`[task-reminders cron] PUSH FAILED for task=${task.id}:`, pushError)
            }
          }
        } else {
          alertErrors++
          console.error(`[task-reminders cron] ALERT INSERT FAILED for task=${task.id}:`, alertError)
        }
      }
    }

    const skipped = candidateTasks.length - created - alertErrors
    const elapsedMs = Date.now() - startedAt.getTime()
    console.log(
      `[task-reminders cron] DONE in ${elapsedMs}ms — fired=${created} alertErrors=${alertErrors} pushSent=${pushSent} pushFailed=${pushFailed} skippedFuture=${skipped}`
    )

    return NextResponse.json({
      success: true,
      remindersCreated: created,
      tasksChecked: candidateTasks.length,
      pushSent,
      pushFailed,
      alertErrors,
      skippedFuture: skipped,
      elapsedMs,
      timestamp: now.toISOString(),
    })
  } catch (error: any) {
    console.error(`[task-reminders cron] FATAL:`, error)
    return NextResponse.json({ error: "Error", detail: error?.message }, { status: 500 })
  }
}
