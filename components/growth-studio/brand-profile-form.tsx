"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Building2, Check, Loader2, Megaphone } from "lucide-react"
import { toast } from "sonner"
import { AgencyContextSelector } from "@/components/growth-studio/agency-context-selector"
import { useGrowthStudio } from "@/components/growth-studio/growth-studio-provider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { calculateBrandProfileCompletion } from "@/lib/growth-studio/brand-profile"
import {
  brandProfileInputSchema,
  createEmptyBrandProfileData,
  type BrandProfileDataV1,
} from "@/lib/growth-studio/brand-profile-schema"
import type { BrandProfileDto } from "@/lib/growth-studio/brand-profile-service"

function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatList(value: string[]): string {
  return value.join("\n")
}

export function BrandProfileForm() {
  const { agencies } = useGrowthStudio()
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedAgencyId = searchParams.get("agencyId")
  const selectedAgency = agencies.find((agency) => agency.id === requestedAgencyId)
  const selectedAgencyId = selectedAgency?.id
  const [brandName, setBrandName] = React.useState("")
  const [data, setData] = React.useState<BrandProfileDataV1>(createEmptyBrandProfileData)
  const [profileId, setProfileId] = React.useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (agencies.length === 1 && !selectedAgencyId) {
      router.replace(
        `/growth-studio/brand?agencyId=${encodeURIComponent(agencies[0].id)}`
      )
    }
  }, [agencies, router, selectedAgencyId])

  React.useEffect(() => {
    if (!selectedAgencyId) {
      setBrandName("")
      setData(createEmptyBrandProfileData())
      setProfileId(null)
      setUpdatedAt(null)
      setError(null)
      return
    }

    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(
          `/api/growth-studio/brand-profile?agencyId=${encodeURIComponent(selectedAgencyId!)}`,
          { signal: controller.signal }
        )
        const body = await response.json()
        if (!response.ok) throw new Error(body?.error || "No se pudo cargar el perfil")

        const profile = body.data.profile as BrandProfileDto | null
        setProfileId(profile?.id ?? null)
        setBrandName(profile?.brandName ?? selectedAgency?.name ?? "")
        setData(profile?.data ?? createEmptyBrandProfileData())
        setUpdatedAt(profile?.updatedAt ?? null)
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return
        setError(
          loadError instanceof Error ? loadError.message : "No se pudo cargar el perfil"
        )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [selectedAgency?.name, selectedAgencyId])

  const completion = React.useMemo(
    () => calculateBrandProfileCompletion({ brandName, data }),
    [brandName, data]
  )

  function updateSection<K extends keyof BrandProfileDataV1>(
    section: K,
    patch: Partial<BrandProfileDataV1[K]>
  ) {
    setData((current) => ({
      ...current,
      [section]: { ...current[section], ...patch },
    }))
  }

  function changeAgency(agencyId: string) {
    router.replace(`/growth-studio/brand?agencyId=${encodeURIComponent(agencyId)}`)
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedAgencyId) return

    const payload = brandProfileInputSchema.safeParse({
      agencyId: selectedAgencyId,
      brandName,
      data,
    })
    if (!payload.success) {
      setError("Revisá los campos marcados y sus límites antes de guardar.")
      return
    }

    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/growth-studio/brand-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.data),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "No se pudo guardar el perfil")

      const profile = body.data.profile as BrandProfileDto
      setProfileId(profile.id)
      setBrandName(profile.brandName)
      setData(profile.data)
      setUpdatedAt(profile.updatedAt)
      toast.success("Perfil de marca guardado")
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "No se pudo guardar el perfil"
      )
    } finally {
      setSaving(false)
    }
  }

  if (agencies.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        <PageHeader />
        <div className="rounded-2xl border bg-card px-6 py-14 text-center">
          <Building2 className="mx-auto h-9 w-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">No tenés agencias disponibles</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Necesitás una agencia asignada para crear un perfil de marca.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader agencyId={selectedAgencyId} />
        <AgencyContextSelector
          agencies={agencies}
          value={selectedAgencyId}
          onValueChange={changeAgency}
          disabled={saving}
        />
      </div>

      {!selectedAgencyId && (
        <div className="rounded-2xl border bg-card px-6 py-14 text-center">
          <Building2 className="mx-auto h-9 w-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">Seleccioná una agencia</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            El perfil se guarda de forma independiente para cada agencia.
          </p>
        </div>
      )}

      {selectedAgencyId && loading && <FormSkeleton />}

      {selectedAgencyId && !loading && (
        <form onSubmit={save} className="space-y-5">
          <div className="rounded-2xl border bg-card">
            <div className="flex flex-col gap-4 border-b px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <div>
                <p className="text-sm font-medium">
                  {profileId ? "Perfil activo" : "Perfil nuevo"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {updatedAt
                    ? `Última actualización ${new Date(updatedAt).toLocaleString("es-AR")}`
                    : "Podés completarlo de forma progresiva"}
                </p>
              </div>
              <div className="w-full sm:w-56">
                <div className="mb-2 flex justify-between text-xs">
                  <span className="text-muted-foreground">Completitud</span>
                  <span className="font-medium tabular-nums">{completion.percentage}%</span>
                </div>
                <Progress value={completion.percentage} />
              </div>
            </div>

            <FormSection
              title="Identidad"
              description="La definición corta que diferencia a la agencia."
            >
              <Field label="Nombre de marca" htmlFor="brand-name" required>
                <Input
                  id="brand-name"
                  value={brandName}
                  onChange={(event) => setBrandName(event.target.value)}
                  maxLength={120}
                  required
                />
              </Field>
              <Field label="Tagline" htmlFor="tagline">
                <Input
                  id="tagline"
                  value={data.identity.tagline}
                  onChange={(event) =>
                    updateSection("identity", { tagline: event.target.value })
                  }
                  maxLength={160}
                  placeholder="Viajes pensados para vos"
                />
              </Field>
              <Field label="Propuesta de valor" htmlFor="value-proposition" wide>
                <Textarea
                  id="value-proposition"
                  value={data.identity.valueProposition}
                  onChange={(event) =>
                    updateSection("identity", { valueProposition: event.target.value })
                  }
                  maxLength={1000}
                  rows={4}
                  placeholder="Qué resuelve la agencia y por qué deberían elegirla"
                />
              </Field>
              <ListField
                id="differentiators"
                label="Diferenciales"
                value={data.identity.differentiators}
                onChange={(value) => updateSection("identity", { differentiators: value })}
                placeholder="Atención personalizada&#10;Financiación&#10;Especialistas en Caribe"
              />
            </FormSection>

            <FormSection
              title="Audiencia"
              description="A quién le habla la marca y qué espera de un viaje."
            >
              <Field label="Descripción de la audiencia" htmlFor="audience-summary" wide>
                <Textarea
                  id="audience-summary"
                  value={data.audience.summary}
                  onChange={(event) =>
                    updateSection("audience", { summary: event.target.value })
                  }
                  maxLength={1000}
                  rows={4}
                  placeholder="Familias que buscan resolver el viaje completo con acompañamiento"
                />
              </Field>
              <ListField
                id="audience-segments"
                label="Segmentos"
                value={data.audience.segments}
                onChange={(value) => updateSection("audience", { segments: value })}
                placeholder="Familias&#10;Parejas&#10;Grupos"
              />
            </FormSection>

            <FormSection
              title="Voz"
              description="Cómo debe sonar cualquier mensaje creado para la agencia."
            >
              <Field label="Tono de voz" htmlFor="voice-tone" wide>
                <Textarea
                  id="voice-tone"
                  value={data.voice.tone}
                  onChange={(event) => updateSection("voice", { tone: event.target.value })}
                  maxLength={500}
                  rows={3}
                  placeholder="Cercano, experto y optimista. Directo, sin promesas exageradas."
                />
              </Field>
              <ListField
                id="voice-personality"
                label="Personalidad"
                value={data.voice.personality}
                onChange={(value) => updateSection("voice", { personality: value })}
                placeholder="Cercana&#10;Confiable&#10;Resolutiva"
              />
              <ListField
                id="words-to-use"
                label="Palabras preferidas"
                value={data.voice.wordsToUse}
                onChange={(value) => updateSection("voice", { wordsToUse: value })}
                placeholder="acompañamos&#10;experiencia&#10;tranquilidad"
              />
              <ListField
                id="forbidden-terms"
                label="Palabras a evitar"
                value={data.voice.forbiddenTerms}
                onChange={(value) => updateSection("voice", { forbiddenTerms: value })}
                placeholder="baratísimo&#10;imperdible&#10;garantizado"
              />
              <Field label="Reglas de escritura" htmlFor="writing-rules" wide>
                <Textarea
                  id="writing-rules"
                  value={data.voice.writingRules}
                  onChange={(event) =>
                    updateSection("voice", { writingRules: event.target.value })
                  }
                  maxLength={1500}
                  rows={4}
                  placeholder="Usar voseo, frases cortas y un solo emoji cuando aporte contexto."
                />
              </Field>
            </FormSection>

            <FormSection
              title="Oferta"
              description="Productos y destinos que deberían tener prioridad."
            >
              <ListField
                id="commercial-focus"
                label="Foco comercial"
                value={data.offer.commercialFocus}
                onChange={(value) => updateSection("offer", { commercialFocus: value })}
                placeholder="Paquetes familiares&#10;Lunas de miel&#10;Salidas grupales"
              />
              <ListField
                id="preferred-destinations"
                label="Destinos preferidos"
                value={data.offer.preferredDestinations}
                onChange={(value) =>
                  updateSection("offer", { preferredDestinations: value })
                }
                placeholder="Caribe&#10;Brasil&#10;Europa"
              />
            </FormSection>

            <FormSection
              title="Estilo visual"
              description="Referencias simples para mantener consistencia."
            >
              <Field label="Color principal" htmlFor="primary-color">
                <Input
                  id="primary-color"
                  value={data.visual.primaryColor ?? ""}
                  onChange={(event) =>
                    updateSection("visual", { primaryColor: event.target.value || null })
                  }
                  maxLength={7}
                  placeholder="#4F46E5"
                />
              </Field>
              <Field label="Color secundario" htmlFor="secondary-color">
                <Input
                  id="secondary-color"
                  value={data.visual.secondaryColor ?? ""}
                  onChange={(event) =>
                    updateSection("visual", { secondaryColor: event.target.value || null })
                  }
                  maxLength={7}
                  placeholder="#0891B2"
                />
              </Field>
              <Field label="Dirección visual" htmlFor="style-notes" wide>
                <Textarea
                  id="style-notes"
                  value={data.visual.styleNotes}
                  onChange={(event) =>
                    updateSection("visual", { styleNotes: event.target.value })
                  }
                  maxLength={1000}
                  rows={4}
                  placeholder="Fotografía luminosa, personas reales y destinos protagonistas."
                />
              </Field>
            </FormSection>

            <FormSection
              title="Conversión e idioma"
              description="Cómo cerrar los mensajes y en qué variante escribir."
              last
            >
              <Field label="Llamado a la acción" htmlFor="preferred-cta" wide>
                <Input
                  id="preferred-cta"
                  value={data.conversion.preferredCta}
                  onChange={(event) =>
                    updateSection("conversion", { preferredCta: event.target.value })
                  }
                  maxLength={300}
                  placeholder="Escribinos y armamos tu viaje"
                />
              </Field>
              <Field label="Idioma" htmlFor="language">
                <Input
                  id="language"
                  value={data.locale.language}
                  onChange={(event) =>
                    updateSection("locale", { language: event.target.value })
                  }
                  maxLength={10}
                  placeholder="es"
                />
              </Field>
              <Field label="País" htmlFor="country">
                <Input
                  id="country"
                  value={data.locale.country}
                  onChange={(event) =>
                    updateSection("locale", { country: event.target.value.toUpperCase() })
                  }
                  maxLength={2}
                  placeholder="AR"
                />
              </Field>
            </FormSection>
          </div>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertTitle>No pudimos completar la acción</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="sticky bottom-4 flex flex-col gap-3 rounded-xl border bg-background p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
            <p className="px-1 text-xs text-muted-foreground" aria-live="polite">
              {profileId ? "Los cambios actualizan el perfil vigente." : "Se creará un perfil para esta agencia."}
            </p>
            <Button type="submit" disabled={saving} className="sm:min-w-36">
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {saving ? "Guardando" : "Guardar perfil"}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

function PageHeader({ agencyId }: { agencyId?: string }) {
  const query = agencyId ? `?agencyId=${encodeURIComponent(agencyId)}` : ""
  return (
    <div>
      <Link
        href={`/growth-studio${query}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Inicio
      </Link>
      <div className="mt-3 flex items-center gap-2 text-sm font-medium text-primary">
        <Megaphone className="h-4 w-4" aria-hidden="true" />
        Growth Studio
      </div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Mi marca</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        El contexto compartido para el contenido de la agencia.
      </p>
    </div>
  )
}

function FormSection({
  title,
  description,
  children,
  last = false,
}: {
  title: string
  description: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <section className={last ? "px-6 py-7 sm:px-8" : "border-b px-6 py-7 sm:px-8"}>
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">{children}</div>
      </div>
    </section>
  )
}

function Field({
  label,
  htmlFor,
  required = false,
  wide = false,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={wide ? "space-y-2 sm:col-span-2" : "space-y-2"}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-1 text-destructive" aria-hidden="true">*</span>}
      </Label>
      {children}
    </div>
  )
}

function ListField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
}) {
  return (
    <Field label={label} htmlFor={id} wide>
      <Textarea
        id={id}
        value={formatList(value)}
        onChange={(event) => onChange(parseList(event.target.value))}
        rows={3}
        placeholder={placeholder}
      />
      <p className="text-xs text-muted-foreground">Una opción por línea o separada por coma.</p>
    </Field>
  )
}

function FormSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-6 sm:p-8" aria-label="Cargando perfil">
      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-28 sm:col-span-2" />
        </div>
      </div>
    </div>
  )
}
