"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  Loader2,
  RefreshCw,
  SearchCheck,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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

type RefreshRunStatus =
  | "RUNNING"
  | "REVIEW_REQUIRED"
  | "APPLIED"
  | "FAILED"
  | "STALE"

type RefreshOutcome =
  | "UNCHANGED"
  | "PRICE_CHANGED"
  | "UNAVAILABLE"
  | "REPLACEMENT_FOUND"
  | "NOT_REFRESHABLE"
  | "FAILED"

type RefreshAction = "USE_REFRESHED" | "USE_REPLACEMENT" | "KEEP_CURRENT"

interface RefreshPriceSnapshot {
  cost_amount: number
  sale_amount?: number
  currency: string
  cost_basis?: "AGENCY_NET" | "PROVIDER_TOTAL" | "COMMISSIONABLE_GROSS" | "UNKNOWN"
  conditions?: unknown
}

interface RefreshCandidate {
  id: string
  label: string
  cost_amount: number
  currency: string
  cost_basis?: "AGENCY_NET" | "PROVIDER_TOTAL" | "COMMISSIONABLE_GROSS" | "UNKNOWN"
  conditions?: unknown
  differences?: RefreshDifference[]
}

interface RefreshDifference {
  field: string
  before: unknown
  after: unknown
  material: boolean
}

interface RefreshItem {
  line_id: string
  option_id: string
  option_title: string
  quotation_item_id?: string
  item_type: string
  label: string
  quantity?: number
  outcome: RefreshOutcome
  current: RefreshPriceSnapshot
  refreshed?: RefreshPriceSnapshot
  delta_amount?: number
  condition_changes?: string[]
  differences?: RefreshDifference[]
  error?: { code?: string; message: string; retryable: boolean } | null
  candidates?: RefreshCandidate[]
  allowed_actions: RefreshAction[]
  requires_decision: boolean
}

interface RefreshOptionSummary {
  option_id: string
  option_title: string
  current_cost_total: number
  proposed_cost_total: number
  current_customer_total: number
  suggested_customer_total: number
  current_margin: number
  suggested_margin: number
  manual_total_requires_confirmation: boolean
}

interface RefreshRun {
  id: string
  quotation_id?: string
  status: RefreshRunStatus
  source_updated_at?: string
  quotation_updated_at?: string
  updated_at: string
  requested_at?: string
  completed_at?: string | null
  applied_at?: string | null
  valid_until?: string | null
  summary: {
    currency: string
    item_count: number
    unchanged_count: number
    price_changed_count: number
    unavailable_count: number
    replacement_count: number
    not_refreshable_count: number
    failed_count: number
    options: RefreshOptionSummary[]
  }
  items: RefreshItem[]
  apply_blockers?: Array<{ code: string; message: string }>
  error?: string | null
}

interface Props {
  quotationId: string | null
  onClose: () => void
  onApplied: () => void | Promise<void>
}

interface RequestErrorState {
  message: string
  code?: string
}

const OUTCOME_PRESENTATION: Record<RefreshOutcome, {
  label: string
  className: string
}> = {
  UNCHANGED: {
    label: "Sin cambios",
    className: "border-success/20 bg-success/10 text-success",
  },
  PRICE_CHANGED: {
    label: "Precio actualizado",
    className: "border-primary/20 bg-primary/10 text-primary",
  },
  UNAVAILABLE: {
    label: "Sin disponibilidad",
    className: "border-destructive/20 bg-destructive/10 text-destructive",
  },
  REPLACEMENT_FOUND: {
    label: "Alternativa encontrada",
    className: "border-accent-violet/20 bg-accent-violet/10 text-accent-violet",
  },
  NOT_REFRESHABLE: {
    label: "No revalidable",
    className: "border-border bg-muted text-muted-foreground",
  },
  FAILED: {
    label: "Falló la consulta",
    className: "border-destructive/20 bg-destructive/10 text-destructive",
  },
}

function formatMoney(amount: number | null | undefined, currency: string) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDifferenceValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "sin dato"
  if (typeof value === "boolean") return value ? "sí" : "no"
  if (typeof value === "string" || typeof value === "number") return String(value)
  try {
    const serialized = JSON.stringify(value)
    return serialized.length > 180 ? `${serialized.slice(0, 177)}…` : serialized
  } catch {
    return "dato actualizado"
  }
}

function differenceFieldLabel(field: string) {
  const labels: Record<string, string> = {
    "price.amount": "Importe del proveedor",
    departure_at: "Horario de salida",
    arrival_at: "Horario de llegada",
    checked_baggage: "Equipaje despachado",
    baggage: "Equipaje",
    board: "Régimen",
    cancellation_policy: "Política de cancelación",
    refundable: "Reembolso",
    check_in: "Check-in",
    check_out: "Check-out",
  }
  return labels[field] || field.replaceAll("_", " ")
}

function makeIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0"))
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-")
}

function extractRun(payload: any): RefreshRun | null {
  return payload?.data?.run || payload?.run || null
}

async function requestPayload(response: Response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(
      payload?.error?.message
      || payload?.error
      || payload?.message
      || "No se pudo actualizar la cotización"
    ) as Error & { code?: string }
    error.code = payload?.error?.code || payload?.code
    throw error
  }
  return payload
}

function waitForPoll(signal: AbortSignal, delayMs: number) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, delayMs)
    signal.addEventListener("abort", () => {
      window.clearTimeout(timeout)
      reject(new DOMException("Aborted", "AbortError"))
    }, { once: true })
  })
}

function actionLabel(action: RefreshAction, outcome: RefreshOutcome) {
  if (action === "USE_REFRESHED") return "Usar actualizado"
  if (action === "USE_REPLACEMENT") return "Usar reemplazo"
  if (outcome === "UNAVAILABLE" || outcome === "NOT_REFRESHABLE" || outcome === "FAILED") {
    return "Mantener sin validar"
  }
  return "Mantener actual"
}

function itemTypeLabel(itemType: string) {
  const labels: Record<string, string> = {
    FLIGHT: "Vuelo",
    HOTEL: "Hotel",
    TRANSFER: "Traslado",
    ASSISTANCE: "Asistencia",
    EXCURSION: "Excursión",
    OTHER: "Servicio",
  }
  return labels[itemType] || "Servicio"
}

export function QuotationPriceRefreshDialog({
  quotationId,
  onClose,
  onApplied,
}: Props) {
  const [phase, setPhase] = useState<"loading" | "running" | "review" | "applying" | "error">("loading")
  const [quotationNumber, setQuotationNumber] = useState<string | null>(null)
  const [run, setRun] = useState<RefreshRun | null>(null)
  const [error, setError] = useState<RequestErrorState | null>(null)
  const [decisions, setDecisions] = useState<Record<string, RefreshAction>>({})
  const [candidateIds, setCandidateIds] = useState<Record<string, string>>({})
  const [saleTotals, setSaleTotals] = useState<Record<string, string>>({})
  const [editedSaleTotals, setEditedSaleTotals] = useState<Record<string, boolean>>({})
  const [confirmedOptions, setConfirmedOptions] = useState<Record<string, boolean>>({})
  const [attempt, setAttempt] = useState(0)
  const activeQuotationRef = useRef<string | null>(null)
  const idempotencyKeyRef = useRef("")

  useEffect(() => {
    if (!quotationId) {
      activeQuotationRef.current = null
      idempotencyKeyRef.current = ""
      return
    }

    if (activeQuotationRef.current !== quotationId) {
      activeQuotationRef.current = quotationId
      idempotencyKeyRef.current = makeIdempotencyKey()
    } else if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = makeIdempotencyKey()
    }

    const controller = new AbortController()
    let active = true

    setPhase("loading")
    setQuotationNumber(null)
    setRun(null)
    setError(null)
    setDecisions({})
    setCandidateIds({})
    setSaleTotals({})
    setEditedSaleTotals({})
    setConfirmedOptions({})

    const load = async () => {
      try {
        const quotationResponse = await fetch("/api/quotations/" + encodeURIComponent(quotationId), {
          cache: "no-store",
          signal: controller.signal,
        })
        const quotationPayload = await requestPayload(quotationResponse)
        if (!active) return
        const quotation = quotationPayload?.data
        if (!quotation?.updated_at) {
          throw new Error("La cotización no tiene una versión válida para actualizar")
        }
        setQuotationNumber(quotation.quotation_number || null)

        const startResponse = await fetch(
          "/api/quotations/" + encodeURIComponent(quotationId) + "/price-refresh",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expected_updated_at: quotation.updated_at,
              idempotency_key: idempotencyKeyRef.current,
            }),
            signal: controller.signal,
          }
        )
        let currentRun = extractRun(await requestPayload(startResponse))
        if (!currentRun) throw new Error("El servidor no devolvió el resultado de la actualización")

        while (currentRun.status === "RUNNING") {
          if (!active) return
          setRun(currentRun)
          setPhase("running")
          await waitForPoll(controller.signal, 1200)
          const runResponse = await fetch(
            "/api/quotations/" + encodeURIComponent(quotationId)
              + "/price-refresh/" + encodeURIComponent(currentRun.id),
            { cache: "no-store", signal: controller.signal }
          )
          currentRun = extractRun(await requestPayload(runResponse))
          if (!currentRun) throw new Error("No se pudo recuperar el resultado de la actualización")
        }

        if (!active) return
        setRun(currentRun)
        if (currentRun.status === "FAILED" || currentRun.status === "STALE") {
          setError({
            message: currentRun.error
              || (currentRun.status === "STALE"
                ? "La cotización cambió durante la consulta. Volvé a intentarlo."
                : "No se pudieron consultar los servicios de la cotización."),
            code: currentRun.status,
          })
          setPhase("error")
          return
        }
        if (currentRun.status !== "REVIEW_REQUIRED") {
          throw new Error("La actualización terminó en un estado no esperado")
        }

        const initialSaleTotals: Record<string, string> = {}
        for (const option of currentRun.summary.options || []) {
          if (option.manual_total_requires_confirmation) {
            initialSaleTotals[option.option_id] = String(
              option.suggested_customer_total ?? option.current_customer_total ?? ""
            )
          }
        }
        setSaleTotals(initialSaleTotals)
        setPhase("review")
      } catch (requestError: any) {
        if (!active || requestError?.name === "AbortError") return
        setError({
          message: requestError?.message || "No se pudo actualizar la cotización",
          code: requestError?.code,
        })
        setPhase("error")
      }
    }

    void load()
    return () => {
      active = false
      controller.abort()
    }
  }, [quotationId, attempt])

  const requiredItems = useMemo(
    () => (run?.items || []).filter(item => item.requires_decision),
    [run]
  )
  const requiredOptions = useMemo(
    () => (run?.summary.options || []).filter(option => option.manual_total_requires_confirmation),
    [run]
  )

  const selectedOptionCosts = useMemo(() => {
    const costs: Record<string, number> = {}
    for (const item of run?.items || []) {
      const action = decisions[item.line_id]
      let unitCost = Number(item.current.cost_amount || 0)
      if (action === "USE_REFRESHED" && item.refreshed) {
        unitCost = Number(item.refreshed.cost_amount || 0)
      } else if (action === "USE_REPLACEMENT") {
        const candidate = item.candidates?.find(entry => entry.id === candidateIds[item.line_id])
        if (candidate) unitCost = Number(candidate.cost_amount || 0)
      }
      costs[item.option_id] = (costs[item.option_id] || 0)
        + unitCost * Math.max(0, Number(item.quantity ?? 1))
    }
    return costs
  }, [candidateIds, decisions, run])

  useEffect(() => {
    if (!run) return
    setSaleTotals(current => {
      let changed = false
      const next = { ...current }
      for (const option of run.summary.options || []) {
        if (!option.manual_total_requires_confirmation || editedSaleTotals[option.option_id]) continue
        const selectedCost = selectedOptionCosts[option.option_id] ?? Number(option.current_cost_total || 0)
        const suggested = Math.max(
          selectedCost,
          Number(option.current_customer_total || 0)
            + Math.max(0, selectedCost - Number(option.current_cost_total || 0))
        )
        const value = String(Math.round((suggested + Number.EPSILON) * 100) / 100)
        if (next[option.option_id] !== value) {
          next[option.option_id] = value
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [editedSaleTotals, run, selectedOptionCosts])

  const decisionsValid = requiredItems.every(item => {
    const action = decisions[item.line_id]
    if (!action || !item.allowed_actions.includes(action)) return false
    if (action === "USE_REPLACEMENT") return Boolean(candidateIds[item.line_id])
    return true
  })
  const optionDecisionsValid = requiredOptions.every(option => {
    const saleTotal = Number(saleTotals[option.option_id])
    const selectedCost = selectedOptionCosts[option.option_id] ?? Number(option.current_cost_total || 0)
    return confirmedOptions[option.option_id]
      && Number.isFinite(saleTotal)
      && saleTotal > 0
      && saleTotal >= selectedCost
  })
  const canApply = phase === "review"
    && Boolean(run)
    && (run?.apply_blockers?.length || 0) === 0
    && decisionsValid
    && optionDecisionsValid

  const applyRefresh = async () => {
    if (!quotationId || !run || !canApply) return
    const expectedQuotationUpdatedAt = run.quotation_updated_at || run.source_updated_at
    if (!expectedQuotationUpdatedAt || !run.updated_at) {
      toast.error("La actualización no tiene una versión válida para aplicar")
      return
    }

    setPhase("applying")
    setError(null)
    try {
      const response = await fetch(
        "/api/quotations/" + encodeURIComponent(quotationId)
          + "/price-refresh/" + encodeURIComponent(run.id) + "/apply",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expected_updated_at: expectedQuotationUpdatedAt,
            expected_run_updated_at: run.updated_at,
            decisions: requiredItems.map(item => {
              const action = decisions[item.line_id]
              return {
                line_id: item.line_id,
                action,
                ...(action === "USE_REPLACEMENT"
                  ? { candidate_id: candidateIds[item.line_id] }
                  : {}),
              }
            }),
            option_decisions: (run.summary.options || []).map(option => ({
              option_id: option.option_id,
              sale_total: option.manual_total_requires_confirmation
                ? Number(saleTotals[option.option_id])
                : null,
              confirmed: true,
            })),
          }),
        }
      )
      await requestPayload(response)
      toast.success("Precios actualizados. Se generó una nueva versión del documento.")
      try {
        await onApplied()
      } catch {
        toast.warning("La cotización se actualizó, pero no se pudo refrescar el listado.")
      }
      onClose()
    } catch (applyError: any) {
      const code = applyError?.code
      setError({
        message: code === "STALE_QUOTATION" || code === "STALE_RUN"
          ? "La cotización cambió mientras la revisabas. Volvé a consultar antes de aplicar."
          : applyError?.message || "No se pudo aplicar la actualización",
        code,
      })
      setPhase("error")
    }
  }

  const retry = () => {
    idempotencyKeyRef.current = makeIdempotencyKey()
    setAttempt(current => current + 1)
  }

  const discardAndRetry = async () => {
    if (!quotationId || !run || run.status !== "REVIEW_REQUIRED") return
    setPhase("running")
    setError(null)
    try {
      const response = await fetch(
        "/api/quotations/" + encodeURIComponent(quotationId)
          + "/price-refresh/" + encodeURIComponent(run.id),
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expected_run_updated_at: run.updated_at }),
        }
      )
      await requestPayload(response)
      idempotencyKeyRef.current = makeIdempotencyKey()
      setAttempt(current => current + 1)
    } catch (discardError: any) {
      setError({
        message: discardError?.message || "No se pudo descartar la propuesta anterior",
        code: discardError?.code,
      })
      setPhase("error")
    }
  }

  const partialDecisionCount = requiredItems.filter(
    item => decisions[item.line_id] === "KEEP_CURRENT"
  ).length
  const summary = run?.summary

  return (
    <Dialog
      open={quotationId !== null}
      onOpenChange={(open) => {
        if (!open && phase !== "applying") onClose()
      }}
    >
      <DialogContent className="flex max-h-[92vh] max-w-[95vw] flex-col overflow-hidden p-0 sm:max-w-[820px]">
        <DialogHeader className="border-b border-border/60 px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <CircleDollarSign className="h-4 w-4" />
            </span>
            <span>
              Actualizar precio y disponibilidad
              {quotationNumber ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {quotationNumber}
                </span>
              ) : null}
            </span>
          </DialogTitle>
          <DialogDescription>
            Revisá lo que cambió antes de emitir una nueva versión para el pasajero.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {(phase === "loading" || phase === "running") && (
            <div
              className="flex min-h-[300px] flex-col items-center justify-center text-center"
              role="status"
              aria-live="polite"
            >
              <span className="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-primary/15 bg-primary/5">
                <SearchCheck className="h-7 w-7 text-primary" />
                <Loader2 className="absolute -right-1 -top-1 h-5 w-5 animate-spin text-primary" />
              </span>
              <p className="font-medium">Consultando precio y disponibilidad…</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Estamos revisando todos los servicios de la cotización. Podés cerrar esta ventana si no querés esperar.
              </p>
            </div>
          )}

          {phase === "error" && error && (
            <div className="flex min-h-[280px] flex-col justify-center gap-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No se pudo completar la actualización</AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
              <div className="flex justify-center">
                <Button variant="outline" onClick={retry}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Volver a consultar
                </Button>
              </div>
            </div>
          )}

          {(phase === "review" || phase === "applying") && run && summary && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 divide-x rounded-xl border border-border/60 bg-muted/25">
                <div className="px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Servicios</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">{summary.item_count}</p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Con cambios</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-primary">
                    {summary.price_changed_count + summary.replacement_count}
                  </p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sin validar</p>
                  <p className={
                    "mt-0.5 text-lg font-semibold tabular-nums "
                    + (summary.unavailable_count + summary.not_refreshable_count + summary.failed_count > 0
                      ? "text-destructive"
                      : "text-success")
                  }>
                    {summary.unavailable_count + summary.not_refreshable_count + summary.failed_count}
                  </p>
                </div>
              </div>

              {(summary.options || []).map(option => {
                const optionItems = run.items.filter(item => item.option_id === option.option_id)
                const selectedCostTotal = selectedOptionCosts[option.option_id]
                  ?? Number(option.current_cost_total)
                const costDelta = selectedCostTotal - Number(option.current_cost_total)
                const saleValue = Number(saleTotals[option.option_id])
                const suggestedSaleTotal = Math.max(
                  selectedCostTotal,
                  Number(option.current_customer_total)
                    + Math.max(0, selectedCostTotal - Number(option.current_cost_total))
                )
                const selectedSaleTotal = Number.isFinite(saleValue) ? saleValue : suggestedSaleTotal
                const saleBelowCost = option.manual_total_requires_confirmation
                  && Number.isFinite(saleValue)
                  && saleValue < selectedCostTotal

                return (
                  <section
                    key={option.option_id}
                    className="overflow-hidden rounded-xl border border-border/60 bg-card"
                    aria-labelledby={"refresh-option-" + option.option_id}
                  >
                    <div className="border-b border-border/50 bg-muted/20 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <h3 id={"refresh-option-" + option.option_id} className="font-medium">
                          {option.option_title}
                        </h3>
                        <span className={
                          "text-xs font-medium tabular-nums "
                          + (costDelta > 0
                            ? "text-destructive"
                            : costDelta < 0
                              ? "text-success"
                              : "text-muted-foreground")
                        }>
                          {costDelta === 0
                            ? "Costo sin cambios"
                            : (costDelta > 0 ? "+" : "−")
                              + formatMoney(Math.abs(costDelta), summary.currency)}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-lg bg-background/80 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Costo efectivo</p>
                          <div className="mt-1 flex items-center gap-1.5 text-sm font-medium tabular-nums">
                            <span>{formatMoney(option.current_cost_total, summary.currency)}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span>{formatMoney(selectedCostTotal, summary.currency)}</span>
                          </div>
                        </div>
                        <div className="rounded-lg bg-background/80 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Precio pasajero</p>
                          <div className="mt-1 flex items-center gap-1.5 text-sm font-medium tabular-nums">
                            <span>{formatMoney(option.current_customer_total, summary.currency)}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span>{formatMoney(selectedSaleTotal, summary.currency)}</span>
                          </div>
                        </div>
                        <div className="rounded-lg bg-background/80 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Margen</p>
                          <div className="mt-1 flex items-center gap-1.5 text-sm font-medium tabular-nums">
                            <span>{formatMoney(option.current_margin, summary.currency)}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span>{formatMoney(selectedSaleTotal - selectedCostTotal, summary.currency)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="divide-y divide-border/50">
                      {optionItems.map(item => {
                        const presentation = OUTCOME_PRESENTATION[item.outcome]
                        const selectedAction = decisions[item.line_id]
                        const costCurrency = item.refreshed?.currency || item.current.currency || summary.currency
                        const itemDelta = item.delta_amount
                          ?? (item.refreshed
                            ? Number(item.refreshed.cost_amount) - Number(item.current.cost_amount)
                            : null)
                        const selectedCandidate = item.candidates?.find(
                          candidate => candidate.id === candidateIds[item.line_id]
                        )
                        const visibleDifferences = selectedAction === "USE_REPLACEMENT"
                          ? selectedCandidate?.differences || item.differences || []
                          : item.differences || []

                        return (
                          <div key={item.line_id} className="space-y-3 px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {itemTypeLabel(item.item_type)}
                                </p>
                                <p className="truncate text-sm font-medium">{item.label}</p>
                              </div>
                              <Badge variant="outline" className={"shrink-0 text-[10px] " + presentation.className}>
                                {presentation.label}
                              </Badge>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                              <span className="text-muted-foreground">Costo efectivo:</span>
                              <span className="font-medium tabular-nums">
                                {formatMoney(item.current.cost_amount, item.current.currency || summary.currency)}
                              </span>
                              {item.refreshed && (
                                <>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                  <span className="font-medium tabular-nums">
                                    {formatMoney(item.refreshed.cost_amount, costCurrency)}
                                  </span>
                                  {itemDelta !== null && Number(itemDelta) !== 0 && (
                                    <span className={
                                      "font-medium tabular-nums "
                                      + (Number(itemDelta) > 0 ? "text-destructive" : "text-success")
                                    }>
                                      ({Number(itemDelta) > 0 ? "+" : "−"}
                                      {formatMoney(Math.abs(Number(itemDelta)), costCurrency)})
                                    </span>
                                  )}
                                </>
                              )}
                            </div>

                            {visibleDifferences.length > 0 ? (
                              <ul className="space-y-1 rounded-lg border border-accent-coral/20 bg-accent-coral/5 px-3 py-2 text-xs text-foreground/80">
                                {visibleDifferences.map((change, index) => (
                                  <li key={index} className="flex gap-2">
                                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-accent-coral" />
                                    <span>
                                      {differenceFieldLabel(change.field)}: {formatDifferenceValue(change.before)} → {formatDifferenceValue(change.after)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : Array.isArray(item.condition_changes) && item.condition_changes.length > 0 ? (
                              <ul className="space-y-1 rounded-lg border border-accent-coral/20 bg-accent-coral/5 px-3 py-2 text-xs text-foreground/80">
                                {item.condition_changes.map((change, index) => (
                                  <li key={index} className="flex gap-2">
                                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-accent-coral" />
                                    <span>{change}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}

                            {item.error?.message && (
                              <div className="flex gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-foreground/80">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                                <span>
                                  {item.error.message}
                                  {item.error.retryable ? " Podés volver a intentar la consulta." : ""}
                                </span>
                              </div>
                            )}

                            {Array.isArray(item.candidates) && item.candidates.length > 0 && (
                              <div className="space-y-1.5">
                                <Label htmlFor={"candidate-" + item.line_id} className="text-xs">
                                  Alternativa
                                </Label>
                                <Select
                                  value={candidateIds[item.line_id] || ""}
                                  onValueChange={candidateId => {
                                    setCandidateIds(current => ({ ...current, [item.line_id]: candidateId }))
                                    if (item.allowed_actions.includes("USE_REPLACEMENT")) {
                                      setDecisions(current => ({ ...current, [item.line_id]: "USE_REPLACEMENT" }))
                                    }
                                  }}
                                  disabled={phase === "applying"}
                                >
                                  <SelectTrigger id={"candidate-" + item.line_id}>
                                    <SelectValue placeholder="Seleccionar alternativa" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {item.candidates.map(candidate => (
                                      <SelectItem key={candidate.id} value={candidate.id}>
                                        {candidate.label} · {formatMoney(candidate.cost_amount, candidate.currency)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}

                            {item.requires_decision && (
                              <RadioGroup
                                value={selectedAction || ""}
                                onValueChange={value => {
                                  setDecisions(current => ({
                                    ...current,
                                    [item.line_id]: value as RefreshAction,
                                  }))
                                }}
                                className="flex flex-wrap gap-2"
                                aria-label={"Decisión para " + item.label}
                                disabled={phase === "applying"}
                              >
                                {item.allowed_actions.map(action => {
                                  const id = "refresh-" + item.line_id + "-" + action
                                  return (
                                    <Label
                                      key={action}
                                      htmlFor={id}
                                      className={
                                        "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors "
                                        + (selectedAction === action
                                          ? "border-primary bg-primary/5 text-primary"
                                          : "border-border/70 hover:bg-muted/50")
                                      }
                                    >
                                      <RadioGroupItem id={id} value={action} />
                                      {actionLabel(action, item.outcome)}
                                    </Label>
                                  )
                                })}
                              </RadioGroup>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {option.manual_total_requires_confirmation && (
                      <div className="space-y-3 border-t border-primary/15 bg-primary/5 px-4 py-3">
                        <div className="grid gap-3 sm:grid-cols-[1fr_190px] sm:items-end">
                          <div>
                            <Label htmlFor={"sale-total-" + option.option_id}>
                              Precio final al pasajero ({summary.currency})
                            </Label>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Esta opción tenía un precio manual. Confirmalo o ajustalo antes de aplicar.
                            </p>
                          </div>
                          <Input
                            id={"sale-total-" + option.option_id}
                            type="number"
                            min={selectedCostTotal}
                            step="0.01"
                            value={saleTotals[option.option_id] || ""}
                            onChange={event => {
                              setSaleTotals(current => ({
                                ...current,
                                [option.option_id]: event.target.value,
                              }))
                              setEditedSaleTotals(current => ({
                                ...current,
                                [option.option_id]: true,
                              }))
                              setConfirmedOptions(current => ({
                                ...current,
                                [option.option_id]: false,
                              }))
                            }}
                            disabled={phase === "applying"}
                            aria-invalid={saleBelowCost}
                          />
                        </div>
                        {saleBelowCost && (
                          <p className="text-xs text-destructive">
                            El precio al pasajero no puede quedar por debajo del costo actualizado.
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={"confirm-sale-" + option.option_id}
                            checked={Boolean(confirmedOptions[option.option_id])}
                            onCheckedChange={checked => {
                              setConfirmedOptions(current => ({
                                ...current,
                                [option.option_id]: checked === true,
                              }))
                            }}
                            disabled={phase === "applying" || saleBelowCost}
                          />
                          <Label htmlFor={"confirm-sale-" + option.option_id} className="text-xs font-normal">
                            Confirmo este precio de venta
                          </Label>
                        </div>
                      </div>
                    )}
                  </section>
                )
              })}

              {partialDecisionCount > 0 && (
                <Alert className="border-accent-coral/30 bg-accent-coral/5">
                  <AlertTriangle className="h-4 w-4 text-accent-coral" />
                  <AlertTitle>Actualización parcial</AlertTitle>
                  <AlertDescription>
                    {partialDecisionCount} {partialDecisionCount === 1 ? "servicio quedará" : "servicios quedarán"} con la información anterior y sin validar.
                  </AlertDescription>
                </Alert>
              )}

              {(run?.apply_blockers || []).map(blocker => (
                <Alert key={blocker.code} className="border-destructive/30 bg-destructive/5">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <AlertTitle>No se puede emitir todavía</AlertTitle>
                  <AlertDescription>{blocker.message}</AlertDescription>
                </Alert>
              ))}

              {!decisionsValid && requiredItems.length > 0 && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
                  <XCircle className="h-3.5 w-3.5" />
                  Resolvé cada servicio marcado antes de aplicar.
                </p>
              )}
              {decisionsValid && optionDecisionsValid && (
                <p className="flex items-center gap-2 text-xs text-success" aria-live="polite">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  La revisión está lista para aplicar.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border/60 bg-muted/15 px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={phase === "applying"}>
            Cerrar
          </Button>
          {phase === "review" && (
            <Button variant="outline" onClick={() => void discardAndRetry()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Descartar y volver a consultar
            </Button>
          )}
          {(phase === "review" || phase === "applying") && (
            <Button onClick={() => void applyRefresh()} disabled={!canApply}>
              {phase === "applying" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileCheck2 className="mr-2 h-4 w-4" />
              )}
              {phase === "applying" ? "Aplicando…" : "Aplicar y emitir nueva versión"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
