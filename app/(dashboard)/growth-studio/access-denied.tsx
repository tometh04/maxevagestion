import Link from "next/link"
import { LockKeyhole } from "lucide-react"
import { Button } from "@/components/ui/button"

export function GrowthStudioAccessDenied({
  reason = "growth_studio_plan_required",
}: {
  reason?: string
}) {
  const checkFailed = reason === "access_check_failed"
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center text-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <LockKeyhole className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">
        {checkFailed ? "No pudimos verificar el acceso" : "Acceso no disponible"}
      </h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {checkFailed
          ? "Ocurrió un problema temporal. Volvé a intentar en unos minutos."
          : "Growth Studio está incluido en el plan Enterprise. Tu información no se modifica y vuelve a estar disponible si la organización habilita el plan."}
      </p>
      {checkFailed ? (
        <Button asChild variant="outline" className="mt-6">
          <Link href="/growth-studio">Reintentar</Link>
        </Button>
      ) : (
        <Button asChild className="mt-6">
          <Link href="/settings/subscription">Ver suscripción</Link>
        </Button>
      )}
    </div>
  )
}
