/**
 * Servicio de Email usando Resend
 *
 * Requiere configurar RESEND_API_KEY en variables de entorno
 */

export const VIBOOK_EMAIL_GRADIENT = "linear-gradient(135deg, hsl(232 76% 58%) 0%, hsl(199 82% 58%) 50%, hsl(252 70% 70%) 100%)"
export const VIBOOK_EMAIL_GRADIENT_SUCCESS = "linear-gradient(135deg, hsl(160 58% 42%) 0%, hsl(199 82% 58%) 100%)"
export const VIBOOK_EMAIL_GRADIENT_WARNING = "linear-gradient(135deg, hsl(10 78% 66%) 0%, hsl(252 70% 70%) 100%)"

interface OrgSettings {
  companyName: string
  address: string
  phone: string
  email: string
  website: string
  logo: string
}

async function getOrgSettings(supabase: any): Promise<OrgSettings> {
  const { data } = await supabase.from('organization_settings').select('key, value')
  const get = (key: string, fallback: string = '') =>
    data?.find((s: any) => s.key === key)?.value || fallback
  return {
    companyName: get('company_name', 'Mi Empresa'),
    address: get('address', ''),
    phone: get('phone', ''),
    email: get('email', ''),
    website: get('website', ''),
    logo: get('brand_logo', ''),
  }
}

function generateEmailHeader(orgSettings: OrgSettings, subtitle: string, gradient: string = VIBOOK_EMAIL_GRADIENT): string {
  const logoHtml = orgSettings.logo
    ? `<img src="${orgSettings.logo}" alt="${orgSettings.companyName}" style="max-height: 50px; margin-bottom: 10px;" /><br/>`
    : ''
  const background = gradient.startsWith('linear-gradient') ? gradient : `linear-gradient(${gradient})`
  return `<div style="background: ${background}; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    ${logoHtml}<h1 style="color: white; margin: 0; font-size: 24px;">${orgSettings.companyName}</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">${subtitle}</p>
  </div>`
}

function generateEmailFooter(orgSettings: OrgSettings): string {
  const parts: string[] = []
  if (orgSettings.address) parts.push(orgSettings.address)
  if (orgSettings.phone) parts.push(orgSettings.phone)
  if (orgSettings.website) parts.push(orgSettings.website)
  if (orgSettings.email) parts.push(orgSettings.email)

  const contactLine = parts.length > 0
    ? `<p style="margin: 4px 0;">${parts.join(' | ')}</p>`
    : ''

  return `<div style="text-align: center; padding: 20px; color: hsl(226 12% 48%); font-size: 12px;">
    <p style="margin: 4px 0;">Este email fue enviado por ${orgSettings.companyName}</p>
    ${contactLine}
  </div>`
}

interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
}

interface SendEmailResult {
  success: boolean
  id?: string
  error?: string
}

export async function sendEmail(options: EmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    console.warn("RESEND_API_KEY no configurada, email no enviado")
    return { success: false, error: "API key no configurada" }
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: options.from || process.env.RESEND_FROM_EMAIL || "Vibook <noreply@vibook.ai>",
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        reply_to: options.replyTo,
        attachments: options.attachments?.map(a => ({
          filename: a.filename,
          content: typeof a.content === "string" ? a.content : a.content.toString("base64"),
        })),
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error("Error sending email:", error)
      return { success: false, error: error.message || "Error al enviar email" }
    }

    const data = await response.json()
    return { success: true, id: data.id }
  } catch (error: any) {
    console.error("Error sending email:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Enviar email de bienvenida a un tenant nuevo recién creado en /onboarding.
 *
 * Pendientes 2026-05-07 (GTM piloto): el tenant que completa onboarding
 * se chocaba con un dashboard sin contexto y debía adivinar los próximos
 * pasos. Ahora le mandamos un mail con:
 *   - Confirmación de que su agencia quedó creada
 *   - Cuándo vence el trial (14 días)
 *   - Quick-start: 3 pasos críticos para empezar a operar
 *   - Link al setup de AFIP (lo único que NO se puede saltar para emitir)
 *   - Email de soporte
 *
 * NO usa orgSettings porque al momento del onboarding la org recién se
 * creó y no tiene branding aún. Usamos branding fijo Vibook.
 */
export async function sendWelcomeEmail(
  to: string,
  agencyName: string,
  trialEndsAt: Date
): Promise<SendEmailResult> {
  const trialFmt = trialEndsAt.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai"

  const html = `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 0; background: #f5f7fa;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; margin-top: 24px; margin-bottom: 24px;">
    <div style="background: ${VIBOOK_EMAIL_GRADIENT}; padding: 40px 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Bienvenido a Vibook</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 12px 0 0 0; font-size: 16px;">
        Tu agencia <strong>${agencyName}</strong> quedó creada.
      </p>
    </div>

    <div style="padding: 32px 30px;">
      <p style="font-size: 15px; color: #1f2937; line-height: 1.6; margin: 0 0 20px 0;">
        Tenés <strong>14 días de trial</strong> sin cargo. Vence el <strong>${trialFmt}</strong>.
        Antes de esa fecha podés elegir un plan y conectar Mercado Pago para que la suscripción siga activa.
      </p>

      <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <h2 style="font-size: 14px; color: #1f2937; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px 0;">
          Empezá por acá
        </h2>
        <ol style="margin: 0; padding-left: 20px; color: #374151; font-size: 14px; line-height: 1.7;">
          <li>
            <strong>Conectá AFIP</strong> para emitir facturas electrónicas.
            <br/>
            <a href="${appUrl}/settings/integrations" style="color: hsl(232 76% 58%); text-decoration: none;">
              Ir a Configuración → Integraciones →
            </a>
          </li>
          <li style="margin-top: 12px;">
            <strong>Cargá tu primera operación</strong> con cliente + operador + venta.
            <br/>
            <a href="${appUrl}/operations" style="color: hsl(232 76% 58%); text-decoration: none;">
              Ir a Operaciones →
            </a>
          </li>
          <li style="margin-top: 12px;">
            <strong>Sumá a tu equipo</strong> invitando vendedores.
            <br/>
            <a href="${appUrl}/settings/users" style="color: hsl(232 76% 58%); text-decoration: none;">
              Ir a Configuración → Usuarios →
            </a>
          </li>
        </ol>
      </div>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${appUrl}/dashboard"
           style="display: inline-block; background: ${VIBOOK_EMAIL_GRADIENT}; color: white; padding: 14px 32px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 15px;">
          Abrir Vibook
        </a>
      </div>

      <p style="font-size: 13px; color: #6b7280; line-height: 1.6; margin: 24px 0 0 0;">
        ¿Algo no funciona o tenés una duda? Respondé este mail o escribinos a
        <a href="mailto:soporte@vibook.ai" style="color: hsl(232 76% 58%); text-decoration: none;">soporte@vibook.ai</a>.
      </p>
    </div>

    <div style="background: #f9fafb; padding: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
      Vibook — Gestión integral para agencias de viajes
    </div>
  </div>
</body>
</html>`

  return sendEmail({
    to,
    subject: `Bienvenido a Vibook · ${agencyName}`,
    html,
    replyTo: "soporte@vibook.ai",
  })
}

/**
 * Recordatorio de trial por vencer. Pensado para ser disparado por
 * un cron cuando faltan ~2-3 días para que el trial se acabe y el
 * tenant todavía no eligió plan / conectó MP.
 *
 * El objetivo es conversion + no-sorpresa: que el user no se entere
 * de que "no le anda" porque el sistema lo bloqueó por trial vencido.
 */
export async function sendTrialExpiringEmail(
  to: string,
  agencyName: string,
  trialEndsAt: Date,
  daysLeft: number
): Promise<SendEmailResult> {
  const trialFmt = trialEndsAt.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
  })
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai"
  const subjectPrefix = daysLeft <= 1 ? "¡Mañana!" : `${daysLeft} días`

  const html = `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 0; background: #f5f7fa;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; margin-top: 24px; margin-bottom: 24px;">
    <div style="background: ${VIBOOK_EMAIL_GRADIENT_WARNING}; padding: 36px 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">
        Tu trial vence ${daysLeft <= 1 ? "mañana" : `en ${daysLeft} días`}
      </h1>
      <p style="color: rgba(255,255,255,0.9); margin: 12px 0 0 0; font-size: 15px;">
        ${agencyName} · ${trialFmt}
      </p>
    </div>

    <div style="padding: 32px 30px;">
      <p style="font-size: 15px; color: #1f2937; line-height: 1.6; margin: 0 0 20px 0;">
        Para que <strong>${agencyName}</strong> siga operando sin interrupción,
        elegí un plan y conectá Mercado Pago antes del <strong>${trialFmt}</strong>.
      </p>

      <p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin: 0 0 20px 0;">
        Si no te suscribís, el acceso queda suspendido hasta que pagues. Tus
        datos NO se borran — siguen ahí para cuando reactives.
      </p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${appUrl}/onboarding/billing"
           style="display: inline-block; background: ${VIBOOK_EMAIL_GRADIENT}; color: white; padding: 14px 32px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 15px;">
          Elegir plan y pagar
        </a>
      </div>

      <p style="font-size: 13px; color: #6b7280; line-height: 1.6; margin: 24px 0 0 0;">
        ¿Necesitás un plan custom o tenés dudas? Respondé este mail o escribinos a
        <a href="mailto:soporte@vibook.ai" style="color: hsl(232 76% 58%); text-decoration: none;">soporte@vibook.ai</a>.
      </p>
    </div>

    <div style="background: #f9fafb; padding: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
      Vibook — Gestión integral para agencias de viajes
    </div>
  </div>
</body>
</html>`

  return sendEmail({
    to,
    subject: `[${subjectPrefix}] Tu trial de Vibook vence pronto · ${agencyName}`,
    html,
    replyTo: "soporte@vibook.ai",
  })
}

/**
 * Aviso de cobro de suscripción rechazado (dunning).
 *
 * Se manda desde el cron past-due-reminders mientras la org está PAST_DUE y
 * todavía dentro de la gracia. El objetivo es concreto: que el dueño entre y
 * apriete "Regularizar pago" ANTES de que se le corte, porque MP no reintenta
 * el ciclo caído — lo saltea y reprograma al mes siguiente.
 *
 * `reason` sale de lib/billing/rejection-reason.ts. Es la diferencia entre
 * "no te pudimos cobrar" (inaccionable) y "no había saldo en tu cuenta de MP".
 */
export async function sendPaymentFailedEmail(
  to: string,
  agencyName: string,
  opts: {
    amountArs: number | null
    graceEndsAt: Date
    daysLeft: number
    reasonLabel: string | null
    reasonAction: string | null
  }
): Promise<SendEmailResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai"
  const graceFmt = opts.graceEndsAt.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
  })
  const amountFmt =
    opts.amountArs != null ? `${Number(opts.amountArs).toLocaleString("es-AR")}` : null
  const urgent = opts.daysLeft <= 1

  const html = `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 0; background: #f5f7fa;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; margin-top: 24px; margin-bottom: 24px;">
    <div style="background: ${VIBOOK_EMAIL_GRADIENT_WARNING}; padding: 36px 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">
        No pudimos procesar tu pago
      </h1>
      <p style="color: rgba(255,255,255,0.9); margin: 12px 0 0 0; font-size: 15px;">
        ${agencyName}${amountFmt ? ` · ${amountFmt}` : ""}
      </p>
    </div>

    <div style="padding: 32px 30px;">
      <p style="font-size: 15px; color: #1f2937; line-height: 1.6; margin: 0 0 20px 0;">
        Mercado Pago rechazó el cobro de tu suscripción${
          opts.reasonLabel ? `: <strong>${opts.reasonLabel}</strong>` : ""
        }.
      </p>

      ${
        opts.reasonAction
          ? `<p style="font-size: 14px; color: #1f2937; line-height: 1.6; margin: 0 0 20px 0; padding: 12px 16px; background: #fef3f2; border-radius: 10px;">
        ${opts.reasonAction}
      </p>`
          : ""
      }

      <p style="font-size: 15px; color: #1f2937; line-height: 1.6; margin: 0 0 20px 0;">
        ${
          urgent
            ? `<strong>El acceso a ${agencyName} se suspende hoy</strong> si el pago no se regulariza.`
            : `Tenés hasta el <strong>${graceFmt}</strong> para regularizarlo. Después el acceso queda suspendido.`
        }
      </p>

      <p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin: 0 0 20px 0;">
        Importante: Mercado Pago no vuelve a intentar este cobro por su cuenta.
        Para reactivar la suscripción tenés que completar el pago desde el botón
        de abajo. Tus datos NO se borran.
      </p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${appUrl}/settings/subscription"
           style="display: inline-block; background: ${VIBOOK_EMAIL_GRADIENT}; color: white; padding: 14px 32px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 15px;">
          Regularizar pago
        </a>
      </div>

      <p style="font-size: 13px; color: #6b7280; line-height: 1.6; margin: 24px 0 0 0;">
        ¿Ya pagaste o querés cambiar el medio de pago? Respondé este mail o
        escribinos a
        <a href="mailto:soporte@vibook.ai" style="color: hsl(232 76% 58%); text-decoration: none;">soporte@vibook.ai</a>.
      </p>
    </div>

    <div style="background: #f9fafb; padding: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
      Vibook — Gestión integral para agencias de viajes
    </div>
  </div>
</body>
</html>`

  return sendEmail({
    to,
    subject: urgent
      ? `[Urgente] Tu acceso a Vibook se suspende hoy · ${agencyName}`
      : `No pudimos cobrar tu suscripción de Vibook · ${agencyName}`,
    html,
    replyTo: "soporte@vibook.ai",
  })
}

/**
 * Enviar cotización por email
 */
export async function sendQuotationEmail(
  to: string,
  quotationNumber: string,
  customerName: string,
  destination: string,
  totalAmount: string,
  validUntil: string,
  agencyName: string,
  pdfBuffer?: Buffer,
  supabase?: any
): Promise<SendEmailResult> {
  let orgSettings: OrgSettings | undefined
  if (supabase) {
    orgSettings = await getOrgSettings(supabase)
  }

  const html = generateQuotationEmailHtml({
    customerName,
    quotationNumber,
    destination,
    totalAmount,
    validUntil,
    agencyName,
    orgSettings,
  })

  return sendEmail({
    to,
    subject: `Cotización ${quotationNumber} - ${destination}`,
    html,
    attachments: pdfBuffer ? [{
      filename: `cotizacion-${quotationNumber}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    }] : undefined,
  })
}

/**
 * Enviar el "Detalle de la Operación" (Liquidación de Servicios) al pasajero,
 * con el PDF adjunto. Documento de respaldo de la reserva confirmada: qué
 * servicios contrató, a qué valor y hasta cuándo tiene para pagar.
 *
 * Modelado sobre sendQuotationEmail (mismo patrón de pdfBuffer + branding).
 */
export async function sendOperationStatementEmail(
  to: string,
  data: {
    customerName: string
    destination: string
    fileCode: string
    totalAmount: string
    dueDate: string
    agencyName: string
  },
  pdfBuffer: Buffer,
  supabase?: any
): Promise<SendEmailResult> {
  let orgSettings: OrgSettings | undefined
  if (supabase) {
    orgSettings = await getOrgSettings(supabase)
  }
  const companyName = orgSettings?.companyName || data.agencyName
  const org = orgSettings || { companyName, address: '', phone: '', email: '', website: '', logo: '' }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: hsl(222 47% 11%); max-width: 600px; margin: 0 auto; padding: 20px;">
  ${generateEmailHeader(org, 'Confirmación de Servicios', VIBOOK_EMAIL_GRADIENT_SUCCESS)}

  <div style="background: hsl(224 28% 97%); padding: 30px; border: 1px solid hsl(224 18% 92%);">
    <p style="font-size: 18px;">Hola <strong>${data.customerName}</strong>,</p>

    <p>Te adjuntamos la confirmación de los servicios turísticos solicitados a <strong>${companyName}</strong> para tu viaje a <strong>${data.destination}</strong>.</p>

    <div style="background: hsl(0 0% 100%); padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid hsl(160 58% 42%);">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: hsl(226 12% 48%);">Expediente:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold;">${data.fileCode}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: hsl(226 12% 48%);">Importe a pagar:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold; font-size: 20px; color: hsl(160 58% 42%);">${data.totalAmount}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: hsl(226 12% 48%);">Fecha máxima de pago:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold;">${data.dueDate}</td>
        </tr>
      </table>
    </div>

    <p>En el PDF adjunto encontrás el detalle completo de los servicios contratados.</p>

    <p style="color: hsl(226 12% 48%); font-size: 14px;">
      Todos los servicios detallados están sujetos al pago efectivo de los mismos.
      Si necesitás asistencia, estamos a tu disposición.
    </p>
  </div>

  ${generateEmailFooter(org)}
</body>
</html>
  `

  return sendEmail({
    to,
    subject: `Confirmación de servicios turísticos - ${data.destination}`,
    html,
    attachments: [{
      filename: `detalle-operacion-${data.fileCode}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    }],
  })
}

/**
 * Enviar una factura AFIP al cliente por email, con el PDF adjunto.
 * Modelado sobre sendOperationStatementEmail.
 */
export async function sendInvoiceEmail(
  to: string,
  data: {
    customerName: string
    invoiceLabel: string   // ej. "Factura B 0004-00000123"
    total: string          // ya formateado con moneda
    agencyName: string
  },
  pdfBuffer: Buffer,
  filename: string,
  supabase?: any
): Promise<SendEmailResult> {
  let orgSettings: OrgSettings | undefined
  if (supabase) {
    orgSettings = await getOrgSettings(supabase)
  }
  const companyName = orgSettings?.companyName || data.agencyName
  const org = orgSettings || { companyName, address: '', phone: '', email: '', website: '', logo: '' }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: hsl(222 47% 11%); max-width: 600px; margin: 0 auto; padding: 20px;">
  ${generateEmailHeader(org, 'Comprobante Fiscal', VIBOOK_EMAIL_GRADIENT)}

  <div style="background: hsl(224 28% 97%); padding: 30px; border: 1px solid hsl(224 18% 92%);">
    <p style="font-size: 18px;">Hola <strong>${data.customerName}</strong>,</p>

    <p>Te adjuntamos tu comprobante fiscal emitido por <strong>${companyName}</strong>.</p>

    <div style="background: hsl(0 0% 100%); padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid hsl(232 76% 58%);">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: hsl(226 12% 48%);">Comprobante:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold;">${data.invoiceLabel}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: hsl(226 12% 48%);">Total:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold; font-size: 20px; color: hsl(232 76% 58%);">${data.total}</td>
        </tr>
      </table>
    </div>

    <p>El PDF adjunto es tu comprobante fiscal oficial con el código QR de AFIP.</p>

    <p style="color: hsl(226 12% 48%); font-size: 14px;">
      Conservá este comprobante. Si necesitás asistencia, estamos a tu disposición.
    </p>
  </div>

  ${generateEmailFooter(org)}
</body>
</html>
  `

  return sendEmail({
    to,
    subject: `${data.invoiceLabel} - ${companyName}`,
    html,
    attachments: [{
      filename,
      content: pdfBuffer,
      contentType: "application/pdf",
    }],
  })
}

/**
 * Enviar un recibo de pago (o comprobante de devolución) al cliente por email,
 * con el PDF adjunto. Modelado sobre sendOperationStatementEmail.
 */
export async function sendReceiptEmail(
  to: string,
  data: {
    customerName: string
    receiptNumber: string
    amount: string          // ya formateado con moneda
    mode: "PAYMENT" | "REFUND"
    destination?: string
    agencyName: string
  },
  pdfBuffer: Buffer,
  filename: string,
  supabase?: any
): Promise<SendEmailResult> {
  let orgSettings: OrgSettings | undefined
  if (supabase) {
    orgSettings = await getOrgSettings(supabase)
  }
  const companyName = orgSettings?.companyName || data.agencyName
  const org = orgSettings || { companyName, address: '', phone: '', email: '', website: '', logo: '' }

  const isRefund = data.mode === "REFUND"
  const docLabel = isRefund ? "comprobante de devolución" : "recibo de pago"
  const subtitle = isRefund ? "Comprobante de Devolución" : "Recibo de Pago"
  const gradient = isRefund ? VIBOOK_EMAIL_GRADIENT_WARNING : VIBOOK_EMAIL_GRADIENT_SUCCESS
  const accent = isRefund ? "hsl(10 78% 66%)" : "hsl(160 58% 42%)"
  const amountLabel = isRefund ? "Monto devuelto" : "Monto recibido"

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: hsl(222 47% 11%); max-width: 600px; margin: 0 auto; padding: 20px;">
  ${generateEmailHeader(org, subtitle, gradient)}

  <div style="background: hsl(224 28% 97%); padding: 30px; border: 1px solid hsl(224 18% 92%);">
    <p style="font-size: 18px;">Hola <strong>${data.customerName}</strong>,</p>

    <p>Te adjuntamos el ${docLabel} emitido por <strong>${companyName}</strong>${data.destination ? ` por tu viaje a <strong>${data.destination}</strong>` : ""}.</p>

    <div style="background: hsl(0 0% 100%); padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${accent};">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: hsl(226 12% 48%);">Comprobante Nº:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold;">${data.receiptNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: hsl(226 12% 48%);">${amountLabel}:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold; font-size: 20px; color: ${accent};">${data.amount}</td>
        </tr>
      </table>
    </div>

    <p>En el PDF adjunto encontrás el detalle completo del ${docLabel}.</p>

    <p style="color: hsl(226 12% 48%); font-size: 14px;">
      Conservá este comprobante. Si necesitás asistencia, estamos a tu disposición.
    </p>
  </div>

  ${generateEmailFooter(org)}
</body>
</html>
  `

  return sendEmail({
    to,
    subject: `${subtitle} Nº ${data.receiptNumber} - ${companyName}`,
    html,
    attachments: [{
      filename,
      content: pdfBuffer,
      contentType: "application/pdf",
    }],
  })
}

/**
 * Enviar confirmación de pago
 */
export async function sendPaymentConfirmationEmail(
  to: string,
  customerName: string,
  amount: string,
  paymentMethod: string,
  destination: string,
  agencyName: string,
  supabase?: any
): Promise<SendEmailResult> {
  let orgSettings: OrgSettings | undefined
  if (supabase) {
    orgSettings = await getOrgSettings(supabase)
  }

  const displayName = orgSettings?.companyName || agencyName

  const html = generatePaymentConfirmationHtml({
    customerName,
    amount,
    paymentMethod,
    destination,
    agencyName,
    orgSettings,
  })

  return sendEmail({
    to,
    subject: `Confirmación de Pago - ${displayName}`,
    html,
  })
}

/**
 * Enviar recordatorio de pago
 */
export async function sendPaymentReminderEmail(
  to: string,
  customerName: string,
  amount: string,
  dueDate: string,
  destination: string,
  agencyName: string,
  supabase?: any
): Promise<SendEmailResult> {
  let orgSettings: OrgSettings | undefined
  if (supabase) {
    orgSettings = await getOrgSettings(supabase)
  }

  const html = generatePaymentReminderHtml({
    customerName,
    amount,
    dueDate,
    destination,
    agencyName,
    orgSettings,
  })

  return sendEmail({
    to,
    subject: `Recordatorio de Pago - ${destination}`,
    html,
  })
}

// ============================================
// TEMPLATES HTML
// ============================================

function generateQuotationEmailHtml(data: {
  customerName: string
  quotationNumber: string
  destination: string
  totalAmount: string
  validUntil: string
  agencyName: string
  orgSettings?: OrgSettings
}): string {
  const companyName = data.orgSettings?.companyName || data.agencyName
  const org = data.orgSettings || { companyName, address: '', phone: '', email: '', website: '', logo: '' }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: hsl(222 47% 11%); max-width: 600px; margin: 0 auto; padding: 20px;">
  ${generateEmailHeader(org, 'Cotización de Viaje', VIBOOK_EMAIL_GRADIENT)}

  <div style="background: hsl(224 28% 97%); padding: 30px; border: 1px solid hsl(224 18% 92%);">
    <p style="font-size: 18px;">Hola <strong>${data.customerName}</strong>,</p>

    <p>Te enviamos la cotización para tu viaje a <strong>${data.destination}</strong>.</p>

    <div style="background: hsl(0 0% 100%); padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid hsl(232 76% 58%);">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: hsl(226 12% 48%);">Número de Cotización:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold;">${data.quotationNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: hsl(226 12% 48%);">Destino:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold;">${data.destination}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: hsl(226 12% 48%);">Total:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold; font-size: 20px; color: hsl(232 76% 58%);">${data.totalAmount}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: hsl(226 12% 48%);">Válida hasta:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold; color: hsl(0 84% 60%);">${data.validUntil}</td>
        </tr>
      </table>
    </div>

    <p>Adjuntamos el PDF con el detalle completo de la cotización.</p>

    <p style="color: hsl(226 12% 48%); font-size: 14px;">
      Si tienes alguna consulta, no dudes en contactarnos.
    </p>
  </div>

  ${generateEmailFooter(org)}
</body>
</html>
  `
}

function generatePaymentConfirmationHtml(data: {
  customerName: string
  amount: string
  paymentMethod: string
  destination: string
  agencyName: string
  orgSettings?: OrgSettings
}): string {
  const companyName = data.orgSettings?.companyName || data.agencyName
  const org = data.orgSettings || { companyName, address: '', phone: '', email: '', website: '', logo: '' }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: hsl(222 47% 11%); max-width: 600px; margin: 0 auto; padding: 20px;">
  ${generateEmailHeader(org, 'Pago Confirmado', VIBOOK_EMAIL_GRADIENT_SUCCESS)}

  <div style="background: hsl(224 28% 97%); padding: 30px; border: 1px solid hsl(224 18% 92%);">
    <p style="font-size: 18px;">Hola <strong>${data.customerName}</strong>,</p>

    <p>Hemos recibido tu pago exitosamente. ¡Gracias!</p>

    <div style="background: hsl(0 0% 100%); padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid hsl(160 58% 42%);">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: hsl(226 12% 48%);">Monto:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold; font-size: 20px; color: hsl(160 58% 42%);">${data.amount}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: hsl(226 12% 48%);">Método:</td>
          <td style="padding: 8px 0; text-align: right;">${data.paymentMethod}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: hsl(226 12% 48%);">Concepto:</td>
          <td style="padding: 8px 0; text-align: right;">Viaje a ${data.destination}</td>
        </tr>
      </table>
    </div>

    <p style="color: hsl(226 12% 48%); font-size: 14px;">
      Conserva este email como comprobante de tu pago.
    </p>
  </div>

  ${generateEmailFooter(org)}
</body>
</html>
  `
}

function generatePaymentReminderHtml(data: {
  customerName: string
  amount: string
  dueDate: string
  destination: string
  agencyName: string
  orgSettings?: OrgSettings
}): string {
  const companyName = data.orgSettings?.companyName || data.agencyName
  const org = data.orgSettings || { companyName, address: '', phone: '', email: '', website: '', logo: '' }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: hsl(222 47% 11%); max-width: 600px; margin: 0 auto; padding: 20px;">
  ${generateEmailHeader(org, 'Recordatorio de Pago', VIBOOK_EMAIL_GRADIENT_WARNING)}

  <div style="background: hsl(224 28% 97%); padding: 30px; border: 1px solid hsl(224 18% 92%);">
    <p style="font-size: 18px;">Hola <strong>${data.customerName}</strong>,</p>

    <p>Te recordamos que tienes un pago pendiente para tu viaje a <strong>${data.destination}</strong>.</p>

    <div style="background: hsl(0 0% 100%); padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid hsl(10 78% 66%);">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: hsl(226 12% 48%);">Monto a pagar:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold; font-size: 20px; color: hsl(0 84% 60%);">${data.amount}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: hsl(226 12% 48%);">Fecha de vencimiento:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold;">${data.dueDate}</td>
        </tr>
      </table>
    </div>

    <p>Por favor, realiza el pago antes de la fecha indicada para confirmar tu reserva.</p>

    <p style="color: hsl(226 12% 48%); font-size: 14px;">
      Si ya realizaste el pago, puedes ignorar este mensaje.
    </p>
  </div>

  ${generateEmailFooter(org)}
</body>
</html>
  `
}

