import { getCurrentUser, getUserAgencies } from "@/lib/auth"
import { TaskList } from "@/components/tasks/task-list"

export default async function TasksPage() {
  const { user } = await getCurrentUser()
  const userAgencies = await getUserAgencies(user.id)
  const agencyId = userAgencies[0]?.agency_id || ""

  return (
    <TaskList
      currentUserId={user.id}
      agencyId={agencyId}
      userRole={user.role}
      showAssignedFilter={user.role === "SUPER_ADMIN" || user.role === "ADMIN"}
    />
  )
}
