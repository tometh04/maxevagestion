import { CalendarPageClient } from "@/components/calendar/calendar-page-client"

export default function CalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendario de Eventos</h1>
        <p className="text-muted-foreground">
          Vista centralizada de todos los eventos importantes
        </p>
      </div>

      <CalendarPageClient />
    </div>
  )
}

