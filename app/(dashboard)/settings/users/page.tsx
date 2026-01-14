import { redirect } from "next/navigation"

/**
 * Ruta /settings/users
 * Redirige a /settings con el tab de usuarios activo
 * Esto mantiene compatibilidad con links del sidebar que apuntan a /settings/users
 */
export default function SettingsUsersPage() {
  redirect("/settings?tab=users")
}
