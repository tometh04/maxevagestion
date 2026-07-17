"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, Building2, Megaphone, Plus, RefreshCw } from "lucide-react"
import { AgencyContextSelector } from "@/components/growth-studio/agency-context-selector"
import { useGrowthStudio } from "@/components/growth-studio/growth-studio-provider"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { CampaignDto } from "@/lib/growth-studio/campaign-service"

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  CONCEPTS_READY: "Conceptos listos",
  CONCEPT_SELECTED: "Concepto elegido",
  CHANNELS_READY: "Canales listos",
}

type CampaignsState =
  | { status: "idle" | "loading"; campaigns: CampaignDto[] }
  | { status: "ready"; campaigns: CampaignDto[] }
  | { status: "error"; campaigns: CampaignDto[]; message: string }

export function GrowthCampaignsPage() {
  const { agencies } = useGrowthStudio()
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedAgencyId = searchParams.get("agencyId")
  const selectedAgencyId = agencies.some((agency) => agency.id === requestedAgencyId)
    ? requestedAgencyId ?? undefined
    : undefined
  const [state, setState] = React.useState<CampaignsState>({
    status: "idle",
    campaigns: [],
  })

  React.useEffect(() => {
    if (agencies.length === 1 && !selectedAgencyId) {
      router.replace(
        `/growth-studio/campaigns?agencyId=${encodeURIComponent(agencies[0].id)}`
      )
    }
  }, [agencies, router, selectedAgencyId])

  const load = React.useCallback(async () => {
    if (!selectedAgencyId) {
      setState({ status: "idle", campaigns: [] })
      return
    }
    setState((current) => ({ status: "loading", campaigns: current.campaigns }))
    try {
      const response = await fetch(
        `/api/growth-studio/campaigns?agencyId=${encodeURIComponent(selectedAgencyId)}`
      )
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "No se pudieron cargar las campañas")
      setState({ status: "ready", campaigns: body.data.campaigns })
    } catch (error) {
      setState({
        status: "error",
        campaigns: [],
        message: error instanceof Error ? error.message : "No se pudieron cargar las campañas",
      })
    }
  }, [selectedAgencyId])

  React.useEffect(() => {
    void load()
  }, [load])

  function changeAgency(agencyId: string) {
    router.replace(`/growth-studio/campaigns?agencyId=${encodeURIComponent(agencyId)}`)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Megaphone className="h-4 w-4" aria-hidden="true" />
            Growth Studio
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Campañas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tres conceptos, un mensaje consistente en cada canal.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <AgencyContextSelector
            agencies={agencies}
            value={selectedAgencyId}
            onValueChange={changeAgency}
          />
          <Button asChild disabled={!selectedAgencyId}>
            <Link
              href={
                selectedAgencyId
                  ? `/growth-studio/campaigns/new?agencyId=${encodeURIComponent(selectedAgencyId)}`
                  : "/growth-studio/campaigns"
              }
              aria-disabled={!selectedAgencyId}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Nueva campaña
            </Link>
          </Button>
        </div>
      </div>

      {!selectedAgencyId && (
        <div className="rounded-2xl border bg-card px-6 py-14 text-center">
          <Building2 className="mx-auto h-9 w-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold">Elegí una agencia</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Las campañas y su historial pertenecen a una agencia.
          </p>
        </div>
      )}

      {selectedAgencyId && state.status === "loading" && state.campaigns.length === 0 && (
        <div className="space-y-3" aria-label="Cargando campañas">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {selectedAgencyId && state.status === "error" && (
        <div className="rounded-2xl border bg-card px-6 py-12 text-center">
          <p className="font-medium">No pudimos cargar las campañas</p>
          <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
          <Button variant="outline" className="mt-5" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reintentar
          </Button>
        </div>
      )}

      {selectedAgencyId && state.status === "ready" && state.campaigns.length === 0 && (
        <div className="rounded-2xl border bg-card px-6 py-12 sm:px-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Primera campaña
          </p>
          <h2 className="mt-2 text-xl font-semibold">Convertí una idea en contenido listo</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Podés empezar desde cero o usar los datos comerciales de una operación o cotización.
          </p>
          <Button asChild className="mt-6">
            <Link href={`/growth-studio/campaigns/new?agencyId=${encodeURIComponent(selectedAgencyId)}`}>
              Crear campaña
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}

      {selectedAgencyId && state.campaigns.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="hidden grid-cols-[minmax(0,1fr)_180px_140px_36px] gap-4 border-b px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Campaña</span>
            <span>Estado</span>
            <span>Actualizada</span>
            <span />
          </div>
          {state.campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/growth-studio/campaigns/${campaign.id}?agencyId=${encodeURIComponent(selectedAgencyId)}`}
              className="grid gap-2 border-b px-5 py-4 transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[minmax(0,1fr)_180px_140px_36px] sm:items-center sm:gap-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{campaign.name}</p>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {campaign.brief.objective}
                </p>
              </div>
              <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                {STATUS_LABELS[campaign.status] ?? campaign.status}
              </span>
              <span className="text-sm text-muted-foreground">
                {new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(
                  new Date(campaign.updatedAt)
                )}
              </span>
              <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

