import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { canAccessModule, isIndependentAdvisor } from "@/lib/permissions"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"
import { HotelBookingsPageClient } from "@/components/operations/hotel-bookings-page-client"

export default async function HotelBookingsPage() {
  const { user } = await getCurrentUser()

  if (!canAccessModule(user.role as any, "operations")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reservas por hotel</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  const supabase = await createServerClient()

  // Selectores opcionales (agencia / vendedor). El scope real lo aplica la API;
  // acá solo poblamos las listas para acotar la vista.
  const agencies = await getScopedAgenciesForUser(supabase, user as any)

  let sellers: Array<{ id: string; name: string }> = []
  if (isIndependentAdvisor(user)) {
    // El asesor independiente solo ve lo suyo: no le mostramos el equipo.
    sellers = []
  } else {
    const { data } = await supabase
      .from("users")
      .select("id, name")
      .eq("org_id", (user as any).org_id)
      .eq("is_active", true)
      .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN", "ORG_OWNER", "POST_VENTA"])
      .order("name")
    sellers = (data || []).map((u: any) => ({ id: u.id, name: u.name || "Sin nombre" }))
  }

  return <HotelBookingsPageClient agencies={agencies} sellers={sellers} />
}
