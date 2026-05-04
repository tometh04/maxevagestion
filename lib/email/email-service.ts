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

