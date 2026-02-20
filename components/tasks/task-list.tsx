"use client"

import { TaskWeekView } from "./task-week-view"

interface TaskListProps {
  currentUserId: string
  agencyId: string
  userRole: string
  showAssignedFilter?: boolean
}

export function TaskList({
  currentUserId,
  agencyId,
  userRole,
  showAssignedFilter = false,
}: TaskListProps) {
  return (
    <TaskWeekView
      currentUserId={currentUserId}
      agencyId={agencyId}
      userRole={userRole}
      showAssignedFilter={showAssignedFilter}
    />
  )
}
