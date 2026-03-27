import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function SubscriptionPage() {
  const { user } = await getCurrentUser()
  if (!user) redirect("/login")

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suscripción</h1>
        <p className="text-sm text-muted-foreground">Gestiona tu plan y facturación</p>
      </div>
      <div className="rounded-xl border border-border/40 bg-muted/20 p-8 flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground text-center">Aquí se detallará el estado de tu suscripción</p>
      </div>
    </div>
  )
}
