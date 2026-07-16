"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, Building2, Megaphone, RefreshCw } from "lucide-react"
import { useGrowthStudio } from "@/components/growth-studio/growth-studio-provider"
import { AgencyContextSelector } from "@/components/growth-studio/agency-context-selector"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import type { BrandProfileDto } from "@/lib/growth-studio/brand-profile-service"

type LoadState =
  | { status: "idle" | "loading"; profile: null }
  | { status: "ready"; profile: BrandProfileDto | null }
  | { status: "error"; profile: null; message: string }

const MISSING_LABELS: Record<string, string> = {
  "identity.valueProposition": "Propuesta de valor",
  "identity.differentiators": "Diferenciales",
  "audience.summary": "Audiencia",
  "voice.tone": "Tono de voz",
  "voice.personality": "Personalidad",
  "offer.commercialFocus": "Foco comercial",
  "offer.preferredDestinations": "Destinos preferidos",
  "visual.styleNotes": "Estilo visual",
  "conversion.preferredCta": "Llamado a la acción",
}

export function GrowthStudioHome() {
  const { agencies } = useGrowthStudio()
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedAgencyId = searchParams.get("agencyId")
  const requestedAgency = agencies.find((agency) => agency.id === requestedAgencyId)
  const selectedAgencyId = requestedAgency?.id
  const [state, setState] = React.useState<LoadState>({ status: "idle", profile: null })

  React.useEffect(() => {
    if (agencies.length === 1 && !selectedAgencyId) {
      router.replace(`/growth-studio?agencyId=${encodeURIComponent(agencies[0].id)}`)
    }
  }, [agencies, router, selectedAgencyId])

  const loadProfile = React.useCallback(async (signal?: AbortSignal) => {
    if (!selectedAgencyId) {
      setState({ status: "idle", profile: null })
      return
    }

    setState({ status: "loading", profile: null })
    try {
      const response = await fetch(
        `/api/growth-studio/brand-profile?agencyId=${encodeURIComponent(selectedAgencyId)}`,
        { signal }
      )
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "No se pudo cargar el perfil")
      setState({ status: "ready", profile: body.data.profile })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setState({
        status: "error",
        profile: null,
        message: error instanceof Error ? error.message : "No se pudo cargar el perfil",
      })
    }

  }, [selectedAgencyId])

  React.useEffect(() => {
    const controller = new AbortController()
    void loadProfile(controller.signal)
    return () => controller.abort()
  }, [loadProfile])

  function changeAgency(agencyId: string) {
    router.replace(`/growth-studio?agencyId=${encodeURIComponent(agencyId)}`)
  }

  if (agencies.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        <PageHeading />
        <div className="rounded-2xl border bg-card px-6 py-14 text-center">
          <Building2 className="mx-auto h-9 w-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">No tenés agencias disponibles</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Pedile a un administrador que te asigne una agencia para configurar su marca.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <PageHeading />
        <AgencyContextSelector
          agencies={agencies}
          value={selectedAgencyId}
          onValueChange={changeAgency}
        />
      </div>

      {!selectedAgencyId && (
        <div className="rounded-2xl border bg-card px-6 py-14 text-center">
          <Building2 className="mx-auto h-9 w-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">Elegí la agencia de trabajo</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Cada agencia tiene su propio perfil de marca. La selección se mantiene en la URL.
          </p>
        </div>
      )}

      {selectedAgencyId && state.status === "loading" && <ProfileSkeleton />}

      {selectedAgencyId && state.status === "error" && (
        <div className="rounded-2xl border bg-card px-6 py-12 text-center">
          <p className="font-medium">No pudimos cargar el perfil</p>
          <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
          <Button variant="outline" className="mt-5" onClick={() => void loadProfile()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reintentar
          </Button>
        </div>
      )}

      {selectedAgencyId && state.status === "ready" && !state.profile && (
        <div className="rounded-2xl border bg-card px-6 py-12 sm:px-10">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Primer paso
            </p>
            <h2 className="mt-2 text-xl font-semibold">Definí cómo habla tu agencia</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Completá identidad, audiencia, tono y oferta. Este perfil será el contexto de las
              campañas y generaciones futuras.
            </p>
            <Button asChild className="mt-6">
              <Link href={`/growth-studio/brand?agencyId=${encodeURIComponent(selectedAgencyId)}`}>
                Configurar mi marca
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      )}

      {selectedAgencyId && state.status === "ready" && state.profile && (
        <div className="rounded-2xl border bg-card px-6 py-8 sm:px-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">Perfil de marca</p>
              <h2 className="mt-1 truncate text-xl font-semibold">{state.profile.brandName}</h2>
              <div className="mt-6 max-w-xl">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">Completitud</span>
                  <span className="tabular-nums text-muted-foreground">
                    {state.profile.completion.percentage}%
                  </span>
                </div>
                <Progress value={state.profile.completion.percentage} />
                {state.profile.completion.missing.length > 0 && (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Próximo: {state.profile.completion.missing
                      .slice(0, 3)
                      .map((field) => MISSING_LABELS[field] ?? field)
                      .join(", ")}.
                  </p>
                )}
              </div>
            </div>
            <Button asChild variant="outline">
              <Link href={`/growth-studio/brand?agencyId=${encodeURIComponent(selectedAgencyId)}`}>
                Editar perfil
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function PageHeading() {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <Megaphone className="h-4 w-4" aria-hidden="true" />
        Growth Studio
      </div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Inicio</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Prepará el contexto de marca que usará tu equipo.
      </p>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="rounded-2xl border bg-card px-6 py-8 sm:px-10" aria-label="Cargando perfil">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-7 w-56" />
      <Skeleton className="mt-7 h-2 w-full max-w-xl" />
      <Skeleton className="mt-4 h-4 w-72 max-w-full" />
    </div>
  )
}
