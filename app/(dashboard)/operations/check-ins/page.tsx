import { CheckInsPageClient } from "@/components/operations/check-ins-page-client"

export default function CheckInsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Salidas y regresos</h1>
        <p className="text-muted-foreground">
          Agenda de check-ins: todas las salidas y regresos confirmados, agrupados por día
        </p>
      </div>

      <CheckInsPageClient />
    </div>
  )
}
