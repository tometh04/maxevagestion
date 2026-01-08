/**
 * Generador de PDFs usando templates HTML
 * 
 * Este servicio permite generar PDFs a partir de templates HTML
 * con variables reemplazables y estilos CSS personalizados.
 * 
 * Para el servidor, usar con puppeteer o similar.
 * Para el cliente, usar con window.print() o librería como html2pdf.
 */

// Variables disponibles por tipo de template
export const TEMPLATE_VARIABLES: Record<string, Array<{ name: string; description: string; example: string }>> = {
  invoice: [
    { name: 'invoice_number', description: 'Número de factura', example: '0001-00000123' },
    { name: 'invoice_date', description: 'Fecha de emisión', example: '15/01/2024' },
    { name: 'cae', description: 'CAE de AFIP', example: '74123456789012' },
    { name: 'cae_expiration', description: 'Vencimiento CAE', example: '25/01/2024' },
    { name: 'customer_name', description: 'Nombre del cliente', example: 'Juan Pérez' },
    { name: 'customer_document', description: 'CUIT/DNI del cliente', example: '20-12345678-9' },
    { name: 'customer_address', description: 'Dirección del cliente', example: 'Av. Corrientes 1234' },
    { name: 'customer_iva', description: 'Condición IVA', example: 'Responsable Inscripto' },
    { name: 'items', description: 'Lista de items (array)', example: '[{description, quantity, price, total}]' },
    { name: 'subtotal', description: 'Subtotal', example: '$10,000.00' },
    { name: 'iva', description: 'IVA', example: '$2,100.00' },
    { name: 'total', description: 'Total', example: '$12,100.00' },
    { name: 'agency_name', description: 'Nombre de la agencia', example: 'Viajes Argentina' },
    { name: 'agency_cuit', description: 'CUIT de la agencia', example: '30-12345678-9' },
    { name: 'agency_address', description: 'Dirección de la agencia', example: 'San Martín 456' },
    { name: 'agency_phone', description: 'Teléfono de la agencia', example: '+54 11 1234-5678' },
    { name: 'qr_code', description: 'Código QR AFIP (base64)', example: 'data:image/png;base64,...' },
  ],
  budget: [
    { name: 'budget_number', description: 'Número de presupuesto', example: 'PRES-2024-001' },
    { name: 'budget_date', description: 'Fecha de presupuesto', example: '15/01/2024' },
    { name: 'valid_until', description: 'Válido hasta', example: '15/02/2024' },
    { name: 'customer_name', description: 'Nombre del cliente', example: 'Juan Pérez' },
    { name: 'customer_email', description: 'Email del cliente', example: 'juan@email.com' },
    { name: 'destination', description: 'Destino del viaje', example: 'Cancún, México' },
    { name: 'travel_dates', description: 'Fechas del viaje', example: '01/03/2024 - 10/03/2024' },
    { name: 'pax', description: 'Cantidad de pasajeros', example: '2 adultos, 1 menor' },
    { name: 'items', description: 'Lista de servicios', example: '[{description, price}]' },
    { name: 'total', description: 'Total', example: 'USD 3,500.00' },
    { name: 'notes', description: 'Notas/observaciones', example: 'Incluye traslados' },
    { name: 'payment_conditions', description: 'Condiciones de pago', example: '50% reserva, 50% antes del viaje' },
  ],
  voucher: [
    { name: 'voucher_number', description: 'Número de voucher', example: 'VOU-2024-001' },
    { name: 'operation_code', description: 'Código de operación', example: 'OP-2024-0123' },
    { name: 'passenger_name', description: 'Nombre del pasajero', example: 'Juan Pérez' },
    { name: 'service_type', description: 'Tipo de servicio', example: 'Hotel' },
    { name: 'service_name', description: 'Nombre del servicio', example: 'Hotel Marriott' },
    { name: 'check_in', description: 'Fecha de check-in', example: '01/03/2024' },
    { name: 'check_out', description: 'Fecha de check-out', example: '05/03/2024' },
    { name: 'nights', description: 'Cantidad de noches', example: '4' },
    { name: 'room_type', description: 'Tipo de habitación', example: 'Doble Superior' },
    { name: 'meal_plan', description: 'Plan de comidas', example: 'All Inclusive' },
    { name: 'confirmation_number', description: 'Número de confirmación', example: 'CONF-123456' },
    { name: 'notes', description: 'Notas adicionales', example: 'Early check-in solicitado' },
  ],
  itinerary: [
    { name: 'operation_code', description: 'Código de operación', example: 'OP-2024-0123' },
    { name: 'passenger_names', description: 'Nombres de pasajeros', example: 'Juan Pérez, María García' },
    { name: 'destination', description: 'Destino', example: 'Europa (España, Francia, Italia)' },
    { name: 'start_date', description: 'Fecha de inicio', example: '01/03/2024' },
    { name: 'end_date', description: 'Fecha de fin', example: '15/03/2024' },
    { name: 'days', description: 'Lista de días (array)', example: '[{date, activities}]' },
    { name: 'flights', description: 'Lista de vuelos', example: '[{airline, flight, departure, arrival}]' },
    { name: 'hotels', description: 'Lista de hoteles', example: '[{name, address, phone, dates}]' },
    { name: 'emergency_contacts', description: 'Contactos de emergencia', example: '[{name, phone}]' },
  ],
  receipt: [
    { name: 'receipt_number', description: 'Número de recibo', example: 'REC-2024-001' },
    { name: 'receipt_date', description: 'Fecha del recibo', example: '15/01/2024' },
    { name: 'customer_name', description: 'Nombre del cliente', example: 'Juan Pérez' },
    { name: 'operation_code', description: 'Código de operación', example: 'OP-2024-0123' },
    { name: 'concept', description: 'Concepto', example: 'Seña viaje a Cancún' },
    { name: 'amount', description: 'Monto', example: '$50,000.00' },
    { name: 'payment_method', description: 'Forma de pago', example: 'Transferencia bancaria' },
    { name: 'remaining', description: 'Saldo pendiente', example: '$50,000.00' },
    { name: 'notes', description: 'Observaciones', example: 'Saldo a pagar antes del 01/02/2024' },
  ],
  contract: [
    { name: 'contract_number', description: 'Número de contrato', example: 'CONT-2024-001' },
    { name: 'contract_date', description: 'Fecha del contrato', example: '15/01/2024' },
    { name: 'customer_name', description: 'Nombre del cliente', example: 'Juan Pérez' },
    { name: 'customer_document', description: 'Documento del cliente', example: '12.345.678' },
    { name: 'customer_address', description: 'Domicilio del cliente', example: 'Av. Corrientes 1234' },
    { name: 'destination', description: 'Destino contratado', example: 'Cancún, México' },
    { name: 'travel_dates', description: 'Fechas del viaje', example: '01/03/2024 - 10/03/2024' },
    { name: 'services', description: 'Servicios incluidos', example: 'Aéreo, Hotel, Traslados' },
    { name: 'total_price', description: 'Precio total', example: 'USD 3,500.00' },
    { name: 'payment_schedule', description: 'Plan de pagos', example: '[{date, amount, concept}]' },
    { name: 'terms', description: 'Términos y condiciones', example: 'Texto de T&C...' },
    { name: 'cancellation_policy', description: 'Política de cancelación', example: 'Texto de política...' },
  ],
  general: [
    { name: 'title', description: 'Título del documento', example: 'Documento General' },
    { name: 'content', description: 'Contenido principal', example: 'Texto del documento...' },
    { name: 'date', description: 'Fecha', example: '15/01/2024' },
  ],
}

/**
 * Reemplaza las variables en un template HTML
 */
export function replaceTemplateVariables(
  template: string,
  data: Record<string, any>
): string {
  let result = template

  // Reemplazar variables simples {{variable}}
  const simpleVarRegex = /\{\{(\w+)\}\}/g
  result = result.replace(simpleVarRegex, (match, varName) => {
    return data[varName] ?? match
  })

  // Reemplazar loops {{#each items}}...{{/each}}
  const eachRegex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g
  result = result.replace(eachRegex, (match, arrayName, content) => {
    const array = data[arrayName]
    if (!Array.isArray(array)) return ''
    
    return array.map(item => {
      let itemContent = content
      // Reemplazar variables del item
      Object.entries(item).forEach(([key, value]) => {
        const itemVarRegex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
        itemContent = itemContent.replace(itemVarRegex, String(value ?? ''))
      })
      return itemContent
    }).join('')
  })

  // Reemplazar condicionales {{#if variable}}...{{/if}}
  const ifRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g
  result = result.replace(ifRegex, (match, varName, content) => {
    return data[varName] ? content : ''
  })

  return result
}

/**
 * Formatea un número como moneda
 */
export function formatCurrency(
  amount: number,
  currency: string = 'ARS',
  locale: string = 'es-AR'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

/**
 * Formatea una fecha
 */
export function formatDate(
  date: Date | string,
  format: 'short' | 'long' = 'short'
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  
  if (format === 'long') {
    return d.toLocaleDateString('es-AR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }
  
  return d.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

/**
 * Template base de factura
 */
export const DEFAULT_INVOICE_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 20px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .logo { max-height: 60px; }
    .invoice-info { text-align: right; }
    .invoice-type { font-size: 24px; font-weight: bold; }
    .customer-info { margin-bottom: 20px; padding: 10px; background: #f5f5f5; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f0f0f0; }
    .totals { text-align: right; }
    .total-row { font-weight: bold; font-size: 14px; }
    .footer { margin-top: 20px; text-align: center; font-size: 10px; }
    .qr-code { width: 100px; height: 100px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      {{#if logo_url}}<img src="{{logo_url}}" class="logo" alt="Logo">{{/if}}
      <h2>{{agency_name}}</h2>
      <p>CUIT: {{agency_cuit}}</p>
      <p>{{agency_address}}</p>
      <p>Tel: {{agency_phone}}</p>
    </div>
    <div class="invoice-info">
      <div class="invoice-type">{{invoice_type}}</div>
      <p><strong>N°:</strong> {{invoice_number}}</p>
      <p><strong>Fecha:</strong> {{invoice_date}}</p>
    </div>
  </div>

  <div class="customer-info">
    <p><strong>Cliente:</strong> {{customer_name}}</p>
    <p><strong>CUIT/DNI:</strong> {{customer_document}}</p>
    <p><strong>Domicilio:</strong> {{customer_address}}</p>
    <p><strong>Condición IVA:</strong> {{customer_iva}}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>Descripción</th>
        <th>Cantidad</th>
        <th>Precio Unit.</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{description}}</td>
        <td>{{quantity}}</td>
        <td>{{price}}</td>
        <td>{{total}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <div class="totals">
    <p>Subtotal: {{subtotal}}</p>
    <p>IVA (21%): {{iva}}</p>
    <p class="total-row">TOTAL: {{total}}</p>
  </div>

  <div class="footer">
    <p><strong>CAE:</strong> {{cae}} | <strong>Vto:</strong> {{cae_expiration}}</p>
    {{#if qr_code}}<img src="{{qr_code}}" class="qr-code" alt="QR AFIP">{{/if}}
  </div>
</body>
</html>
`

/**
 * Template base de presupuesto
 */
export const DEFAULT_BUDGET_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { max-height: 60px; }
    h1 { color: #333; margin-bottom: 5px; }
    .subtitle { color: #666; }
    .info-box { background: #f9f9f9; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
    .section-title { font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #333; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background: #4a90d9; color: white; }
    .total { text-align: right; font-size: 18px; font-weight: bold; }
    .notes { background: #fff3cd; padding: 10px; border-radius: 5px; margin-top: 20px; }
    .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    {{#if logo_url}}<img src="{{logo_url}}" class="logo" alt="Logo">{{/if}}
    <h1>PRESUPUESTO</h1>
    <p class="subtitle">N° {{budget_number}} | Fecha: {{budget_date}}</p>
    <p class="subtitle">Válido hasta: {{valid_until}}</p>
  </div>

  <div class="info-box">
    <p><strong>Cliente:</strong> {{customer_name}}</p>
    <p><strong>Email:</strong> {{customer_email}}</p>
    <p><strong>Destino:</strong> {{destination}}</p>
    <p><strong>Fechas:</strong> {{travel_dates}}</p>
    <p><strong>Pasajeros:</strong> {{pax}}</p>
  </div>

  <div class="section-title">Servicios Incluidos</div>
  <table>
    <thead>
      <tr>
        <th>Descripción</th>
        <th>Precio</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{description}}</td>
        <td>{{price}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <p class="total">TOTAL: {{total}}</p>

  {{#if notes}}
  <div class="notes">
    <strong>Notas:</strong> {{notes}}
  </div>
  {{/if}}

  {{#if payment_conditions}}
  <div class="info-box">
    <strong>Condiciones de pago:</strong> {{payment_conditions}}
  </div>
  {{/if}}

  <div class="footer">
    <p>Este presupuesto tiene validez hasta la fecha indicada y está sujeto a disponibilidad.</p>
  </div>
</body>
</html>
`
