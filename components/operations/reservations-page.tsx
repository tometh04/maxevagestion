"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import type { ReservationList } from "@/lib/provider-booking/reservations"
import { ReservationStatus, reservationDate, reservationStatuses } from "./reservation-parts"

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
export function ReservationsPage({
  initial,
  initialError = ""
}: {
  initial: ReservationList
  initialError?: string
}) {
  const [data, setData] = useState(initial)
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [filters, setFilters] = useState({ q: "", product: "", status: "", from: "", to: "" })
  const query = useRef("")
  const abort = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const busy = useRef(false)
  const attempted = useRef(new Set<string>())

  const load = useCallback(async (page = 1) => {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/operations/reservations?${query.current}&page=${page}`, {
        signal: controller.signal,
        cache: "no-store"
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error)
      if (!controller.signal.aborted && mounted.current) setData(payload.data)
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current)
        setError(cause instanceof Error ? cause.message : "No se pudieron cargar las reservas.")
    } finally {
      if (!controller.signal.aborted && mounted.current) setLoading(false)
    }
  }, [])

  const refresh = useCallback(
    async (ids?: string[]) => {
      if (busy.current) return
      busy.current = true
      setSyncing(true)
      let failed = 0
      try {
        const jobs = ids ?? Array.from(new Set(data.rows.map((row) => row.booking_id)))
        for (let index = 0; index < jobs.length && mounted.current; index += 10) {
          const response = await fetch("/api/operations/reservations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookingIds: jobs.slice(index, index + 10) })
          })
          const payload = await response.json()
          if (!response.ok) throw new Error(payload.error)
          failed += payload.data.failed + (payload.data.unavailable ?? 0)
        }
        if (mounted.current) {
          await load(data.page)
          if (failed)
            setError(
              "Algunas reservas no pudieron actualizarse. Se muestra la última información disponible."
            )
        }
      } catch (cause) {
        if (mounted.current)
          setError(
            cause instanceof Error ? cause.message : "No se pudieron actualizar las reservas."
          )
      } finally {
        busy.current = false
        if (mounted.current) setSyncing(false)
      }
    },
    [data.rows, data.page, load]
  )

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      abort.current?.abort()
    }
  }, [])
  useEffect(() => {
    const ids = Array.from(
      new Set(
        data.rows
          .filter(
            (row) =>
              !attempted.current.has(row.booking_id) &&
              (!row.synced_at || Date.now() - new Date(row.synced_at).getTime() > 300_000)
          )
          .map((row) => row.booking_id)
      )
    )
    if (ids.length && !busy.current) {
      ids.forEach((id) => attempted.current.add(id))
      void refresh(ids)
    }
  }, [data.rows, refresh])
  useEffect(() => {
    const pending = Array.from(
      new Set(
        data.rows
          .filter(
            (row) =>
              ["QUEUED", "PROCESSING"].includes(row.job_status) ||
              ["CREATED", "ONRQ", "on_request", "pending_confirmation"].includes(row.status)
          )
          .map((row) => row.booking_id)
      )
    )
    if (!pending.length) return
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(pending)
    }, 30_000)
    return () => clearInterval(timer)
  }, [data.rows, refresh])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reservas</h1>
          <p className="text-sm text-muted-foreground">{data.total} registros de mayoristas</p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={syncing || loading}>
          <RefreshCw
            className={`mr-2 h-4 w-4 ${syncing ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
          {syncing ? "Actualizando…" : "Actualizar"}
        </Button>
      </div>
      <form
        className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault()
          query.current = new URLSearchParams(
            Object.entries(filters).filter(([, value]) => value)
          ).toString()
          void load()
        }}
      >
        <div className="sm:col-span-2">
          <Label htmlFor="reservation-search">Buscar reserva</Label>
          <Input
            id="reservation-search"
            placeholder="Localizador, pasajero, hotel o file"
            value={filters.q}
            onChange={(event) => setFilters({ ...filters, q: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="reservation-product">Servicio</Label>
          <select
            id="reservation-product"
            className={selectClass}
            value={filters.product}
            onChange={(event) => setFilters({ ...filters, product: event.target.value })}
          >
            <option value="">Todos</option>
            <option value="flights">Vuelos</option>
            <option value="hotels">Hoteles</option>
          </select>
        </div>
        <div>
          <Label htmlFor="reservation-status">Estado</Label>
          <select
            id="reservation-status"
            className={selectClass}
            value={filters.status}
            onChange={(event) => setFilters({ ...filters, status: event.target.value })}
          >
            <option value="">Todos</option>
            {Object.entries(reservationStatuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
                {["CNFD", "confirmed"].includes(value)
                  ? value === "CNFD"
                    ? " (vuelo)"
                    : " (hotel)"
                  : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="reservation-from">Creada desde</Label>
          <Input
            id="reservation-from"
            type="date"
            value={filters.from}
            onChange={(event) => setFilters({ ...filters, from: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="reservation-to">Creada hasta</Label>
          <Input
            id="reservation-to"
            type="date"
            value={filters.to}
            onChange={(event) => setFilters({ ...filters, to: event.target.value })}
          />
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <Button type="submit" disabled={loading || syncing}>
            Buscar
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={loading || syncing}
            onClick={() => {
              setFilters({ q: "", product: "", status: "", from: "", to: "" })
              query.current = ""
              void load()
            }}
          >
            Limpiar filtros
          </Button>
        </div>
      </form>
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 p-4 text-sm"
        >
          <p>{error}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || syncing}
            onClick={() => void refresh()}
          >
            Reintentar
          </Button>
        </div>
      )}
      <div className="rounded-md border" aria-busy={loading}>
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "Reserva",
                "Estado",
                "Pasajeros",
                "Servicio y viaje",
                "Importe",
                "Agencia / vendedor",
                "Operación",
                "Creación / emisión"
              ].map((label) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 5 }, (_, index) => (
                  <TableRow key={index}>
                    {Array.from({ length: 8 }, (_, cell) => (
                      <TableCell key={cell}>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {row.item_id ? <Link
                        className="font-medium text-primary underline-offset-4 hover:underline"
                        href={`/operations/reservations/${row.id}`}
                      >
                        {row.locator || row.external_id || "Ver solicitud"}
                      </Link> : <Button variant="link" className="h-auto p-0" disabled={syncing} onClick={() => void refresh([row.booking_id])}>Actualizar solicitud</Button>}
                      <p className="text-xs text-muted-foreground">
                        {row.wholesaler}
                        {row.reference ? ` · ${row.reference}` : ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      <ReservationStatus status={row.status} />
                    </TableCell>
                    <TableCell className="min-w-40 max-w-64">
                      <p>{row.contact_name || "Titular sin informar"}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.passenger_count != null ? `${row.passenger_count} pasajeros · ` : ""}
                        {row.passengers_summary || "Sin detalle"}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-40">
                      <p>
                        {row.product === "flights"
                          ? "Vuelo"
                          : row.product === "hotels"
                            ? "Hotel"
                            : "En proceso"}
                        {row.destination ? ` · ${row.destination}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {reservationDate(row.travel_date)}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {row.price_total
                        ? `${row.price_currency ?? ""} ${row.price_total}`
                        : "Sin informar"}
                    </TableCell>
                    <TableCell>
                      <p>{row.agency_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.seller_name || "Sin vendedor"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Link
                        className="text-primary hover:underline"
                        href={`/operations/${row.operation_id}`}
                      >
                        {row.file_code || "Ver operación"}
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-40 text-xs">
                      <p>{reservationDate(row.created_at)}</p>
                      {row.last_ticket_date && (
                        <p className="mt-1 font-medium">
                          Emitir antes de {reservationDate(row.last_ticket_date)}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            {!loading && !data.rows.length && (
              <TableRow>
                <TableCell colSpan={8} className="h-40 text-center">
                  <p className="font-medium">
                    {query.current
                      ? "No hay reservas con estos filtros"
                      : "Todavía no hay reservas"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {query.current
                      ? "Probá con otro localizador o rango de fechas."
                      : "Las solicitudes de «Convertir y reservar» aparecerán acá con su estado."}
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p aria-live="polite">
          {data.total
            ? `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} de ${data.total}`
            : "0 registros"}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={data.page === 1 || loading || syncing}
            onClick={() => void load(data.page - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            disabled={data.page * data.pageSize >= data.total || loading || syncing}
            onClick={() => void load(data.page + 1)}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  )
}
