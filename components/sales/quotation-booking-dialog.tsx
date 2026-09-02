"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Traveller = { type: "ADT" | "CHD" | "INF"; title: "Mr" | "Mrs" | "Ms" | "Miss"; name: string; surname: string; birth_date: string }

async function pollProviderBooking(quotationId: string, onUpdated: () => void) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (attempt > 0) await new Promise(resolve => window.setTimeout(resolve, 1500))
    try {
      const response = await fetch(`/api/quotations/${quotationId}/provider-booking`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "No se pudo consultar la reserva")
      const status = payload.data?.status
      if (status === "QUEUED" || status === "PROCESSING") continue
      onUpdated()
      if (status === "CONFIRMED") toast.success("Reserva confirmada en Delfos.")
      else if (status === "PRICE_CHANGED") toast.error("Delfos informó un cambio de precio. Revisá la cotización antes de reservar.")
      else if (status === "PARTIAL") toast.error("Delfos confirmó solo una parte de la reserva. Requiere revisión.")
      else toast.error("Delfos no pudo confirmar la reserva.")
      return
    } catch {
      if (attempt === 39) toast.error("La reserva continúa en segundo plano, pero no pudimos actualizar su estado.")
    }
  }
}

export function QuotationBookingDialog({ quotation, open, onOpenChange, onQueued }: {
  quotation: any
  open: boolean
  onOpenChange: (open: boolean) => void
  onQueued: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [holderName, setHolderName] = useState("")
  const [holderSurname, setHolderSurname] = useState("")
  const [email, setEmail] = useState("")
  const [countryPref, setCountryPref] = useState("+54")
  const [phone, setPhone] = useState("")
  const [travellers, setTravellers] = useState<Traveller[]>([])
  const [selectedOptionId, setSelectedOptionId] = useState("")

  useEffect(() => {
    if (!open || !quotation) return
    const total = Math.max(1, Number(quotation.adults || 0) + Number(quotation.children || 0) + Number(quotation.infants || 0))
    const types = [
      ...Array(Number(quotation.adults || 0)).fill("ADT"),
      ...Array(Number(quotation.children || 0)).fill("CHD"),
      ...Array(Number(quotation.infants || 0)).fill("INF"),
    ] as Traveller["type"][]
    setHolderName(String(quotation.lead?.contact_name || "").trim().split(/\s+/)[0] || "")
    setHolderSurname(String(quotation.lead?.contact_name || "").trim().split(/\s+/).slice(1).join(" "))
    setEmail(quotation.lead?.contact_email || "")
    setPhone(String(quotation.lead?.contact_phone || "").replace(/\D/g, ""))
    setTravellers(Array.from({ length: total }, (_, index) => ({ type: types[index] || "ADT", title: "Mr", name: "", surname: "", birth_date: "" })))
    const options = Array.isArray(quotation.quotation_options) ? quotation.quotation_options : []
    setSelectedOptionId(options.find((option: any) => option.is_selected)?.id || (options.length === 1 ? options[0].id : ""))
  }, [open, quotation])

  const updateTraveller = (index: number, patch: Partial<Traveller>) => setTravellers(current => current.map((entry, position) => position === index ? { ...entry, ...patch } : entry))

  async function submit() {
    if (!quotation) return
    const priceConfirmation = quotation.price_confirmation?.confirmed === true
      ? {
          price_refresh_run_id: quotation.price_confirmation.run_id,
          option_id: selectedOptionId,
        }
      : {}
    setSubmitting(true)
    try {
      const response = await fetch(`/api/quotations/${quotation.id}/convert`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...priceConfirmation,
          booking: {
            holder: { name: holderName, surnames: [holderSurname], contact: { mails: [email], phones: [{ country_pref: countryPref, number: phone }] } },
            travellers: travellers.map(entry => ({ type: entry.type, title: entry.title, name: entry.name, surnames: [entry.surname], ...(entry.type !== "ADT" || entry.birth_date ? { birth_date: entry.birth_date } : {}) })),
          },
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "No se pudo convertir y reservar")
      if (!payload.data?.provider_booking?.job_id) throw new Error(payload.warnings?.at(-1) || "La operación se creó, pero la reserva no quedó encolada")
      toast.success(`Operación ${payload.data.file_code} creada. Reserva en proceso.`)
      onQueued()
      onOpenChange(false)
      void pollProviderBooking(quotation.id, onQueued)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo convertir y reservar")
    } finally { setSubmitting(false) }
  }

  return <Dialog open={open} onOpenChange={submitting ? undefined : onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Convertir y reservar con Delfos</DialogTitle>
        <DialogDescription>La operación se creará ahora y la reserva continuará en segundo plano aunque cierres esta ventana.</DialogDescription>
      </DialogHeader>
      {Array.isArray(quotation?.quotation_options) && quotation.quotation_options.length > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor="booking-option">Opción a reservar</Label>
          <Select value={selectedOptionId} onValueChange={setSelectedOptionId}>
            <SelectTrigger id="booking-option"><SelectValue placeholder="Seleccioná una opción" /></SelectTrigger>
            <SelectContent>
              {quotation.quotation_options.map((option: any) => (
                <SelectItem key={option.id} value={option.id}>{option.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del titular"><Input value={holderName} onChange={event => setHolderName(event.target.value)} /></Field>
        <Field label="Apellido del titular"><Input value={holderSurname} onChange={event => setHolderSurname(event.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={email} onChange={event => setEmail(event.target.value)} /></Field>
        <div className="grid grid-cols-[90px_1fr] gap-2"><Field label="Prefijo"><Input value={countryPref} onChange={event => setCountryPref(event.target.value)} /></Field><Field label="Teléfono"><Input value={phone} onChange={event => setPhone(event.target.value)} /></Field></div>
      </div>
      <div className="space-y-3">
        {travellers.map((entry, index) => <div key={index} className="rounded-lg border p-3">
          <p className="mb-3 text-sm font-medium">Pasajero / huésped {index + 1}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Tipo"><Select value={entry.type} onValueChange={value => updateTraveller(index, { type: value as Traveller["type"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ADT">Adulto</SelectItem><SelectItem value="CHD">Menor</SelectItem><SelectItem value="INF">Infante</SelectItem></SelectContent></Select></Field>
            <Field label="Título"><Select value={entry.title} onValueChange={value => updateTraveller(index, { title: value as Traveller["title"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Mr">Sr.</SelectItem><SelectItem value="Mrs">Sra.</SelectItem><SelectItem value="Ms">Sra.</SelectItem><SelectItem value="Miss">Srta.</SelectItem></SelectContent></Select></Field>
            <Field label="Nombre"><Input value={entry.name} onChange={event => updateTraveller(index, { name: event.target.value })} /></Field>
            <Field label="Apellido"><Input value={entry.surname} onChange={event => updateTraveller(index, { surname: event.target.value })} /></Field>
            {(entry.type !== "ADT" || entry.birth_date) && <Field label="Fecha de nacimiento"><Input type="date" value={entry.birth_date} onChange={event => updateTraveller(index, { birth_date: event.target.value })} /></Field>}
          </div>
        </div>)}
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button><Button onClick={submit} disabled={submitting || (quotation?.price_confirmation?.confirmed === true && (!quotation.price_confirmation.run_id || !selectedOptionId))}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Convertir y reservar</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>
}
