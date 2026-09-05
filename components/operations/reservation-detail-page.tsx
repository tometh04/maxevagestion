"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ReservationDetail } from "@/lib/provider-booking/reservations"
import { DetailSection, Passengers, ReservationStatus, reservationDate } from "./reservation-parts"

export function ReservationDetailPage({ id }: { id: string }) {
  const [data, setData] = useState<ReservationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState("")
  const active = useRef(true)
  const requestVersion = useRef(0)
  const attempted = useRef("")
  const busy = useRef(false)
  const load = useCallback(async () => {
    const version = ++requestVersion.current
    setLoading(true)
    try {
      const response = await fetch(`/api/operations/reservations/${encodeURIComponent(id)}`, {
        cache: "no-store"
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error)
      if (active.current && version === requestVersion.current) {
        setData(payload.data)
        setError("")
      }
    } catch (cause) {
      if (active.current && version === requestVersion.current) {
        setData(null)
        setError(cause instanceof Error ? cause.message : "No se pudo cargar la reserva.")
      }
    } finally {
      if (active.current && version === requestVersion.current) setLoading(false)
    }
  }, [id])
  const refresh = useCallback(async () => {
    if (!data || busy.current) return
    busy.current = true
    setSyncing(true)
    try {
      const response = await fetch("/api/operations/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingIds: [data.reservation.booking_id] })
      })
      const payload = await response.json()
      if (!response.ok || payload.data.failed)
        throw new Error(
          "No se pudo actualizar la ficha. Se conserva la última información disponible."
        )
      if (active.current) await load()
    } catch (cause) {
      if (active.current)
        setError(cause instanceof Error ? cause.message : "No se pudo actualizar la reserva.")
    } finally {
      busy.current = false
      if (active.current) setSyncing(false)
    }
  }, [data, load])
  useEffect(() => {
    active.current = true
    void load()
    return () => {
      active.current = false
    }
  }, [load])
  useEffect(() => {
    if (data && attempted.current !== id) {
      attempted.current = id
      void refresh()
    }
  }, [data, id, refresh])
  useEffect(() => {
    if (
      !data ||
      (!["QUEUED", "PROCESSING"].includes(data.reservation.job_status) &&
        !["CREATED", "ONRQ", "on_request", "pending_confirmation"].includes(data.reservation.status))
    )
      return
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, 30_000)
    return () => clearInterval(timer)
  }, [data, refresh])

  const detail = data?.item?.detail
  const row = data?.reservation
  return (
    <div className="space-y-6">
      <Link
        href="/operations/reservations"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Reservas
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {row?.locator ? `Reserva ${row.locator}` : "Detalle de reserva"}
          </h1>
          {row && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <span>
                {row.wholesaler} ·{" "}
                {row.product === "flights"
                  ? "Vuelo"
                  : row.product === "hotels"
                    ? "Hotel"
                    : "Solicitud"}
              </span>
              <ReservationStatus status={row.status} />
              <Link
                className="text-primary hover:underline"
                href={`/operations/${row.operation_id}`}
              >
                {row.file_code || "Ver operación"}
              </Link>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          disabled={loading || syncing}
          onClick={() => void (data ? refresh() : load())}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${syncing ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
          {syncing ? "Actualizando…" : "Actualizar ficha"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 p-4 text-sm">
          {error}
        </p>
      )}
      {loading && !data ? (
        <div className="space-y-5" aria-label="Cargando reserva">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        data &&
        row && (
          <>
            <p className="text-xs text-muted-foreground">
              Última consulta: {reservationDate(row.synced_at)}
              {data.item?.detail_checked_at
                ? ` · Ficha del mayorista: ${reservationDate(data.item.detail_checked_at)}`
                : ""}
            </p>
            {(!detail || data.item?.detail_unavailable) && (
              <p role="status" className="rounded-md border bg-muted/40 p-4 text-sm">
                {detail
                  ? "No se pudo obtener una ficha más reciente del mayorista. Se muestra la última disponible."
                  : row.external_id
                    ? "La reserva fue creada. El detalle del mayorista todavía no está disponible; podés volver a actualizar la ficha."
                    : "Esta solicitud todavía no tiene una reserva creada en el mayorista."}
              </p>
            )}
            <Tabs defaultValue="general">
              <TabsList className="h-auto w-full flex-wrap justify-start">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="passengers">Pasajeros y titular</TabsTrigger>
                <TabsTrigger value="services">Servicios</TabsTrigger>
                <TabsTrigger value="financial">Importes y condiciones</TabsTrigger>
                <TabsTrigger value="extras">Adicionales</TabsTrigger>
                <TabsTrigger value="history">Historial</TabsTrigger>
              </TabsList>
              <TabsContent value="general" className="space-y-6 pt-4">
                <DetailSection
                  title="Reserva en el mayorista"
                  value={
                    detail
                      ? {
                          id: detail.id,
                          provider: detail.provider,
                          locator: detail.locator,
                          reference: detail.reference,
                          providerBookingId: detail.providerBookingId,
                          thirdLocator: detail.thirdLocator,
                          bookingGroupId: detail.bookingGroupId,
                          agencyName: detail.agencyName,
                          agencyId: detail.agencyId,
                          lastTicketDate: detail.lastTicketDate,
                          requiresImmediateTicketing: detail.requiresImmediateTicketing
                        }
                      : { id: row.external_id, locator: row.locator }
                  }
                />
                <DetailSection
                  title="Gestión en Vibook"
                  value={{
                    Agencia: row.agency_name,
                    Vendedor: row.seller_name,
                    Operación: row.file_code,
                    "ID de cotización": row.quotation_id
                  }}
                />
              </TabsContent>
              <TabsContent value="passengers" className="space-y-8 pt-4">
                <DetailSection
                  title="Titular enviado al reservar"
                  value={detail?.holderRequest ?? data.request?.holder}
                />
                <DetailSection
                  title="Titular devuelto por el proveedor"
                  value={detail?.holderProviderEcho ?? detail?.holderEcho}
                />
                <Passengers
                  title="Pasajeros enviados al reservar"
                  people={
                    detail?.travellersRequest ?? detail?.guestsRequest ?? data.request?.travellers
                  }
                />
                <Passengers
                  title="Pasajeros devueltos por el proveedor"
                  people={detail?.travellersProviderEcho ?? detail?.guestsProviderEcho}
                />
                {detail?.travellersEcho && !detail.travellersProviderEcho && (
                  <Passengers
                    title="Pasajeros registrados en el mayorista"
                    people={detail.travellersEcho}
                  />
                )}
                {detail?.guests && !detail.guestsRequest && (
                  <Passengers
                    title="Huéspedes registrados en el mayorista"
                    people={detail.guests}
                  />
                )}
              </TabsContent>
              <TabsContent value="services" className="space-y-6 pt-4">
                {row.product === "flights" ? (
                  <DetailSection title="Itinerario de vuelo" value={detail?.itinerary} />
                ) : (
                  <DetailSection
                    title="Alojamiento"
                    value={
                      detail
                        ? {
                            hotelName: detail.hotelName,
                            hotelCode: detail.hotelCode,
                            chainCode: detail.chainCode,
                            checkIn: detail.checkIn,
                            checkOut: detail.checkOut,
                            roomTypeCode: detail.roomTypeCode,
                            ratePlanCode: detail.ratePlanCode,
                            mealPlanCodes: detail.mealPlanCodes,
                            rooms: detail.rooms
                          }
                        : null
                    }
                  />
                )}
                <DetailSection
                  title="Requisitos del proveedor"
                  value={detail?.bookingRequirements}
                />
              </TabsContent>
              <TabsContent value="financial" className="space-y-6 pt-4">
                <DetailSection
                  title="Importe de la reserva"
                  value={
                    detail
                      ? {
                          priceTotal: detail.priceTotal,
                          priceCurrency: detail.priceCurrency,
                          paymentMethod: detail.paymentMethod,
                          guaranteePayment: detail.guaranteePayment
                        }
                      : null
                  }
                />
                {data.item?.previous_price && (
                  <DetailSection title="Precio anterior" value={data.item.previous_price} />
                )}
                {data.item?.current_price && (
                  <DetailSection
                    title="Precio informado al intentar reservar"
                    value={data.item.current_price}
                  />
                )}
                <DetailSection
                  title="Desglose tarifario e impuestos"
                  value={detail?.fareBreakdown}
                />
                <DetailSection title="Condiciones de pago" value={detail?.paymentFlags} />
                <DetailSection title="Medios de pago informados" value={detail?.paymentMethods} />
                <DetailSection
                  title="Cancelación"
                  value={
                    detail
                      ? {
                          cancelPoliciesSnapshot: detail.cancelPoliciesSnapshot,
                          cancellationCost: detail.cancellationCost
                        }
                      : null
                  }
                />
              </TabsContent>
              <TabsContent value="extras" className="space-y-6 pt-4">
                <DetailSection
                  title="Servicios adicionales del mayorista"
                  value={detail?.manualServices}
                />
                <DetailSection
                  title="Totales con adicionales"
                  value={
                    detail
                      ? {
                          servicesSubtotal: detail.servicesSubtotal,
                          compositeTotal: detail.compositeTotal,
                          fxNote: detail.fxNote
                        }
                      : null
                  }
                />
              </TabsContent>
              <TabsContent value="history" className="space-y-6 pt-4">
                <DetailSection
                  title="Fechas de la reserva"
                  value={{
                    "Solicitud en Vibook": reservationDate(row.created_at),
                    "Creación en el mayorista": reservationDate(detail?.createdAt),
                    Confirmación: reservationDate(detail?.confirmedAt),
                    Cancelación: reservationDate(detail?.cancelledAt),
                    "Última ficha recibida": reservationDate(data.item?.detail_checked_at)
                  }}
                />
              </TabsContent>
            </Tabs>
          </>
        )
      )}
    </div>
  )
}
