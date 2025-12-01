import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { format } from "date-fns"
import { es } from "date-fns/locale"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id: customerId } = await params

    // Obtener cliente
    const { data: customer, error: customerError } = await (supabase.from("customers") as any)
      .select(`
        *,
        agencies:agency_id (id, name, address, phone, email, logo_url)
      `)
      .eq("id", customerId)
      .single()

    if (customerError || !customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    }

    // Obtener operaciones del cliente
    const { data: operationCustomers } = await (supabase.from("operation_customers") as any)
      .select("operation_id")
      .eq("customer_id", customerId)

    const operationIds = (operationCustomers || []).map((oc: any) => oc.operation_id)

    // Obtener pagos de esas operaciones
    let payments: any[] = []
    if (operationIds.length > 0) {
      const { data: paymentsData } = await (supabase.from("payments") as any)
        .select(`
          *,
          operations:operation_id (id, destination, departure_date)
        `)
        .in("operation_id", operationIds)
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
      color: #333;
      padding: 40px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #667eea;
    }
    .logo { max-width: 150px; height: auto; }
    .agency-info { text-align: right; font-size: 11px; color: #666; }
    .agency-name { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 5px; }
    
    .document-title {
      text-align: center;
      margin-bottom: 30px;
    }
    .document-title h1 {
      font-size: 24px;
      color: #667eea;
      margin-bottom: 5px;
    }
    .document-title p { color: #666; }
    
    .customer-info {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .customer-info h2 {
      font-size: 14px;
      color: #667eea;
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
    .info-label { color: #666; }
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
    .summary-card.total { background: #e3e7fd; }
    .summary-card.paid { background: #d4edda; }
    .summary-card.pending { background: #fff3cd; }
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
    .summary-card.total h3 { color: #667eea; }
    .summary-card.total .amount { color: #667eea; }
    .summary-card.paid h3 { color: #28a745; }
    .summary-card.paid .amount { color: #28a745; }
    .summary-card.pending h3 { color: #856404; }
    .summary-card.pending .amount { color: #856404; }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    th {
      background: #667eea;
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
      border-bottom: 1px solid #eee;
    }
    tr:hover { background: #f8f9fa; }
    .status-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
    }
    .status-paid { background: #d4edda; color: #28a745; }
    .status-pending { background: #fff3cd; color: #856404; }
    .status-overdue { background: #f8d7da; color: #dc3545; }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      text-align: center;
      color: #666;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="agency-name">${customer.agencies?.name || "Agencia"}</div>
      ${customer.agencies?.address ? `<div style="font-size: 11px; color: #666;">${customer.agencies.address}</div>` : ""}
    </div>
    <div class="agency-info">
      ${customer.agencies?.phone ? `<div>Tel: ${customer.agencies.phone}</div>` : ""}
      ${customer.agencies?.email ? `<div>${customer.agencies.email}</div>` : ""}
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
        <span class="info-value">${customer.first_name} ${customer.last_name}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Email:</span>
        <span class="info-value">${customer.email || "-"}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Teléfono:</span>
        <span class="info-value">${customer.phone || "-"}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Documento:</span>
        <span class="info-value">${customer.document_type || ""} ${customer.document_number || "-"}</span>
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
  
  <h2 style="margin-bottom: 15px; font-size: 14px; color: #667eea;">Detalle de Movimientos</h2>
  
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
        ? `<tr><td colspan="5" style="text-align: center; color: #666;">No hay movimientos registrados</td></tr>`
        : payments.map(p => {
            const isOverdue = p.status === "PENDING" && new Date(p.date_due) < new Date()
            const statusClass = p.status === "PAID" ? "status-paid" : (isOverdue ? "status-overdue" : "status-pending")
            const statusLabel = p.status === "PAID" ? "Pagado" : (isOverdue ? "Vencido" : "Pendiente")
            return `
              <tr>
                <td>${format(new Date(p.date_due), "dd/MM/yyyy")}</td>
                <td>${p.description || (p.direction === "CUSTOMER_TO_AGENCY" ? "Pago cliente" : "Pago a operador")}</td>
                <td>${p.operations?.destination || "-"}</td>
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

