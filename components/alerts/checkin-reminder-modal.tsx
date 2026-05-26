"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { LogIn, Plane } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface PendingCheckinAlert {
  id: string
  description: string
  date_due: string
  operations: {
    id: string
    destination: string
    departure_date: string
    airline_name: string | null
  } | null
}

const RESOLUTION_OPTIONS = [
  "Check-in realizado correctamente",
  "Aerolínea requiere check-in 24hs antes — se realizará el día previo",
  "Check-in se realiza en aeropuerto (solo equipaje de mano)",
  "No aplica — el viaje no incluye vuelo",
]

export function CheckinReminderModal() {
  const [alerts, setAlerts] = useState<PendingCheckinAlert[]>([])
  const [index, setIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [customNote, setCustomNote] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/alerts/checkin-pending")
      .then((r) => r.json())
      .then((data) => setAlerts(data.alerts ?? []))
      .catch(() => {})
  }, [])

  const current = alerts[index] ?? null
  const total = alerts.length
  const isOpen = !!current

  async function handleConfirm() {
    if (!current) return
    const note = selectedOption === "custom" ? customNote.trim() : (selectedOption ?? "")
    if (!note) return

    setSaving(true)
    try {
      await fetch("/api/alerts/mark-done", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId: current.id, resolution_note: note }),
      })
      // Avanzar al siguiente o cerrar
      if (index + 1 < total) {
        setIndex((i) => i + 1)
        setSelectedOption(null)
        setCustomNote("")
      } else {
        setAlerts([])
      }
    } catch {
      // no-op, mantener modal abierto
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const departure = current.operations?.departure_date
    ? format(new Date(current.operations.departure_date), "EEEE d 'de' MMMM", { locale: es })
    : null

  return (
    <Dialog open modal>
      <DialogContent
        className="max-w-lg"
        // Deshabilitar cierre por click afuera o Escape
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        // Ocultar el X nativo de DialogContent
        hideCloseButton
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <LogIn className="h-5 w-5 text-primary" />
              Check-in pendiente
            </DialogTitle>
            {total > 1 && (
              <span className="text-xs text-muted-foreground font-medium">
                {index + 1} de {total}
              </span>
            )}
          </div>
        </DialogHeader>

        {/* Info del vuelo */}
        <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 flex items-start gap-3">
          <Plane className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-semibold text-sm">
              {current.operations?.destination ?? "Destino desconocido"}
            </p>
            {departure && (
              <p className="text-xs text-muted-foreground capitalize">{departure}</p>
            )}
            {current.operations?.airline_name && (
              <p className="text-xs text-muted-foreground">
                {current.operations.airline_name}
              </p>
            )}
          </div>
        </div>

        {/* Opciones */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">¿Qué pasó con el check-in?</p>

          {RESOLUTION_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => setSelectedOption(option)}
              className={`w-full text-left text-sm px-4 py-3 rounded-lg border transition-colors ${
                selectedOption === option
                  ? "border-primary bg-primary/5 text-primary font-medium"
                  : "border-border hover:border-primary/50 hover:bg-muted/50"
              }`}
            >
              {option}
            </button>
          ))}

          <button
            onClick={() => setSelectedOption("custom")}
            className={`w-full text-left text-sm px-4 py-3 rounded-lg border transition-colors ${
              selectedOption === "custom"
                ? "border-primary bg-primary/5 text-primary font-medium"
                : "border-border hover:border-primary/50 hover:bg-muted/50"
            }`}
          >
            Otra nota...
          </button>

          {selectedOption === "custom" && (
            <Textarea
              autoFocus
              placeholder="Escribí la nota de resolución"
              className="text-sm"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              rows={3}
            />
          )}
        </div>

        <Button
          className="w-full"
          onClick={handleConfirm}
          disabled={
            saving ||
            !selectedOption ||
            (selectedOption === "custom" && !customNote.trim())
          }
        >
          {saving ? "Guardando..." : "Confirmar"}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
