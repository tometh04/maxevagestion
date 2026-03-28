"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Loader2, Plane, Hotel, Bus, Shield, MapPin, Calendar, Users, CheckCircle2, Clock, XCircle, AlertTriangle } from "lucide-react"

interface QuotationOption {
  id: string
  option_number: number
  title: string
  total_amount: number
  is_selected: boolean
  items: QuotationItem[]
}

interface QuotationItem {
  item_type: string
  description: string
  quantity: number
  provider?: string
  hotel_name?: string
  hotel_stars?: number
  room_type?: string
  meal_plan?: string
  checkin_date?: string
  checkout_date?: string
  nights?: number
  airline?: string
  flight_route?: string
  flight_class?: string
}

interface QuotationData {
  quotation_number: string
  destination: string
  origin?: string
  region?: string
  departure_date: string
  return_date?: string
  valid_until: string
  adults: number
  children: number
  infants: number
  currency: string
  status: string
  notes?: string
  terms_and_conditions?: string
  created_at: string
  seller_name: string
  agency_name: string
  options: QuotationOption[]
}

const ITEM_TYPE_CONFIG: Record<string, { label: string; icon: typeof Plane }> = {
  FLIGHT: { label: "Vuelo", icon: Plane },
  ACCOMMODATION: { label: "Hotel", icon: Hotel },
  TRANSFER: { label: "Traslado", icon: Bus },
  INSURANCE: { label: "Asistencia", icon: Shield },
  ACTIVITY: { label: "Excursion", icon: MapPin },
  VISA: { label: "Visa", icon: MapPin },
  OTHER: { label: "Otro", icon: MapPin },
}

const MEAL_PLAN_LABELS: Record<string, string> = {
  SOLO_ALOJAMIENTO: "Solo alojamiento",
  DESAYUNO: "Desayuno incluido",
  MEDIA_PENSION: "Media pension",
  PENSION_COMPLETA: "Pension completa",
  ALL_INCLUSIVE: "All Inclusive",
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  SENT: { label: "Pendiente de revision", color: "bg-blue-100 text-blue-700", icon: Clock },
  PENDING_APPROVAL: { label: "Pendiente de aprobacion", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  APPROVED: { label: "Aceptada", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  REJECTED: { label: "Rechazada", color: "bg-red-100 text-red-700", icon: XCircle },
  EXPIRED: { label: "Vencida", color: "bg-gray-100 text-gray-700", icon: AlertTriangle },
  CONVERTED: { label: "Confirmada", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
}

function formatCurrency(amount: number, currency: string) {
  const prefix = currency === "USD" ? "US$" : "$"
  return `${prefix} ${Number(amount).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr + "T12:00:00")
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })
}

function getRemainingTime(validUntil: string): { text: string; urgent: boolean; expired: boolean } {
  const now = new Date()
  const expiry = new Date(validUntil + "T23:59:59")
  const diff = expiry.getTime() - now.getTime()

  if (diff <= 0) return { text: "Vencida", urgent: false, expired: true }

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (hours < 24) {
    return { text: `Vence en ${hours}h ${minutes}m`, urgent: true, expired: false }
  }

  const days = Math.floor(hours / 24)
  return { text: `Valida por ${days} dia${days > 1 ? "s" : ""} mas`, urgent: false, expired: false }
}

export function PublicQuotationView() {
  const params = useParams()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<QuotationData | null>(null)
  const [branding, setBranding] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        // Cargar cotización y branding en paralelo
        const [quotRes, brandRes] = await Promise.all([
          fetch(`/api/public/quotations/${token}`),
          fetch("/api/public/branding"),
        ])

        if (!quotRes.ok) {
          setError("Cotizacion no encontrada")
          return
        }
        const json = await quotRes.json()
        setData(json.data)
        if (json.data.status === "APPROVED" || json.data.status === "CONVERTED") {
          setAccepted(true)
        }

        if (brandRes.ok) {
          const brandJson = await brandRes.json()
          setBranding(brandJson.data || {})
        }
      } catch {
        setError("Error al cargar la cotizacion")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  async function handleAccept(optionId: string) {
    setAccepting(true)
    try {
      const res = await fetch(`/api/public/quotations/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option_id: optionId }),
      })

      if (!res.ok) {
        const err = await res.json()
        alert(err.error || "Error al aceptar")
        return
      }

      setAccepted(true)
      if (data) {
        setData({ ...data, status: "APPROVED" })
      }
    } catch {
      alert("Error de conexion")
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Cotizacion no disponible</h2>
            <p className="text-muted-foreground text-sm">{error || "No se encontro la cotizacion solicitada."}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const remaining = getRemainingTime(data.valid_until)
  const statusConfig = STATUS_CONFIG[data.status] || STATUS_CONFIG.SENT
  const StatusIcon = statusConfig.icon
  const canAccept = ["SENT", "PENDING_APPROVAL"].includes(data.status) && !remaining.expired
  const totalPassengers = data.adults + data.children + data.infants

  const brandColor = branding.brand_color || "#f97316" // orange default
  const companyName = branding.company_name || data.agency_name
  const logoUrl = branding.brand_logo || null

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header con branding */}
      <div className="bg-white border-b" style={{ borderBottomColor: brandColor }}>
        <div className="max-w-3xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={companyName}
                  className="h-10 w-auto object-contain"
                />
              ) : (
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: brandColor }}
                >
                  {companyName.charAt(0)}
                </div>
              )}
              <div>
                <h2 className="font-semibold text-sm" style={{ color: brandColor }}>{companyName}</h2>
                <p className="text-xs text-muted-foreground">
                  Cotizacion {data.quotation_number}
                </p>
              </div>
            </div>
            <Badge className={statusConfig.color}>
              <StatusIcon className="h-3.5 w-3.5 mr-1" />
              {statusConfig.label}
            </Badge>
          </div>
        </div>
        {/* Color accent bar */}
        <div className="h-1" style={{ backgroundColor: brandColor }} />
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Validity warning */}
        {canAccept && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${remaining.urgent ? "bg-red-50 text-red-700 border border-red-200" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>
            <Clock className="h-4 w-4 flex-shrink-0" />
            <span>{remaining.text} — Los precios pueden variar despues del vencimiento</span>
          </div>
        )}

        {remaining.expired && data.status !== "APPROVED" && data.status !== "CONVERTED" && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-gray-50 text-gray-600 border border-gray-200">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>Esta cotizacion ha vencido. Contacta a tu asesor para una nueva cotizacion.</span>
          </div>
        )}

        {/* Trip info */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Destino</p>
                <p className="font-medium flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {data.destination}
                </p>
              </div>
              {data.origin && (
                <div>
                  <p className="text-xs text-muted-foreground">Origen</p>
                  <p className="font-medium">{data.origin}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Salida</p>
                <p className="font-medium flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(data.departure_date)}
                </p>
              </div>
              {data.return_date && (
                <div>
                  <p className="text-xs text-muted-foreground">Regreso</p>
                  <p className="font-medium">{formatDate(data.return_date)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Pasajeros</p>
                <p className="font-medium flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {data.adults} adulto{data.adults > 1 ? "s" : ""}
                  {data.children > 0 ? `, ${data.children} menor${data.children > 1 ? "es" : ""}` : ""}
                  {data.infants > 0 ? `, ${data.infants} bebe${data.infants > 1 ? "s" : ""}` : ""}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Options */}
        {data.options
          .sort((a, b) => a.option_number - b.option_number)
          .map((option) => {
            const isSelected = accepted && option.is_selected
            return (
              <Card key={option.id} className={isSelected ? "border-green-500 ring-2 ring-green-200" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      {isSelected && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                      {option.title}
                    </CardTitle>
                    <span className="text-xl font-bold">
                      {formatCurrency(option.total_amount, data.currency)}
                    </span>
                  </div>
                  {totalPassengers > 1 && (
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(option.total_amount / totalPassengers, data.currency)} por persona
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {option.items.map((item, idx) => {
                    const typeConfig = ITEM_TYPE_CONFIG[item.item_type] || ITEM_TYPE_CONFIG.OTHER
                    const ItemIcon = typeConfig.icon

                    return (
                      <div key={idx} className="flex gap-3 py-2">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${brandColor}15` }}>
                          <ItemIcon className="h-4 w-4" style={{ color: brandColor }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium uppercase" style={{ color: brandColor }}>{typeConfig.label}</span>
                            {item.provider && <span className="text-xs text-muted-foreground">· {item.provider}</span>}
                          </div>
                          <p className="text-sm font-medium mt-0.5">{item.description}</p>

                          {/* Hotel details */}
                          {item.item_type === "ACCOMMODATION" && (
                            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                              {item.hotel_name && <span>{item.hotel_name}</span>}
                              {item.hotel_stars && <span>{"★".repeat(item.hotel_stars)}</span>}
                              {item.room_type && <span>{item.room_type}</span>}
                              {item.meal_plan && <span>{MEAL_PLAN_LABELS[item.meal_plan] || item.meal_plan}</span>}
                              {item.nights && <span>{item.nights} noches</span>}
                              {item.checkin_date && item.checkout_date && (
                                <span>{formatDate(item.checkin_date)} → {formatDate(item.checkout_date)}</span>
                              )}
                            </div>
                          )}

                          {/* Flight details */}
                          {item.item_type === "FLIGHT" && (
                            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                              {item.airline && <span>{item.airline}</span>}
                              {item.flight_route && <span>{item.flight_route}</span>}
                              {item.flight_class && <span>{item.flight_class}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {/* Accept button */}
                  {canAccept && !accepted && (
                    <>
                      <Separator />
                      <Button
                        className="w-full text-white"
                        style={{ backgroundColor: brandColor }}
                        size="lg"
                        onClick={() => handleAccept(option.id)}
                        disabled={accepting}
                      >
                        {accepting ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                        )}
                        Aceptar esta opcion
                      </Button>
                    </>
                  )}

                  {isSelected && (
                    <>
                      <Separator />
                      <div className="text-center py-2">
                        <p className="text-green-600 font-medium flex items-center justify-center gap-2">
                          <CheckCircle2 className="h-5 w-5" />
                          Opcion seleccionada
                        </p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )
          })}

        {/* Accepted message */}
        {accepted && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-green-800">Cotizacion aceptada</h3>
              <p className="text-sm text-green-700 mt-1">
                Tu asesor {data.seller_name} se pondra en contacto para continuar con la reserva.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Footer con branding */}
        <div className="border-t mt-8 pt-6 pb-8">
          <div className="flex flex-col items-center gap-3">
            {logoUrl && (
              <img src={logoUrl} alt={companyName} className="h-8 w-auto opacity-60" />
            )}
            <div className="text-center text-xs text-muted-foreground space-y-1">
              <p className="font-medium">{companyName}</p>
              {branding.company_address && <p>{branding.company_address}</p>}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                {branding.company_phone && <span>{branding.company_phone}</span>}
                {branding.company_email && <span>{branding.company_email}</span>}
                {branding.company_instagram && (
                  <a
                    href={`https://instagram.com/${branding.company_instagram.replace("@", "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {branding.company_instagram.startsWith("@") ? branding.company_instagram : `@${branding.company_instagram}`}
                  </a>
                )}
              </div>
              <p className="pt-2">Asesor: {data.seller_name}</p>
              <p>Cotizacion generada el {formatDate(data.created_at.split("T")[0])}</p>
              {data.terms_and_conditions && (
                <p className="mt-3 max-w-md mx-auto text-[10px] leading-relaxed">{data.terms_and_conditions}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
