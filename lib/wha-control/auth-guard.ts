import { getCurrentUser } from "@/lib/auth"
import { NextResponse } from "next/server"

const ALLOWED_ROLES = ["SUPER_ADMIN", "ADMIN"]

/**
 * Validate that the current user is authorized for WHA Control.
 * Returns the user if authorized, or a 403 response.
 */
export async function whaControlAuthGuard() {
  const { user } = await getCurrentUser()

  if (!ALLOWED_ROLES.includes(user.role)) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 403 }),
      user: null,
    }
  }

  return { authorized: true as const, response: null, user }
}
