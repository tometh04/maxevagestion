import { Badge } from "@/components/ui/badge"

export const reservationStatuses: Record<string, string> = {
  PENDING: "Reserva registrada",
  QUEUED: "En cola",
  PROCESSING: "Reservando",
  FAILED: "No se pudo reservar",
  PRICE_CHANGED: "Precio modificado",
  PARTIAL: "Resultado parcial",
  CREATED: "Creada, estado por consultar",
  RSVD: "Reservada",
  CNFD: "Confirmada",
  VOID: "Anulada",
  CNLD: "Cancelada",
  RFND: "Reembolsada",
  ONRQ: "A confirmar",
  MANL: "Manual",
  PAYG: "Pago pendiente",
  NPRC: "No procesada",
  pending_confirmation: "Pendiente de confirmación",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  on_request: "A confirmar",
  rejected: "Rechazada"
}
export function ReservationStatus({ status }: { status: string }) {
  return (
    <Badge
      variant={["CNFD", "confirmed"].includes(status) ? "default" : "secondary"}
      className="whitespace-nowrap"
    >
      {reservationStatuses[status] ?? status}
    </Badge>
  )
}
export function reservationDate(value?: string | null): string {
  if (!value) return "Sin informar"
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join("/")
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(date)
    : value
}

const labels: Record<string, string> = {
  id: "Identificador",
  type: "Tipo",
  provider: "Proveedor",
  locator: "Localizador",
  reference: "Referencia",
  contactName: "Titular",
  agencyId: "Identificador de agencia en el mayorista",
  agencyName: "Agencia en el mayorista",
  bookingGroupId: "Grupo de reservas",
  providerBookingId: "Identificador del proveedor",
  thirdLocator: "Localizador adicional",
  requiresImmediateTicketing: "Requiere emisión inmediata",
  lastTicketDate: "Vencimiento de emisión",
  name: "Nombre",
  surnames: "Apellidos",
  surname: "Apellido",
  title: "Tratamiento",
  gender: "Género",
  birthDate: "Nacimiento",
  birth_date: "Nacimiento",
  age: "Edad",
  contact: "Contacto",
  mails: "Correos",
  phones: "Teléfonos",
  countryPref: "Prefijo",
  country_pref: "Prefijo",
  number: "Número",
  documents: "Documentos",
  nationality: "Nacionalidad",
  country: "País",
  issueDate: "Fecha de emisión",
  issue_date: "Fecha de emisión",
  expiryDate: "Vencimiento",
  expiry_date: "Vencimiento",
  code: "Código",
  sourceId: "Identificador de origen",
  inBooking: "Incluido en la reserva",
  index: "Posición",
  isUnaccompaniedMinor: "Menor no acompañado",
  origin: "Origen",
  dest: "Destino",
  carrier: "Aerolínea",
  flightNumber: "Número de vuelo",
  cabin: "Cabina",
  departureDateTime: "Salida",
  arrivalDateTime: "Llegada",
  segments: "Tramos",
  hotelCode: "Código de hotel",
  hotelName: "Hotel",
  chainCode: "Cadena",
  checkIn: "Entrada",
  checkOut: "Salida",
  roomTypeCode: "Tipo de habitación",
  ratePlanCode: "Plan tarifario",
  mealPlanCodes: "Régimen",
  rooms: "Habitaciones",
  adults: "Adultos",
  childrenAges: "Edades de menores",
  priceTotal: "Total de la reserva",
  priceCurrency: "Moneda",
  amount: "Importe",
  currency: "Moneda",
  paymentMethod: "Forma de pago registrada",
  guaranteePayment: "Garantía o depósito",
  cancellationCost: "Costo de cancelación",
  cancelPoliciesSnapshot: "Políticas de cancelación",
  fares: "Tarifas",
  taxes: "Impuestos",
  passengerType: "Tipo de pasajero",
  passengerTypeNormalized: "Tipo normalizado",
  quantity: "Cantidad",
  base: "Tarifa base",
  totalTaxes: "Total de impuestos",
  total: "Total",
  needsDocumentInfo: "Requiere documentos",
  needsContactAddress: "Requiere domicilio",
  needsRuc: "Requiere identificación fiscal",
  needsCtcl: "Requiere contacto",
  acceptedCardTypes: "Tipos de tarjeta aceptados",
  paymentInBooking: "Pago al reservar",
  needCardPaymentInBooking: "Requiere tarjeta al reservar",
  paymentRedirectType: "Modalidad de redirección de pago",
  cash: "Admite efectivo",
  cardApply: "Aplicación de tarjeta",
  hasServiceFeeForTpv: "Cargo por terminal de pago",
  includeServiceFeeCC: "Incluye cargo por tarjeta",
  serviceType: "Tipo de servicio",
  description: "Descripción",
  serviceProvider: "Proveedor del servicio",
  cost: "Costo",
  dateFrom: "Desde",
  dateTo: "Hasta",
  notes: "Notas",
  servicesSubtotal: "Subtotal de adicionales",
  compositeTotal: "Total con adicionales",
  fxNote: "Conversión",
  createdAt: "Creación",
  confirmedAt: "Confirmación",
  cancelledAt: "Cancelación",
  status: "Estado",
  from: "Desde",
  to: "Hasta",
  deadline: "Fecha límite",
  penalty: "Penalidad",
  percent: "Porcentaje",
  nights: "Noches",
  nonRefundable: "No reembolsable",
  refundable: "Reembolsable",
  start: "Inicio",
  end: "Fin"
}
export function Fields({ value }: { value: unknown }) {
  if (value == null) return <span className="text-muted-foreground">Sin informar</span>
  if (typeof value === "boolean") return <span>{value ? "Sí" : "No"}</span>
  if (Array.isArray(value))
    return value.length ? (
      <div className="space-y-3">
        {value.map((entry, index) => (
          <div
            key={index}
            className={typeof entry === "object" ? "border-b pb-3 last:border-0" : ""}
          >
            <Fields value={entry} />
          </div>
        ))}
      </div>
    ) : (
      <span className="text-muted-foreground">Sin registros</span>
    )
  if (typeof value === "object")
    return (
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {Object.entries(value).map(([key, entry]) => (
          <div
            key={key}
            className={entry && typeof entry === "object" ? "sm:col-span-2" : "min-w-0"}
          >
            <dt className="mb-1 text-xs font-medium text-muted-foreground">{labels[key] ?? key}</dt>
            <dd className="break-words text-sm">
              <Fields value={entry} />
            </dd>
          </div>
        ))}
      </dl>
    )
  const text = String(value)
  return (
    <span>
      {text === "no-conversion" ? "Los importes están en monedas diferentes; no se suman." : text}
    </span>
  )
}
export function DetailSection({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="space-y-4 border-b pb-6 last:border-0">
      <h2 className="text-lg font-semibold">{title}</h2>
      <Fields value={value} />
    </section>
  )
}
export function Passengers({ title, people }: { title: string; people?: unknown[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {!people?.length ? (
        <p className="text-sm text-muted-foreground">Sin pasajeros informados en esta fuente.</p>
      ) : (
        people.map((person, index) => {
          const data = person as Record<string, unknown>
          const surname = Array.isArray(data.surnames) ? data.surnames.join(" ") : data.surname
          return (
            <details key={index} className="rounded-md border bg-card p-4" open={index === 0}>
              <summary className="cursor-pointer text-sm font-medium">
                {index + 1}. {String(data.name ?? "")} {String(surname ?? "")}
              </summary>
              <div className="pt-4">
                <Fields value={data} />
              </div>
            </details>
          )
        })
      )}
    </section>
  )
}
