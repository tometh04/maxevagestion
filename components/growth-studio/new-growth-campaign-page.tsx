"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Building2, CalendarDays, Loader2, Megaphone } from "lucide-react"
import { AgencyContextSelector } from "@/components/growth-studio/agency-context-selector"
import { useGrowthStudio } from "@/components/growth-studio/growth-studio-provider"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import type { GrowthStudioChannel } from "@/lib/growth-studio/campaign-schema"
import type { GrowthStudioSourceOption } from "@/lib/growth-studio/source-service"

const CHANNELS: Array<{ value: GrowthStudioChannel; label: string; detail: string }> = [
  { value: "instagram_feed", label: "Instagram feed", detail: "Caption, CTA y dirección visual" },
  { value: "instagram_stories", label: "Instagram Stories", detail: "Una pieza o secuencia de 3 a 5" },
  { value: "whatsapp", label: "WhatsApp", detail: "Mensaje breve listo para copiar" },
  { value: "email", label: "Email", detail: "Asunto, preheader, cuerpo y CTA" },
]

type SourceMode = "manual" | "operation" | "quotation"

export function NewGrowthCampaignPage() {
  const { agencies } = useGrowthStudio()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const requestedAgencyId = searchParams.get("agencyId")
  const selectedAgencyId = agencies.some((agency) => agency.id === requestedAgencyId)
    ? requestedAgencyId ?? undefined
    : agencies.length === 1
      ? agencies[0].id
      : undefined
  const [sources, setSources] = React.useState<GrowthStudioSourceOption[]>([])
  const [sourcesLoading, setSourcesLoading] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [sourceMode, setSourceMode] = React.useState<SourceMode>("manual")
  const [sourceId, setSourceId] = React.useState("")
  const [channels, setChannels] = React.useState<GrowthStudioChannel[]>([
    "instagram_feed",
    "instagram_stories",
    "whatsapp",
    "email",
  ])
  const [storyMode, setStoryMode] = React.useState<"single" | "sequence">("single")
  const [storyCount, setStoryCount] = React.useState<3 | 4 | 5>(3)
  const [includePrice, setIncludePrice] = React.useState(false)

  React.useEffect(() => {
    if (!selectedAgencyId) {
      setSources([])
      return
    }
    const controller = new AbortController()
    setSourcesLoading(true)
    fetch(`/api/growth-studio/sources?agencyId=${encodeURIComponent(selectedAgencyId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body?.error || "No se pudieron cargar las fuentes")
        setSources(body.data.sources)
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        toast({
          title: "No pudimos cargar operaciones y cotizaciones",
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        })
      })
      .finally(() => setSourcesLoading(false))
    return () => controller.abort()
  }, [selectedAgencyId, toast])

  function changeAgency(agencyId: string) {
    setSourceMode("manual")
    setSourceId("")
    router.replace(`/growth-studio/campaigns/new?agencyId=${encodeURIComponent(agencyId)}`)
  }

  function toggleChannel(channel: GrowthStudioChannel, checked: boolean) {
    setChannels((current) =>
      checked ? Array.from(new Set([...current, channel])) : current.filter((item) => item !== channel)
    )
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedAgencyId) return
    if (channels.length === 0) {
      toast({ title: "Elegí al menos un canal", variant: "destructive" })
      return
    }
    if (sourceMode !== "manual" && !sourceId) {
      toast({ title: "Elegí una fuente comercial", variant: "destructive" })
      return
    }

    const form = new FormData(event.currentTarget)
    const destinations = String(form.get("destinations") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
    const payload = {
      agencyId: selectedAgencyId,
      name: form.get("name"),
      objective: form.get("objective"),
      contentType: form.get("contentType"),
      source: sourceMode === "manual" ? { type: "manual", id: null } : { type: sourceMode, id: sourceId },
      channels,
      story: storyMode === "single" ? { mode: "single", screenCount: 1 } : { mode: "sequence", screenCount: storyCount },
      destinations,
      travelStart: form.get("travelStart") || null,
      travelEnd: form.get("travelEnd") || null,
      offerDetails: form.get("offerDetails"),
      includePrice,
      freeformNotes: form.get("freeformNotes"),
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/growth-studio/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "No se pudo crear la campaña")
      router.push(
        `/growth-studio/campaigns/${body.data.campaign.id}?agencyId=${encodeURIComponent(selectedAgencyId)}`
      )
    } catch (error) {
      toast({
        title: "No pudimos crear la campaña",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const sourceOptions = sources.filter((source) => source.kind === sourceMode)

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
            <Link href={selectedAgencyId ? `/growth-studio/campaigns?agencyId=${encodeURIComponent(selectedAgencyId)}` : "/growth-studio/campaigns"}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Campañas
            </Link>
          </Button>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Megaphone className="h-4 w-4" aria-hidden="true" />
            Growth Studio
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nueva campaña</h1>
          <p className="mt-1 text-sm text-muted-foreground">Definí el punto de partida. Después vas a elegir entre tres conceptos.</p>
        </div>
        <AgencyContextSelector agencies={agencies} value={selectedAgencyId} onValueChange={changeAgency} disabled={submitting} />
      </div>

      {!selectedAgencyId ? (
        <div className="rounded-2xl border bg-card px-6 py-14 text-center">
          <Building2 className="mx-auto h-9 w-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">Elegí una agencia</h2>
          <p className="mt-2 text-sm text-muted-foreground">La campaña y sus piezas quedarán aisladas dentro de esa agencia.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-6">
          <section className="rounded-2xl border bg-card p-5 sm:p-7">
            <SectionHeading number="1" title="Objetivo" description="Contanos qué querés comunicar y con qué enfoque." />
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Nombre de la campaña" htmlFor="name" className="sm:col-span-2">
                <Input id="name" name="name" required minLength={2} maxLength={120} placeholder="Ej. Caribe en vacaciones de invierno" />
              </Field>
              <Field label="Tipo de contenido" htmlFor="contentType">
                <Select name="contentType" defaultValue="promotion">
                  <SelectTrigger id="contentType"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="promotion">Promoción</SelectItem>
                    <SelectItem value="inspiration">Inspiración</SelectItem>
                    <SelectItem value="destination">Destino</SelectItem>
                    <SelectItem value="occasion">Ocasión especial</SelectItem>
                    <SelectItem value="freeform">Libre</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Destinos" htmlFor="destinations" hint="Separalos con comas">
                <Input id="destinations" name="destinations" placeholder="Cancún, Playa del Carmen" />
              </Field>
              <Field label="Objetivo comercial" htmlFor="objective" className="sm:col-span-2">
                <Textarea id="objective" name="objective" required minLength={5} maxLength={600} rows={4} placeholder="Ej. Conseguir consultas de parejas que buscan una escapada all inclusive" />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5 sm:p-7">
            <SectionHeading number="2" title="Fuente" description="Usá datos manuales o tomá contexto comercial, sin datos personales, de una operación o cotización." />
            <RadioGroup value={sourceMode} onValueChange={(value) => { setSourceMode(value as SourceMode); setSourceId("") }} className="mt-6 grid gap-3 sm:grid-cols-3">
              {(["manual", "operation", "quotation"] as const).map((value) => (
                <label key={value} className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
                  <RadioGroupItem value={value} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">{value === "manual" ? "Desde cero" : value === "operation" ? "Operación" : "Cotización"}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{value === "manual" ? "Escribí los datos de la oferta" : value === "operation" ? "Reutilizá destino, fechas y producto" : "Reutilizá una propuesta vigente"}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
            {sourceMode !== "manual" && (
              <div className="mt-5 max-w-2xl">
                <Label htmlFor="sourceId">{sourceMode === "operation" ? "Operación" : "Cotización"}</Label>
                <Select value={sourceId} onValueChange={setSourceId} disabled={sourcesLoading}>
                  <SelectTrigger id="sourceId" className="mt-2"><SelectValue placeholder={sourcesLoading ? "Cargando..." : "Seleccioná una opción"} /></SelectTrigger>
                  <SelectContent>
                    {sourceOptions.map((source) => (
                      <SelectItem key={source.id} value={source.id}>{source.reference} · {source.destination}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!sourcesLoading && sourceOptions.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No hay opciones vigentes para esta agencia.</p>}
              </div>
            )}
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Desde" htmlFor="travelStart"><Input id="travelStart" name="travelStart" type="date" /></Field>
              <Field label="Hasta" htmlFor="travelEnd"><Input id="travelEnd" name="travelEnd" type="date" /></Field>
              <Field label="Detalles de la oferta" htmlFor="offerDetails" className="sm:col-span-2">
                <Textarea id="offerDetails" name="offerDetails" maxLength={1500} rows={4} placeholder="Incluye, condiciones, vigencia y cualquier dato comercial relevante" />
              </Field>
              <label className="flex items-start gap-3 sm:col-span-2">
                <Checkbox checked={includePrice} onCheckedChange={(value) => setIncludePrice(value === true)} />
                <span>
                  <span className="block text-sm font-medium">Usar el precio de la fuente comercial</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">Solo se incluirá el importe, su moneda y la vigencia. No se copiarán datos del pasajero.</span>
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5 sm:p-7">
            <SectionHeading number="3" title="Canales" description="Elegí dónde querés adaptar el concepto seleccionado." />
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {CHANNELS.map((channel) => (
                <label key={channel.value} className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
                  <Checkbox checked={channels.includes(channel.value)} onCheckedChange={(value) => toggleChannel(channel.value, value === true)} className="mt-0.5" />
                  <span><span className="block text-sm font-medium">{channel.label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{channel.detail}</span></span>
                </label>
              ))}
            </div>
            {channels.includes("instagram_stories") && (
              <div className="mt-5 rounded-xl bg-muted/50 p-4">
                <Label>Formato de Stories</Label>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <RadioGroup value={storyMode} onValueChange={(value) => setStoryMode(value as "single" | "sequence")} className="flex gap-5">
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="single" />Una pieza</label>
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="sequence" />Secuencia</label>
                  </RadioGroup>
                  {storyMode === "sequence" && (
                    <Select value={String(storyCount)} onValueChange={(value) => setStoryCount(Number(value) as 3 | 4 | 5)}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="3">3 pantallas</SelectItem><SelectItem value="4">4 pantallas</SelectItem><SelectItem value="5">5 pantallas</SelectItem></SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            )}
            <Field label="Notas adicionales" htmlFor="freeformNotes" className="mt-5">
              <Textarea id="freeformNotes" name="freeformNotes" maxLength={2000} rows={4} placeholder="Restricciones, tono particular o ideas que no querés perder" />
            </Field>
          </section>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button asChild type="button" variant="outline"><Link href={`/growth-studio/campaigns?agencyId=${encodeURIComponent(selectedAgencyId)}`}>Cancelar</Link></Button>
            <Button type="submit" disabled={submitting}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-2 h-4 w-4" />}Crear campaña</Button>
          </div>
        </form>
      )}
    </div>
  )
}

function SectionHeading({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{number}</span><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div></div>
}

function Field({ label, htmlFor, hint, className, children }: { label: string; htmlFor: string; hint?: string; className?: string; children: React.ReactNode }) {
  return <div className={className}><div className="flex items-baseline justify-between gap-3"><Label htmlFor={htmlFor}>{label}</Label>{hint && <span className="text-xs text-muted-foreground">{hint}</span>}</div><div className="mt-2">{children}</div></div>
}
