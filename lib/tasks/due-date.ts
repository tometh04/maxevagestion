import { isSameDay, startOfDay } from "date-fns"

export const DEFAULT_TASK_ALERT_TIME = "09:00"
export const DEFAULT_TASK_REMINDER_MINUTES = 30

export interface TaskDueDateLike {
  due_date?: string | null
  reminder_minutes?: number | string | null
}

export function extractTaskDatePart(dueDate?: string | null): string {
  if (!dueDate) return ""
  return dueDate.split("T")[0]
}

export function parseTaskLocalDate(dueDate: string): Date {
  const [year, month, day] = extractTaskDatePart(dueDate).split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function normalizeReminderMinutes(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null

  return Math.trunc(parsed)
}

export function taskHasReminder(task: TaskDueDateLike): boolean {
  return Boolean(task.due_date && normalizeReminderMinutes(task.reminder_minutes) !== null)
}

export function taskHasTimedAlert(task: TaskDueDateLike): boolean {
  return taskHasReminder(task) && dueDateHasStoredTime(task.due_date)
}

export function dueDateSupportsReminder(dueDate?: string | null): boolean {
  return Boolean(dueDate && dueDate.includes("T"))
}

export function dueDateHasStoredTime(dueDate?: string | null): boolean {
  if (!dueDate) return false

  const match = dueDate.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return false

  const [, hours, minutes, seconds = "00"] = match
  return hours !== "00" || minutes !== "00" || seconds !== "00"
}

export function getTaskAlertTimeValue(dueDate?: string | null): string {
  if (!dueDateHasStoredTime(dueDate)) {
    return DEFAULT_TASK_ALERT_TIME
  }

  const parsed = new Date(dueDate as string)
  if (Number.isNaN(parsed.getTime())) {
    return DEFAULT_TASK_ALERT_TIME
  }

  const hours = String(parsed.getHours()).padStart(2, "0")
  const minutes = String(parsed.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

export function buildTaskDueDateValue(
  dueDate?: string | null,
  hasAlert = false,
  dueTime?: string | null
): string | null {
  const datePart = extractTaskDatePart(dueDate)
  if (!datePart) return null

  if (!hasAlert) {
    return datePart
  }

  const [year, month, day] = datePart.split("-").map(Number)
  const [hours, minutes] = (dueTime || DEFAULT_TASK_ALERT_TIME).split(":").map(Number)

  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString()
}

export function getTaskDueDateMoment(task: TaskDueDateLike): Date | null {
  if (!task.due_date) return null

  if (taskHasTimedAlert(task)) {
    const parsed = new Date(task.due_date)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  return parseTaskLocalDate(task.due_date)
}

export function isTaskDueToday(task: TaskDueDateLike, now = new Date()): boolean {
  const dueDate = getTaskDueDateMoment(task)
  if (!dueDate) return false

  return isSameDay(dueDate, now)
}

export function isTaskOverdue(task: TaskDueDateLike, now = new Date()): boolean {
  const dueDate = getTaskDueDateMoment(task)
  if (!dueDate) return false

  if (taskHasTimedAlert(task)) {
    return dueDate.getTime() < now.getTime()
  }

  return dueDate.getTime() < startOfDay(now).getTime()
}
