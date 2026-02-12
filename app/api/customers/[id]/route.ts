import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { sendCustomerNotifications } from "@/lib/customers/customer-service"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id: customerId } = await params

    // Get customer
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .single()

    if (customerError || !customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    }

    // Get operations for this customer
    const { data: operationCustomers } = await supabase
      .from("operation_customers")
      .select(`
        *,
        operations:operation_id(
          *,
          sellers:seller_id(id, name),
          operators:operator_id(id, name),
          agencies:agency_id(id, name)
        )
      `)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })

    // Get payments related to customer's operations
    const operationIds = (operationCustomers || []).map((oc: any) => oc.operation_id)
    let payments: any[] = []
    if (operationIds.length > 0) {
      const { data: paymentsData } = await supabase
        .from("payments")
        .select("*")
        .in("operation_id", operationIds)
        .eq("payer_type", "CUSTOMER")
        .order("date_due", { ascending: true })
      payments = paymentsData || []
    }

    // Get documents
    const { data: documents } = await supabase
      .from("documents")
      .select("*")
      .eq("customer_id", customerId)
      .order("uploaded_at", { ascending: false })

    return NextResponse.json({
      customer,
      operations: operationCustomers || [],
      payments,
      documents: documents || [],
    })
  } catch (error) {
    console.error("Error in GET /api/customers/[id]:", error)
    return NextResponse.json({ error: "Error al obtener cliente" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    
    // Verificar permiso de escritura
    if (!canAccessModule(user.role as any, "customers")) {
      return NextResponse.json({ error: "No tiene permiso para editar clientes" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { id: customerId } = await params
    const body = await request.json()

    // Obtener configuración de clientes
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    if (agencyIds.length === 0) {
      return NextResponse.json({ error: "No tiene agencias asignadas" }, { status: 403 })
    }

    const { data: settings } = await supabase
      .from("customer_settings")
      .select("*")
      .eq("agency_id", agencyIds[0])
      .maybeSingle()

    // Aplicar validaciones de configuración
    const settingsData = settings as any
    if (settingsData?.validations) {
      const validations = settingsData.validations
      
      if (validations.email?.format === 'email' && body.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(body.email)) {
          return NextResponse.json({ error: "Email inválido" }, { status: 400 })
        }
      }
    }

    // Obtener cliente actual para notificaciones
    const { data: currentCustomer } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .single()

    // Whitelist de campos editables (prevenir overwrite de id/agency_id/created_at)
    const allowedFields = [
      'first_name', 'last_name', 'email', 'phone', 'address', 'city', 'state',
      'country', 'zip_code', 'date_of_birth', 'document_type', 'document_number',
      'nationality', 'passport_number', 'passport_expiry', 'notes', 'instagram',
      'emergency_contact_name', 'emergency_contact_phone', 'tags', 'gender',
      'preferred_language', 'preferred_currency', 'procedure_number',
    ]
    const updateData: any = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    const { data: customer, error: updateError } = await (supabase.from("customers") as any)
      .update(updateData)
      .eq("id", customerId)
      .select()
      .single()

    if (updateError || !customer) {
      console.error("Error updating customer:", updateError)
      return NextResponse.json({ error: "Error al actualizar cliente" }, { status: 400 })
    }

    // Enviar notificaciones si están configuradas
    if (settingsData?.notifications && currentCustomer) {
      await sendCustomerNotifications(
        supabase,
        'customer_updated',
        {
          id: customer.id,
          first_name: customer.first_name,
          last_name: customer.last_name,
          email: customer.email,
          phone: customer.phone,
        },
        agencyIds[0],
        settingsData.notifications
      )
    }

    return NextResponse.json({ success: true, customer })
  } catch (error) {
    console.error("Error in PATCH /api/customers/[id]:", error)
    return NextResponse.json({ error: "Error al actualizar cliente" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    
    // Verificar permiso de escritura
    if (!canAccessModule(user.role as any, "customers")) {
      return NextResponse.json({ error: "No tiene permiso para eliminar clientes" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { id: customerId } = await params

    // Obtener cliente antes de eliminar para notificaciones
    const { data: customerData } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .single()
    
    const customer = customerData as any

    // Obtener configuración para notificaciones
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    let settingsData: any = null
    if (agencyIds.length > 0) {
      const { data: settings } = await supabase
        .from("customer_settings")
        .select("*")
        .eq("agency_id", agencyIds[0])
        .maybeSingle()
      settingsData = settings
    }

    // Check if customer has operations - obtener más información para mensaje detallado
    const { data: operations, error: checkError } = await supabase
      .from("operation_customers")
      .select(`
        id,
        operations:operation_id(
          id,
          destination,
          status,
          departure_date
        )
      `)
      .eq("customer_id", customerId)

    if (checkError) {
      console.error("Error checking customer operations:", checkError)
      return NextResponse.json({ error: "Error al verificar cliente" }, { status: 500 })
    }

    if (operations && operations.length > 0) {
      // Verificar si hay operaciones activas (no canceladas, no cerradas)
      const activeOperations = operations.filter((oc: any) => {
        const op = oc.operations
        return op && !["CANCELLED", "CLOSED"].includes(op.status)
      })

      if (activeOperations.length > 0) {
        return NextResponse.json(
          { 
            error: `No se puede eliminar el cliente porque tiene ${activeOperations.length} operación(es) activa(s) asociada(s). Las operaciones deben estar canceladas o cerradas para poder eliminar el cliente.` 
          },
          { status: 400 }
        )
      } else {
        // Tiene operaciones pero todas están canceladas o cerradas - aún así no permitimos eliminar
        return NextResponse.json(
          { 
            error: `No se puede eliminar el cliente porque tiene ${operations.length} operación(es) asociada(s) (aunque estén canceladas o cerradas). Esta restricción evita perder el historial de viajes del cliente.` 
          },
          { status: 400 }
        )
      }
    }

    // Delete customer documents first
    await supabase
      .from("documents")
      .delete()
      .eq("customer_id", customerId)

    // Delete customer
    const { error: deleteError } = await supabase
      .from("customers")
      .delete()
      .eq("id", customerId)

    if (deleteError) {
      console.error("Error deleting customer:", deleteError)
      return NextResponse.json({ error: "Error al eliminar cliente" }, { status: 400 })
    }

    // Enviar notificaciones si están configuradas
    if (settingsData?.notifications && customerData && agencyIds.length > 0) {
      await sendCustomerNotifications(
        supabase,
        'customer_deleted',
        {
          id: customer.id,
          first_name: customer.first_name,
          last_name: customer.last_name,
          email: customer.email,
          phone: customer.phone,
        },
        agencyIds[0],
        settingsData.notifications
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/customers/[id]:", error)
    return NextResponse.json({ error: "Error al eliminar cliente" }, { status: 500 })
  }
}

