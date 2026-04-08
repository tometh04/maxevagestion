process.env.TZ = "America/Argentina/Buenos_Aires"

import {
  buildTaskDueDateValue,
  dueDateHasStoredTime,
  dueDateSupportsReminder,
  extractTaskDatePart,
  getTaskAlertTimeValue,
  isTaskDueToday,
  isTaskOverdue,
  taskHasReminder,
  taskHasTimedAlert,
} from "@/lib/tasks/due-date"

describe("task due date helpers", () => {
  it("detects legacy all-day timestamps as no explicit stored time", () => {
    expect(dueDateHasStoredTime("2026-04-09")).toBe(false)
    expect(dueDateHasStoredTime("2026-04-09T00:00:00+00:00")).toBe(false)
    expect(dueDateHasStoredTime("2026-04-09T03:00:00.000Z")).toBe(true)
  })

  it("builds date-only values when alert is disabled", () => {
    expect(buildTaskDueDateValue("2026-04-09", false, "")).toBe("2026-04-09")
  })

  it("roundtrips alert date and time values", () => {
    const dueDate = buildTaskDueDateValue("2026-04-09", true, "09:30")

    expect(dueDate).toContain("T")
    expect(extractTaskDatePart(dueDate)).toBe("2026-04-09")
    expect(getTaskAlertTimeValue(dueDate)).toBe("09:30")
  })

  it("defaults legacy reminder tasks to 09:00 when editing", () => {
    expect(getTaskAlertTimeValue("2026-04-09T00:00:00+00:00")).toBe("09:00")
  })

  it("treats timed tasks with reminders differently from all-day tasks", () => {
    const now = new Date("2026-04-09T13:00:00.000Z")
    const timedTask = {
      due_date: buildTaskDueDateValue("2026-04-09", true, "09:00"),
      reminder_minutes: 30,
    }
    const allDayTask = {
      due_date: "2026-04-09",
      reminder_minutes: null,
    }
    const legacyReminderTask = {
      due_date: "2026-04-09T00:00:00+00:00",
      reminder_minutes: 30,
    }

    expect(taskHasReminder(timedTask)).toBe(true)
    expect(taskHasTimedAlert(timedTask)).toBe(true)
    expect(dueDateSupportsReminder(timedTask.due_date)).toBe(true)
    expect(isTaskDueToday(timedTask, now)).toBe(true)
    expect(isTaskOverdue(timedTask, now)).toBe(true)

    expect(taskHasReminder(allDayTask)).toBe(false)
    expect(taskHasTimedAlert(allDayTask)).toBe(false)
    expect(dueDateSupportsReminder(allDayTask.due_date)).toBe(false)
    expect(isTaskDueToday(allDayTask, now)).toBe(true)
    expect(isTaskOverdue(allDayTask, now)).toBe(false)

    expect(taskHasReminder(legacyReminderTask)).toBe(true)
    expect(taskHasTimedAlert(legacyReminderTask)).toBe(false)
    expect(isTaskDueToday(legacyReminderTask, now)).toBe(true)
    expect(isTaskOverdue(legacyReminderTask, now)).toBe(false)
  })
})
