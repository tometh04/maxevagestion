"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  AlertTriangle,
  Bus,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Hotel,
  Loader2,
  type LucideIcon,
  MapPin,
  Plane,
  Shield,
  XCircle,
} from "lucide-react"
import {
  formatQuotationCurrency,
  formatQuotationDateLong,
  formatQuotationDateShort,
  getQuotationOptionPricing,
  getQuotationPassengerCount,
  getQuotationPassengersText,
  QUOTATION_AVAILABILITY_NOTE,
  QUOTATION_FLIGHT_CLASS_LABELS,
  QUOTATION_MEAL_PLAN_LABELS,
  QUOTATION_STATUS_LABELS,
  type QuotationPresentationData,
  type QuotationPresentationItem,
} from "@/lib/quotations/presentation"

export type PublicQuotationViewMode = "interactive" | "print"

export interface PublicQuotationBranding {
  brand_logo?: string
  brand_color?: string
  company_name?: string
  company_address?: string
  company_phone?: string
  company_email?: string
  company_website?: string
  company_instagram?: string
  company_legajo?: string
  company_tax_id?: string
  legajo?: string
  tax_id?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  instagram?: string
}

interface PublicQuotationDocumentProps {
  mode: PublicQuotationViewMode
  data: QuotationPresentationData
  branding: PublicQuotationBranding
  accepting: boolean
  downloading: boolean
  onAccept: (optionId: string) => void
  onDownload: () => void
}

const ITEM_TYPE_CONFIG: Record<string, { label: string; icon: LucideIcon; emoji: string; bgColor: string }> = {
  FLIGHT: { label: "Vuelo", icon: Plane, emoji: "\u2708\uFE0F", bgColor: "bg-blue-50" },
  HOTEL: { label: "Hotel", icon: Hotel, emoji: "\uD83C\uDFE8", bgColor: "bg-amber-50" },
  ACCOMMODATION: { label: "Alojamiento", icon: Hotel, emoji: "\uD83C\uDFE8", bgColor: "bg-amber-50" },
  TRANSFER: { label: "Traslado", icon: Bus, emoji: "\uD83D\uDE90", bgColor: "bg-emerald-50" },
  ASSISTANCE: { label: "Asistencia", icon: Shield, emoji: "\uD83D\uDEE1\uFE0F", bgColor: "bg-purple-50" },
  INSURANCE: { label: "Asistencia", icon: Shield, emoji: "\uD83D\uDEE1\uFE0F", bgColor: "bg-purple-50" },
  EXCURSION: { label: "Excursion", icon: MapPin, emoji: "\uD83C\uDFAF", bgColor: "bg-rose-50" },
  ACTIVITY: { label: "Excursion", icon: MapPin, emoji: "\uD83C\uDFAF", bgColor: "bg-rose-50" },
  VISA: { label: "Visa", icon: MapPin, emoji: "\uD83D\uDCC4", bgColor: "bg-indigo-50" },
  OTHER: { label: "Otro", icon: MapPin, emoji: "\uD83D\uDCCB", bgColor: "bg-gray-50" },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  DRAFT: { label: QUOTATION_STATUS_LABELS.DRAFT, color: "bg-slate-100 text-slate-700 border-slate-200", icon: Eye },
  SENT: { label: QUOTATION_STATUS_LABELS.SENT, color: "bg-blue-100 text-blue-700 border-blue-200", icon: Clock },
  PENDING_APPROVAL: { label: QUOTATION_STATUS_LABELS.PENDING_APPROVAL, color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
  APPROVED: { label: QUOTATION_STATUS_LABELS.APPROVED, color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle2 },
  REJECTED: { label: QUOTATION_STATUS_LABELS.REJECTED, color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
  EXPIRED: { label: QUOTATION_STATUS_LABELS.EXPIRED, color: "bg-gray-100 text-gray-600 border-gray-200", icon: AlertTriangle },
  CONVERTED: { label: QUOTATION_STATUS_LABELS.CONVERTED, color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle2 },
}

function HotelCard({ item, brandColor }: { item: QuotationPresentationItem; brandColor: string }) {
  const stars = item.hotel_stars ? "\u2605".repeat(item.hotel_stars) : ""
  const mealLabel = item.meal_plan ? (QUOTATION_MEAL_PLAN_LABELS[item.meal_plan] || item.meal_plan) : null

  return (
    <div className="bg-white border rounded-xl overflow-hidden space-y-0">
      {item.hotel_photo_url && (
        <div className="relative w-full h-36 overflow-hidden">
          <img src={item.hotel_photo_url} alt={item.hotel_name || "Hotel"} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-2 left-3 flex items-center gap-2">
            {stars && <span className="text-amber-400 text-sm drop-shadow-lg">{stars}</span>}
            <h4 className="font-bold text-white text-sm drop-shadow-lg">
              {item.hotel_name || item.description}
            </h4>
          </div>
        </div>
      )}

      <div className="p-4 space-y-3">
        {!item.hotel_photo_url && (
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-lg flex-shrink-0">
                🏨
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: brandColor }}>Alojamiento</p>
                <h4 className="font-semibold text-gray-900 text-sm mt-0.5">
                  {item.hotel_name || item.description}
                </h4>
                {stars && <p className="text-amber-500 text-sm tracking-wider">{stars}</p>}
              </div>
            </div>
            {item.price_per_unit != null && item.price_per_unit > 0 && (
              <p className="text-xs text-muted-foreground whitespace-nowrap mt-1">
                p/noche
              </p>
            )}
          </div>
        )}

        {item.hotel_name && item.description && item.hotel_name !== item.description && (
          <p className="text-sm text-gray-600">{item.description}</p>
        )}

        <div className="flex flex-wrap gap-2">
          {item.destination_city && (
            <Badge variant="secondary" className="flex items-center gap-1 text-xs font-medium bg-slate-100 text-slate-700">
              <MapPin className="h-3 w-3" />
              {item.destination_city}
            </Badge>
          )}
          {item.room_type && (
            <Badge variant="secondary" className="text-xs font-medium bg-gray-100 text-gray-700">
              {item.room_type}
            </Badge>
          )}
          {mealLabel && (
            <Badge variant="secondary" className="text-xs font-medium bg-amber-100 text-amber-800">
              {mealLabel}
            </Badge>
          )}
          {item.rooms && item.rooms > 1 && (
            <Badge variant="secondary" className="text-xs font-medium bg-blue-100 text-blue-700">
              {item.rooms} habitaciones
            </Badge>
          )}
        </div>

        {item.checkin_date && item.checkout_date && (
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
            <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            <span>{formatQuotationDateShort(item.checkin_date)}</span>
            <span className="text-gray-400">&rarr;</span>
            <span>{formatQuotationDateShort(item.checkout_date)}</span>
            {item.nights && (
              <span className="text-xs text-muted-foreground ml-auto">
                {item.nights} noche{item.nights > 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        {item.hotel_address && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {item.hotel_address}
          </p>
        )}

        {item.provider && (
          <p className="text-xs text-muted-foreground">Operador: {item.provider}</p>
        )}
      </div>
    </div>
  )
}

function FlightCard({ item, brandColor }: { item: QuotationPresentationItem; brandColor: string }) {
  const classLabel = item.flight_class ? (QUOTATION_FLIGHT_CLASS_LABELS[item.flight_class] || item.flight_class) : null
  const routeDisplay = item.flight_route
    ? item.flight_route.replace(/\s*[-→>]+\s*/g, " \u2708 ")
    : null

  return (
    <div className="bg-white border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-lg flex-shrink-0">
            ✈️
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: brandColor }}>Vuelo</p>
            {item.airline && <h4 className="font-semibold text-gray-900 text-sm mt-0.5">{item.airline}</h4>}
          </div>
        </div>
      </div>

      {routeDisplay && (
        <div className="text-center py-2">
          <p className="text-lg font-bold text-gray-800 tracking-wider">{routeDisplay}</p>
        </div>
      )}

      {!routeDisplay && item.description && (
        <p className="text-sm text-gray-600">{item.description}</p>
      )}

      <div className="flex flex-wrap gap-2 justify-center">
        {classLabel && (
          <Badge variant="secondary" className="text-xs font-medium bg-blue-100 text-blue-700">
            {classLabel}
          </Badge>
        )}
        {item.flight_stops != null && item.flight_stops > 0 && (
          <Badge variant="secondary" className="text-xs font-medium bg-orange-100 text-orange-700">
            {item.flight_stops} escala{item.flight_stops > 1 ? "s" : ""}
          </Badge>
        )}
        {item.flight_stops === 0 && (
          <Badge variant="secondary" className="text-xs font-medium bg-green-100 text-green-700">
            Directo
          </Badge>
        )}
      </div>

      {(item.flight_date || item.flight_return_date) && (
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
          <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          {item.flight_date && <span>Ida: {formatQuotationDateShort(item.flight_date)}</span>}
          {item.flight_date && item.flight_return_date && <span className="text-gray-400">|</span>}
          {item.flight_return_date && <span>Vuelta: {formatQuotationDateShort(item.flight_return_date)}</span>}
        </div>
      )}

      {routeDisplay && item.description && item.description !== item.flight_route && (
        <p className="text-xs text-muted-foreground">{item.description}</p>
      )}

      {item.flight_screenshot_url && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-center">
            Itinerario del vuelo
          </p>
          <div className="rounded-xl border bg-slate-50 p-2">
            <img
              src={item.flight_screenshot_url}
              alt="Itinerario del vuelo"
              className="w-full max-h-80 object-contain rounded-lg"
            />
          </div>
        </div>
      )}

      {item.provider && (
        <p className="text-xs text-muted-foreground">Operador: {item.provider}</p>
      )}
    </div>
  )
}

function TransferCard({ item, brandColor }: { item: QuotationPresentationItem; brandColor: string }) {
  return (
    <div className="bg-white border rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-lg flex-shrink-0">
          🚐
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: brandColor }}>Traslado</p>
          <h4 className="font-semibold text-gray-900 text-sm mt-0.5">
            {item.transfer_description || item.description}
          </h4>
        </div>
      </div>
      {item.transfer_description && item.description && item.transfer_description !== item.description && (
        <p className="text-sm text-gray-600">{item.description}</p>
      )}
      {item.provider && (
        <p className="text-xs text-muted-foreground">Operador: {item.provider}</p>
      )}
    </div>
  )
}

function InsuranceCard({ item, brandColor }: { item: QuotationPresentationItem; brandColor: string }) {
  return (
    <div className="bg-white border rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-lg flex-shrink-0">
          🛡️
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: brandColor }}>Asistencia al viajero</p>
          <h4 className="font-semibold text-gray-900 text-sm mt-0.5">{item.description}</h4>
        </div>
      </div>
      {item.provider && (
        <p className="text-xs text-muted-foreground">Operador: {item.provider}</p>
      )}
    </div>
  )
}

function ActivityCard({ item, brandColor }: { item: QuotationPresentationItem; brandColor: string }) {
  const config = ITEM_TYPE_CONFIG[item.item_type] || ITEM_TYPE_CONFIG.OTHER

  return (
    <div className="bg-white border rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${config.bgColor} flex items-center justify-center text-lg flex-shrink-0`}>
          {config.emoji}
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: brandColor }}>{config.label}</p>
          <h4 className="font-semibold text-gray-900 text-sm mt-0.5">{item.description}</h4>
        </div>
      </div>
      {item.provider && (
        <p className="text-xs text-muted-foreground">Operador: {item.provider}</p>
      )}
    </div>
  )
}

function ServiceCard({ item, brandColor }: { item: QuotationPresentationItem; brandColor: string }) {
  switch (item.item_type) {
    case "ACCOMMODATION":
    case "HOTEL":
      return <HotelCard item={item} brandColor={brandColor} />
    case "FLIGHT":
      return <FlightCard item={item} brandColor={brandColor} />
    case "TRANSFER":
      return <TransferCard item={item} brandColor={brandColor} />
    case "INSURANCE":
    case "ASSISTANCE":
      return <InsuranceCard item={item} brandColor={brandColor} />
    case "EXCURSION":
    case "ACTIVITY":
      return <ActivityCard item={item} brandColor={brandColor} />
    default:
      return <ActivityCard item={item} brandColor={brandColor} />
  }
}

export function PublicQuotationLoading({ mode }: { mode: PublicQuotationViewMode }) {
  return (
    <div className={`min-h-screen flex items-center justify-center ${mode === "print" ? "bg-white" : "bg-gray-50"}`}>
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
        <p className="text-sm text-muted-foreground">Cargando cotizacion...</p>
      </div>
    </div>
  )
}

export function PublicQuotationError({
  mode,
  message,
}: {
  mode: PublicQuotationViewMode
  message: string
}) {
  return (
    <div className={`min-h-screen flex items-center justify-center ${mode === "print" ? "bg-white" : "bg-gray-50"}`}>
      <Card className="max-w-md w-full mx-4">
        <CardContent className="pt-6 text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Cotizacion no disponible</h2>
          <p className="text-muted-foreground text-sm">{message}</p>
        </CardContent>
      </Card>
    </div>
  )
}

export function PublicQuotationDocument({
  mode,
  data,
  branding,
  accepting,
  downloading,
  onAccept,
  onDownload,
}: PublicQuotationDocumentProps) {
  const statusConfig = STATUS_CONFIG[data.status] || STATUS_CONFIG.DRAFT
  const StatusIcon = statusConfig.icon
  const canAccept = mode === "interactive" && ["SENT", "PENDING_APPROVAL"].includes(data.status)
  const accepted = ["APPROVED", "CONVERTED"].includes(data.status)
  const totalPassengers = getQuotationPassengerCount(data)

  const brandColor = branding.brand_color || "#f97316"
  const companyName = branding.company_name || data.agency_name
  const logoUrl = branding.brand_logo || null
  const companyLegajo = branding.company_legajo || branding.legajo || null
  const companyTaxId = branding.company_tax_id || branding.tax_id || null
  const companyAddress = branding.company_address || branding.address || null
  const companyPhone = branding.company_phone || branding.phone || null
  const companyEmail = branding.company_email || branding.email || null
  const companyWebsite = branding.company_website || branding.website || null
  const companyInstagram = branding.company_instagram || branding.instagram || null

  return (
    <div className={`min-h-screen ${mode === "print" ? "bg-white" : "bg-gradient-to-b from-gray-50 to-white"}`}>
      <div className={mode === "print" ? "bg-white" : "bg-white shadow-sm sticky top-0 z-10"}>
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={companyName}
                  className="h-10 w-auto object-contain"
                />
              ) : (
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                  style={{ backgroundColor: brandColor }}
                >
                  {companyName.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <h2 className="font-bold text-base truncate" style={{ color: brandColor }}>{companyName}</h2>
                <p className="text-xs text-muted-foreground">
                  Cotizacion #{data.quotation_number}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {mode === "interactive" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDownload}
                  disabled={downloading}
                  className="h-9 gap-1.5"
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Descargar PDF</span>
                </Button>
              )}
              <Badge className={`${statusConfig.color} border`}>
                <StatusIcon className="h-3.5 w-3.5 mr-1" />
                {statusConfig.label}
              </Badge>
            </div>
          </div>
        </div>
        <div className="h-1" style={{ backgroundColor: brandColor }} />
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <Card className="overflow-hidden">
          <div className="h-1.5" style={{ backgroundColor: brandColor }} />
          <CardContent className="pt-5 pb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: `${brandColor}12` }}>
                  🌍
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Destino</p>
                  <p className="font-bold text-gray-900">{data.destination}</p>
                  {data.origin && (
                    <p className="text-xs text-muted-foreground mt-0.5">Desde {data.origin}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: `${brandColor}12` }}>
                  📅
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Fechas</p>
                  <p className="font-semibold text-gray-900 text-sm">{formatQuotationDateLong(data.departure_date)}</p>
                  {data.return_date && (
                    <p className="text-xs text-muted-foreground mt-0.5">Regreso: {formatQuotationDateLong(data.return_date)}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: `${brandColor}12` }}>
                  👥
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Pasajeros</p>
                  <p className="font-semibold text-gray-900 text-sm">
                    {getQuotationPassengersText(data)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{totalPassengers} pasajero{totalPassengers > 1 ? "s" : ""} en total</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {data.notes && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
            <p className="font-semibold text-xs uppercase tracking-wide mb-1 text-blue-600">Notas del asesor</p>
            <p className="whitespace-pre-line">{data.notes}</p>
          </div>
        )}

        {data.options
          .slice()
          .sort((a, b) => a.option_number - b.option_number)
          .map((option) => {
            const isSelected = accepted && option.is_selected
            const pricing = getQuotationOptionPricing(option, data)

            return (
              <Card
                key={option.id}
                className={`overflow-hidden transition-all ${isSelected ? "border-green-400 ring-2 ring-green-100 shadow-lg" : "shadow-sm hover:shadow-md"}`}
              >
                <CardHeader className="pb-0">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      {isSelected && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                      {option.title}
                    </CardTitle>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-4">
                  <div className="space-y-3">
                    {option.items.map((item, idx) => (
                      <ServiceCard key={idx} item={item} brandColor={brandColor} />
                    ))}
                  </div>

                  <div className="rounded-xl p-4 mt-4" style={{ backgroundColor: `${brandColor}08` }}>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{pricing.primaryLabel}</p>
                        {pricing.secondaryAmount != null && pricing.secondaryLabel && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {pricing.secondaryLabel}: {formatQuotationCurrency(pricing.secondaryAmount, data.currency)}
                          </p>
                        )}
                      </div>
                      <p className="text-2xl font-bold text-right" style={{ color: brandColor }}>
                        {formatQuotationCurrency(pricing.primaryAmount, data.currency)}
                      </p>
                    </div>
                  </div>

                  {canAccept && !accepted && (
                    <Button
                      className="w-full text-white font-semibold text-base h-12 rounded-xl shadow-md hover:shadow-lg transition-all"
                      style={{ backgroundColor: brandColor }}
                      onClick={() => onAccept(option.id)}
                      disabled={accepting}
                    >
                      {accepting ? (
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 mr-2" />
                      )}
                      Aceptar esta opcion
                    </Button>
                  )}

                  {isSelected && (
                    <div className="text-center py-3 bg-green-50 rounded-xl border border-green-200">
                      <p className="text-green-700 font-semibold flex items-center justify-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        Opcion seleccionada
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}

        {accepted && (
          <Card className="border-green-200 bg-green-50 overflow-hidden">
            <div className="h-1" style={{ backgroundColor: "#22c55e" }} />
            <CardContent className="pt-6 pb-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
              <h3 className="text-xl font-bold text-green-800">Cotizacion aceptada</h3>
              <p className="text-sm text-green-700 mt-2 max-w-md mx-auto">
                Tu asesor <span className="font-semibold">{data.seller_name}</span> se pondra en contacto para continuar con la reserva.
              </p>
            </CardContent>
          </Card>
        )}

        <footer className="border-t mt-10 pt-8 pb-10">
          <div className="flex flex-col items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="h-10 w-auto opacity-70" />
            ) : (
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg opacity-80"
                style={{ backgroundColor: brandColor }}
              >
                {companyName.charAt(0)}
              </div>
            )}

            <h3 className="font-bold text-sm text-gray-700">{companyName}</h3>

            {(companyLegajo || companyTaxId) && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {companyLegajo && <span>Legajo N.° {companyLegajo}</span>}
                {companyLegajo && companyTaxId && <span className="text-gray-300">|</span>}
                {companyTaxId && <span>CUIT: {companyTaxId}</span>}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {companyAddress && <span>{companyAddress}</span>}
              {companyPhone && <span>{companyPhone}</span>}
              {companyEmail && (
                <a href={`mailto:${companyEmail}`} className="hover:underline">
                  {companyEmail}
                </a>
              )}
              {companyWebsite && (
                <a
                  href={companyWebsite.startsWith("http") ? companyWebsite : `https://${companyWebsite}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {companyWebsite}
                </a>
              )}
              {companyInstagram && (
                <a
                  href={`https://instagram.com/${companyInstagram.replace("@", "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {companyInstagram.startsWith("@") ? companyInstagram : `@${companyInstagram}`}
                </a>
              )}
            </div>

            <Separator className="w-48 my-2" />

            <div className="text-center text-xs text-muted-foreground space-y-1">
              <p>Asesor: <span className="font-medium text-gray-600">{data.seller_name}</span></p>
              <p>Cotizacion generada el {formatQuotationDateLong(data.created_at.split("T")[0])}</p>
            </div>

            <div className="mt-4 max-w-lg mx-auto">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-center mb-1">
                Disponibilidad
              </p>
              <p className="text-[10px] leading-relaxed text-muted-foreground text-center">
                {QUOTATION_AVAILABILITY_NOTE}
              </p>
            </div>

            {data.terms_and_conditions && (
              <div className="mt-4 max-w-lg mx-auto">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-center mb-1">
                  Terminos y condiciones
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground text-center whitespace-pre-line">
                  {data.terms_and_conditions}
                </p>
              </div>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
