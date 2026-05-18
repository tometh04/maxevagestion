import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule, isOwnDataOnly } from "@/lib/permissions"
import { format } from "date-fns"
import { es } from "date-fns/locale"

// Escapar HTML para prevenir XSS
function escapeHtml(str: string | null | undefined): string {
  if (!str) return ""
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    // Verificar permiso de acceso al módulo customers
    if (!canAccessModule(user.role as any, "customers")) {
      return NextResponse.json({ error: "No tiene permiso para ver clientes" }, { status: 403 })
    }

    // Cross-tenant fix (2026-05-18): no confiar en RLS; scopear explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { id: customerId } = await params

    // Si es SELLER con ownDataOnly, verificar que el cliente pertenece a sus operaciones
    if (isOwnDataOnly(user.role as any, "customers")) {
      const { data: sellerOps } = await (supabase.from("operations") as any)
        .select("id")
        .eq("org_id", (user as any).org_id)
        .or(`seller_primary_id.eq.${user.id},seller_secondary_id.eq.${user.id}`)

      const sellerOpIds = (sellerOps || []).map((op: any) => op.id)

      if (sellerOpIds.length === 0) {
        return NextResponse.json({ error: "No tiene permiso para ver este cliente" }, { status: 403 })
      }

      const { data: customerInSellerOps } = await (supabase.from("operation_customers") as any)
        .select("operation_id")
        .eq("customer_id", customerId)
        .eq("org_id", (user as any).org_id)
        .in("operation_id", sellerOpIds)

      if (!customerInSellerOps || customerInSellerOps.length === 0) {
        return NextResponse.json({ error: "No tiene permiso para ver este cliente" }, { status: 403 })
      }
    }

    // Obtener cliente (scopeado por org)
    const { data: customer, error: customerError } = await (supabase.from("customers") as any)
      .select(`
        *,
        agencies:agency_id (id, name, address, phone, email, logo_url)
      `)
      .eq("id", customerId)
      .eq("org_id", (user as any).org_id)
      .single()

    if (customerError || !customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    }

    // Obtener operaciones del cliente (scopeado por org)
    const { data: operationCustomers } = await (supabase.from("operation_customers") as any)
      .select("operation_id")
      .eq("customer_id", customerId)
      .eq("org_id", (user as any).org_id)

    const operationIds = (operationCustomers || []).map((oc: any) => oc.operation_id)

    // Obtener pagos de esas operaciones (scopeado por org)
    let payments: any[] = []
    if (operationIds.length > 0) {
      const { data: paymentsData } = await (supabase.from("payments") as any)
        .select(`
          *,
          operations:operation_id (id, destination, departure_date)
        `)
        .in("operation_id", operationIds)
        .eq("org_id", (user as any).org_id)
        .order("date_due", { ascending: true })

      payments = paymentsData || []
    }

    // Calcular totales
    const totalOwed = payments
      .filter(p => p.status === "PENDING" && p.direction === "CUSTOMER_TO_AGENCY")
      .reduce((sum, p) => sum + (p.amount || 0), 0)

    const totalPaid = payments
      .filter(p => p.status === "PAID" && p.direction === "CUSTOMER_TO_AGENCY")
      .reduce((sum, p) => sum + (p.amount || 0), 0)

    const currency = payments[0]?.currency || "ARS"
    const today = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: es })

    // Generar HTML del PDF
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: hsl(222 47% 11%);
      padding: 40px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid hsl(232 76% 58%);
    }
    .logo { max-width: 150px; height: auto; }
    .agency-info { text-align: right; font-size: 11px; color: hsl(226 12% 48%); }
    .agency-name { font-size: 18px; font-weight: bold; color: hsl(222 47% 11%); margin-bottom: 5px; }

    .document-title {
      text-align: center;
      margin-bottom: 30px;
    }
    .document-title h1 {
      font-size: 24px;
      color: hsl(232 76% 58%);
      margin-bottom: 5px;
    }
    .document-title p { color: hsl(226 12% 48%); }

    .customer-info {
      background: hsl(224 28% 97%);
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .customer-info h2 {
      font-size: 14px;
      color: hsl(232 76% 58%);
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .info-item { font-size: 12px; }
    .info-label { color: hsl(226 12% 48%); }
    .info-value { font-weight: 600; }

    .summary-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }
    .summary-card {
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .summary-card.total { background: hsl(232 76% 58% / 0.10); }
    .summary-card.paid { background: hsl(160 58% 42% / 0.15); }
    .summary-card.pending { background: hsl(10 78% 66% / 0.15); }
    .summary-card h3 {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .summary-card .amount {
      font-size: 20px;
      font-weight: bold;
    }
    .summary-card.total h3 { color: hsl(232 76% 58%); }
    .summary-card.total .amount { color: hsl(232 76% 58%); }
    .summary-card.paid h3 { color: hsl(160 58% 42%); }
    .summary-card.paid .amount { color: hsl(160 58% 42%); }
    .summary-card.pending h3 { color: hsl(10 78% 50%); }
    .summary-card.pending .amount { color: hsl(10 78% 50%); }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    th {
      background: hsl(232 76% 58%);
      color: white;
      padding: 12px 10px;
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    th:first-child { border-radius: 8px 0 0 0; }
    th:last-child { border-radius: 0 8px 0 0; }
    td {
      padding: 12px 10px;
      border-bottom: 1px solid hsl(224 18% 92%);
    }
    tr:hover { background: hsl(224 28% 97%); }
    .status-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
    }
    .status-paid { background: hsl(160 58% 42% / 0.15); color: hsl(160 58% 42%); }
    .status-pending { background: hsl(10 78% 66% / 0.15); color: hsl(10 78% 50%); }
    .status-overdue { background: hsl(0 84% 60% / 0.15); color: hsl(0 84% 60%); }

    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid hsl(224 18% 92%);
      text-align: center;
      color: hsl(226 12% 48%);
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="agency-name">${escapeHtml(customer.agencies?.name) || "Agencia"}</div>
      ${customer.agencies?.address ? `<div style="font-size: 11px; color: hsl(226 12% 48%);">${escapeHtml(customer.agencies.address)}</div>` : ""}
    </div>
    <div class="agency-info">
      ${customer.agencies?.phone ? `<div>Tel: ${escapeHtml(customer.agencies.phone)}</div>` : ""}
      ${customer.agencies?.email ? `<div>${escapeHtml(customer.agencies.email)}</div>` : ""}
    </div>
  </div>
  
  <div class="document-title">
    <h1>Estado de Cuenta</h1>
    <p>Generado el ${today}</p>
  </div>
  
  <div class="customer-info">
    <h2>Datos del Cliente</h2>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">Nombre:</span>
        <span class="info-value">${escapeHtml(customer.first_name)} ${escapeHtml(customer.last_name)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Email:</span>
        <span class="info-value">${escapeHtml(customer.email) || "-"}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Teléfono:</span>
        <span class="info-value">${escapeHtml(customer.phone) || "-"}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Documento:</span>
        <span class="info-value">${escapeHtml(customer.document_type)} ${escapeHtml(customer.document_number) || "-"}</span>
      </div>
    </div>
  </div>
  
  <div class="summary-cards">
    <div class="summary-card total">
      <h3>Total Operaciones</h3>
      <div class="amount">${currency} ${(totalPaid + totalOwed).toLocaleString("es-AR")}</div>
    </div>
    <div class="summary-card paid">
      <h3>Total Pagado</h3>
      <div class="amount">${currency} ${totalPaid.toLocaleString("es-AR")}</div>
    </div>
    <div class="summary-card pending">
      <h3>Saldo Pendiente</h3>
      <div class="amount">${currency} ${totalOwed.toLocaleString("es-AR")}</div>
    </div>
  </div>
  
  <h2 style="margin-bottom: 15px; font-size: 14px; color: hsl(232 76% 58%);">Detalle de Movimientos</h2>
  
  <table>
    <thead>
      <tr>
        <th>Fecha</th>
        <th>Concepto</th>
        <th>Operación</th>
        <th>Estado</th>
        <th style="text-align: right;">Monto</th>
      </tr>
    </thead>
    <tbody>
      ${payments.length === 0 
        ? `<tr><td colspan="5" style="text-align: center; color: hsl(226 12% 48%);">No hay movimientos registrados</td></tr>`
        : payments.map(p => {
            const isOverdue = p.status === "PENDING" && new Date(p.date_due) < new Date()
            const statusClass = p.status === "PAID" ? "status-paid" : (isOverdue ? "status-overdue" : "status-pending")
            const statusLabel = p.status === "PAID" ? "Pagado" : (isOverdue ? "Vencido" : "Pendiente")
            return `
              <tr>
                <td>${format(new Date(p.date_due), "dd/MM/yyyy")}</td>
                <td>${escapeHtml(p.description) || (p.direction === "CUSTOMER_TO_AGENCY" ? "Pago cliente" : "Pago a operador")}</td>
                <td>${escapeHtml(p.operations?.destination) || "-"}</td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                <td style="text-align: right; font-weight: 600;">${p.currency} ${p.amount?.toLocaleString("es-AR")}</td>
              </tr>
            `
          }).join("")
      }
    </tbody>
  </table>
  
  <div class="footer">
    <p>Este documento es un resumen informativo y no constituye un comprobante fiscal.</p>
    <p>Generado automáticamente por ${customer.agencies?.name || "Sistema de Gestión"}</p>
  </div>
</body>
</html>
    `

    // Retornar HTML directamente (el cliente puede convertir a PDF o imprimir)
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="estado-cuenta-${customer.first_name}-${customer.last_name}.html"`,
      },
    })
  } catch (error: any) {
    console.error("Error generating statement:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

