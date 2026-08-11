"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { Search, X, Download, Loader2, Hotel } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"

type SummaryRow = { hotel: string; reservas: number; montoUsd: number }
type BookingRow = {
  source: "operation" | "leg"
  operationId: string
  fileCode: string | null
  hotelName: string | null
  reservationCode: string | null
  checkinDate: string | null
  checkoutDate: string | null
  departureDate: string | null
  effectiveDate: string | null
  customerName: string | null
  sellerName: string | null
  status: string | null
  saleAmount: number
  saleCurrency: string
  saleAmountUsd: number
}

interface Props {
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
}

const usd = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

function fmtDate(d: string | null): string {
  if (!d) return "—"
  const s = d.slice(0, 10)
  const [y, m, day] = s.split("-")
  return y && m && day ? `${day}/${m}/${y}` : s
}

export function HotelBookingsPageClient({ agencies, sellers }: Props) {
  const [hotel, setHotel] = useState("")
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [agencyId, setAgencyId] = useState("ALL")
  const [sellerId, setSellerId] = useState("ALL")

  const [rows, setRows] = useState<BookingRow[]>([])
  const [summary, setSummary] = useState<SummaryRow[]>([])
  // Arranca en loading: al montar se carga el listado completo (sin filtros).
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [searched, setSearched] = useState(false)

  const buildParams = useCallback(() => {
    const p = new URLSearchParams()
    if (hotel.trim()) p.set("hotel", hotel.trim())
    if (dateFrom) p.set("dateFrom", format(dateFrom, "yyyy-MM-dd"))
    if (dateTo) p.set("dateTo", format(dateTo, "yyyy-MM-dd"))
    if (agencyId !== "ALL") p.set("agencyId", agencyId)
    if (sellerId !== "ALL") p.set("sellerId", sellerId)
    return p
  }, [hotel, dateFrom, dateTo, agencyId, sellerId])

  const fetchBookings = useCallback(async (params: URLSearchParams) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/operations/hotel-bookings?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Error al buscar reservas")
      setRows(data.rows || [])
      setSummary(data.summary || [])
      setTruncated(Boolean(data.truncated))
      setSearched(true)
    } catch (err: any) {
      setError(err?.message || "Error al buscar reservas")
      setRows([])
      setSummary([])
    } finally {
      setLoading(false)
    }
  }, [])

  const search = useCallback(() => fetchBookings(buildParams()), [fetchBookings, buildParams])

  // Al abrir la pantalla se lista todo (sin filtros); la búsqueda sólo acota.
  useEffect(() => {
    fetchBookings(new URLSearchParams())
  }, [fetchBookings])

  const exportCsv = useCallback(() => {
    const p = buildParams()
    p.set("format", "csv")
    const a = document.createElement("a")
    a.href = `/api/operations/hotel-bookings?${p.toString()}`
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, [buildParams])

  const clear = useCallback(() => {
    setHotel("")
    setDateFrom(undefined)
    setDateTo(undefined)
    setAgencyId("ALL")
    setSellerId("ALL")
    // Vuelve a mostrar el listado completo.
    fetchBookings(new URLSearchParams())
  }, [fetchBookings])

  const totalReservas = useMemo(
    () => summary.reduce((acc, s) => acc + s.reservas, 0),
    [summary]
  )
  const totalMonto = useMemo(
    () => summary.reduce((acc, s) => acc + s.montoUsd, 0),
    [summary]
  )

  const hasFilters =
    hotel.trim() !== "" || dateFrom || dateTo || agencyId !== "ALL" || sellerId !== "ALL"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reservas por hotel</h1>
        <p className="text-sm text-muted-foreground">
          Se listan todas las reservas con hotel y su código. Filtrá por cadena
          (ej. &ldquo;Iberostar&rdquo;), fechas, agencia o vendedor para acotar.
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Cadena / hotel</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={hotel}
                  onChange={(e) => setHotel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") search()
                  }}
                  placeholder="Iberostar, Barceló…"
                  className="h-9 w-[220px] pl-8"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Desde (check-in)</label>
              <DateInputWithCalendar
                value={dateFrom}
                onChange={(date) => {
                  setDateFrom(date)
                  if (date && dateTo && dateTo < date) setDateTo(undefined)
                }}
                label="Desde"
                className="h-9"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Hasta (check-in)</label>
              <DateInputWithCalendar
                value={dateTo}
                onChange={(date) => {
                  if (date && dateFrom && date < dateFrom) return
                  setDateTo(date)
                }}
                label="Hasta"
                minDate={dateFrom}
                className="h-9"
              />
            </div>

            {agencies.length > 1 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Agencia</label>
                <Select value={agencyId} onValueChange={setAgencyId}>
                  <SelectTrigger className="h-9 min-w-[150px]">
                    <SelectValue placeholder="Agencia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas las agencias</SelectItem>
                    {agencies.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {sellers.length > 1 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Vendedor</label>
                <Select value={sellerId} onValueChange={setSellerId}>
                  <SelectTrigger className="h-9 min-w-[150px]">
                    <SelectValue placeholder="Vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos los vendedores</SelectItem>
                    {sellers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button onClick={search} disabled={loading} className="h-9">
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Buscar
            </Button>

            {hasFilters && (
              <Button variant="ghost" onClick={clear} className="h-9 text-muted-foreground">
                <X className="mr-1 h-4 w-4" />
                Limpiar
              </Button>
            )}

            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={rows.length === 0}
              className="h-9 ml-auto"
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {truncated && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          El resultado es muy grande y se recortó. Acotá el rango de fechas o la cadena para ver todo.
        </div>
      )}

      {loading && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          Cargando reservas…
        </div>
      )}

      {/* Resumen por hotel */}
      {searched && !loading && summary.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Hotel className="h-4 w-4 text-muted-foreground" />
              Resumen por hotel
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {totalReservas} reserva{totalReservas === 1 ? "" : "s"} · {usd.format(totalMonto)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hotel</TableHead>
                  <TableHead className="text-right">Reservas</TableHead>
                  <TableHead className="text-right">Monto (USD)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((s) => (
                  <TableRow key={s.hotel}>
                    <TableCell className="font-medium">{s.hotel}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.reservas}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {s.montoUsd > 0 ? usd.format(s.montoUsd) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tabla de reservas */}
      {searched && !loading && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Reservas {rows.length > 0 && <span className="text-muted-foreground">({rows.length})</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No se encontraron reservas con esos filtros.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hotel</TableHead>
                    <TableHead>Cód. reserva</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Check-out</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Venta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={`${r.operationId}-${r.source}-${i}`}>
                      <TableCell className="font-medium">
                        {r.hotelName || "—"}
                        {r.source === "leg" && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            tramo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.reservationCode || "—"}
                      </TableCell>
                      <TableCell>{r.customerName || "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.fileCode || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDate(r.checkinDate)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDate(r.checkoutDate)}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.sellerName || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {r.saleAmount > 0
                          ? `${r.saleCurrency} ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(r.saleAmount)}`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
