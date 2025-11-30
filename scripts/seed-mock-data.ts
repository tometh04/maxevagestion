import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Helper to get random date in range
function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
}

// Helper to get random element from array
function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]
}

async function seedMockData() {
  console.log("🌱 Starting mock data seed...")

  try {
    // Get or create agencies
    let { data: agencies } = await supabase.from("agencies").select("*")

    if (!agencies || agencies.length === 0) {
      const { data: newAgencies } = await supabase
        .from("agencies")
        .insert([
          { name: "Rosario", city: "Rosario", timezone: "America/Argentina/Buenos_Aires" },
          { name: "Madero", city: "Buenos Aires", timezone: "America/Argentina/Buenos_Aires" },
          { name: "Córdoba", city: "Córdoba", timezone: "America/Argentina/Buenos_Aires" },
        ])
        .select()

      agencies = newAgencies || []
      console.log("✅ Created agencies")
    } else {
      console.log("✅ Using existing agencies")
    }

    if (!agencies || agencies.length === 0) {
      throw new Error("No agencies available")
    }

    // Get or create users
    let { data: users } = await supabase.from("users").select("*").in("role", ["SELLER", "ADMIN"])

    if (!users || users.length === 0) {
      // Create seller users
      const sellerEmails = ["vendedor1@erplozada.com", "vendedor2@erplozada.com", "vendedor3@erplozada.com"]
      const sellerNames = ["María González", "Juan Pérez", "Ana Martínez"]

      for (let i = 0; i < sellerEmails.length; i++) {
        const { data: authUser } = await supabase.auth.admin.createUser({
          email: sellerEmails[i],
          password: "vendedor123",
          email_confirm: true,
        })

        if (authUser.user) {
          const { data: newUser } = await supabase
            .from("users")
            .insert({
              auth_id: authUser.user.id,
              name: sellerNames[i],
              email: sellerEmails[i],
              role: "SELLER",
              is_active: true,
            })
            .select()
            .single()

          if (newUser && agencies[0]) {
            await supabase.from("user_agencies").insert({
              user_id: newUser.id,
              agency_id: agencies[0].id,
            })
          }
        }
      }

      users = await supabase.from("users").select("*").in("role", ["SELLER", "ADMIN"]).then((r) => r.data || [])
      console.log("✅ Created seller users")
    } else {
      console.log("✅ Using existing users")
    }

    // Get or create operators
    let { data: operators } = await supabase.from("operators").select("*")

    if (!operators || operators.length === 0) {
      const { data: newOperators } = await supabase
        .from("operators")
        .insert([
          {
            name: "Despegar",
            contact_name: "Juan Pérez",
            contact_email: "juan@despegar.com",
            contact_phone: "+54 11 1234-5678",
            credit_limit: 500000,
          },
          {
            name: "Aerolíneas Argentinas",
            contact_name: "María García",
            contact_email: "maria@aerolineas.com",
            contact_phone: "+54 11 2345-6789",
            credit_limit: 1000000,
          },
          {
            name: "Latam",
            contact_name: "Carlos López",
            contact_email: "carlos@latam.com",
            contact_phone: "+54 11 3456-7890",
            credit_limit: 750000,
          },
          {
            name: "Royal Caribbean",
            contact_name: "Laura Fernández",
            contact_email: "laura@royalcaribbean.com",
            contact_phone: "+54 11 4567-8901",
            credit_limit: 2000000,
          },
        ])
        .select()

      operators = newOperators || []
      console.log("✅ Created operators")
    } else {
      console.log("✅ Using existing operators")
    }

    // Create customers
    const customerData = [
      {
        first_name: "Carlos",
        last_name: "Rodríguez",
        phone: "+54 9 11 1234-5678",
        email: "carlos.rodriguez@email.com",
        instagram_handle: "@carlosrodriguez",
        document_type: "DNI",
        document_number: "12345678",
        date_of_birth: "1985-05-15",
        nationality: "Argentina",
      },
      {
        first_name: "Sofía",
        last_name: "Martínez",
        phone: "+54 9 11 2345-6789",
        email: "sofia.martinez@email.com",
        instagram_handle: "@sofiamartinez",
        document_type: "DNI",
        document_number: "23456789",
        date_of_birth: "1990-08-22",
        nationality: "Argentina",
      },
      {
        first_name: "Diego",
        last_name: "Fernández",
        phone: "+54 9 11 3456-7890",
        email: "diego.fernandez@email.com",
        document_type: "DNI",
        document_number: "34567890",
        date_of_birth: "1988-12-10",
        nationality: "Argentina",
      },
      {
        first_name: "Valentina",
        last_name: "López",
        phone: "+54 9 11 4567-8901",
        email: "valentina.lopez@email.com",
        instagram_handle: "@valentinalopez",
        document_type: "PASSPORT",
        document_number: "AB123456",
        date_of_birth: "1992-03-25",
        nationality: "Argentina",
      },
      {
        first_name: "Martín",
        last_name: "García",
        phone: "+54 9 11 5678-9012",
        email: "martin.garcia@email.com",
        document_type: "DNI",
        document_number: "45678901",
        date_of_birth: "1987-07-18",
        nationality: "Argentina",
      },
    ]

    let { data: customers } = await supabase.from("customers").select("*").limit(5)

    if (!customers || customers.length < 5) {
      const { data: newCustomers } = await supabase.from("customers").insert(customerData).select()
      customers = newCustomers || []
      console.log("✅ Created customers")
    } else {
      console.log("✅ Using existing customers")
    }

    // Create leads
    const leadStatuses: Array<"NEW" | "IN_PROGRESS" | "QUOTED" | "WON" | "LOST"> = [
      "NEW",
      "IN_PROGRESS",
      "QUOTED",
      "WON",
      "LOST",
    ]
    const regions = ["ARGENTINA", "CARIBE", "BRASIL", "EUROPA", "EEUU", "OTROS", "CRUCEROS"]
    const sources = ["Instagram", "WhatsApp", "Meta Ads", "Other"]
    const destinations = [
      "Buenos Aires",
      "Bariloche",
      "Mendoza",
      "Cancún",
      "Punta Cana",
      "Río de Janeiro",
      "París",
      "Roma",
      "Miami",
      "Nueva York",
      "Barcelona",
      "Madrid",
    ]

    const leadsData = Array.from({ length: 25 }, (_, i) => {
      const createdDate = randomDate(new Date(2024, 0, 1), new Date())
      const seller = users && users.length > 0 ? randomElement(users) : null

      return {
        agency_id: randomElement(agencies).id,
        source: randomElement(sources),
        status: randomElement(leadStatuses),
        region: randomElement(regions),
        destination: randomElement(destinations),
        contact_name: `Cliente ${i + 1}`,
        contact_phone: `+54 9 11 ${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`,
        contact_email: `cliente${i + 1}@email.com`,
        contact_instagram: `@cliente${i + 1}`,
        assigned_seller_id: seller?.id || null,
        notes: i % 3 === 0 ? `Notas del lead ${i + 1}` : null,
        created_at: createdDate.toISOString(),
        updated_at: createdDate.toISOString(),
      }
    })

    const { data: leads } = await supabase.from("leads").insert(leadsData).select()
    console.log("✅ Created leads")

    // Create operations
    if (!leads || !users || !operators || !customers) {
      throw new Error("Missing required data for operations")
    }

    const operationStatuses: Array<"PRE_RESERVATION" | "RESERVED" | "CONFIRMED" | "CANCELLED" | "TRAVELLED" | "CLOSED"> =
      ["PRE_RESERVATION", "RESERVED", "CONFIRMED", "CANCELLED", "TRAVELLED", "CLOSED"]
    const operationTypes = ["FLIGHT", "HOTEL", "PACKAGE", "CRUISE", "TRANSFER", "MIXED"]
    const currencies = ["ARS", "USD"]

    const operationsData = Array.from({ length: 30 }, (_, i) => {
      const departureDate = randomDate(new Date(), new Date(2025, 11, 31))
      const returnDate = i % 2 === 0 ? randomDate(departureDate, new Date(2025, 11, 31)) : null
      const saleAmount = Math.floor(Math.random() * 500000) + 50000
      const operatorCost = Math.floor(saleAmount * (0.6 + Math.random() * 0.2))
      const marginAmount = saleAmount - operatorCost
      const marginPercentage = (marginAmount / saleAmount) * 100

      return {
        agency_id: randomElement(agencies).id,
        lead_id: i < leads.length ? leads[i].id : null,
        seller_id: randomElement(users).id,
        operator_id: randomElement(operators).id,
        type: randomElement(operationTypes),
        origin: i % 3 === 0 ? "Buenos Aires" : null,
        destination: randomElement(destinations),
        departure_date: departureDate.toISOString().split("T")[0],
        return_date: returnDate ? returnDate.toISOString().split("T")[0] : null,
        adults: Math.floor(Math.random() * 3) + 1,
        children: Math.random() > 0.7 ? Math.floor(Math.random() * 2) : 0,
        infants: Math.random() > 0.9 ? 1 : 0,
        status: randomElement(operationStatuses),
        sale_amount_total: saleAmount,
        operator_cost: operatorCost,
        currency: randomElement(currencies),
        margin_amount: marginAmount,
        margin_percentage: marginPercentage,
        created_at: randomDate(new Date(2024, 0, 1), new Date()).toISOString(),
        updated_at: new Date().toISOString(),
      }
    })

    const { data: operations } = await supabase.from("operations").insert(operationsData).select()
    console.log("✅ Created operations")

    // Link customers to operations
    if (operations && customers) {
      const operationCustomers = []
      for (let i = 0; i < Math.min(operations.length, customers.length * 2); i++) {
        operationCustomers.push({
          operation_id: operations[i % operations.length].id,
          customer_id: customers[i % customers.length].id,
          role: i % 2 === 0 ? "MAIN" : "COMPANION",
        })
      }
      await supabase.from("operation_customers").insert(operationCustomers)
      console.log("✅ Linked customers to operations")
    }

    // Create payments
    if (!operations) {
      throw new Error("No operations available")
    }

    const paymentsData = []
    for (const operation of operations) {
      const departureDate = new Date(operation.departure_date)

      // Customer payments (INCOME)
      const customerPayment1 = {
        operation_id: operation.id,
        payer_type: "CUSTOMER",
        direction: "INCOME",
        method: randomElement(["Transferencia", "Efectivo", "Tarjeta", "Mercado Pago"]),
        amount: Math.floor(operation.sale_amount_total * 0.5),
        currency: operation.currency,
        date_due: new Date(departureDate.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        date_paid:
          Math.random() > 0.4
            ? new Date(departureDate.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
            : null,
        status: Math.random() > 0.4 ? "PAID" : "PENDING",
        reference: Math.random() > 0.5 ? `REF-${Math.floor(Math.random() * 10000)}` : null,
      }

      const customerPayment2 = {
        operation_id: operation.id,
        payer_type: "CUSTOMER",
        direction: "INCOME",
        method: randomElement(["Transferencia", "Efectivo", "Tarjeta"]),
        amount: operation.sale_amount_total - customerPayment1.amount,
        currency: operation.currency,
        date_due: new Date(departureDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        date_paid: null,
        status: "PENDING",
        reference: null,
      }

      // Operator payments (EXPENSE)
      const operatorPayment1 = {
        operation_id: operation.id,
        payer_type: "OPERATOR",
        direction: "EXPENSE",
        method: "Transferencia",
        amount: Math.floor(operation.operator_cost * 0.6),
        currency: operation.currency,
        date_due: new Date(departureDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        date_paid:
          Math.random() > 0.6
            ? new Date(departureDate.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
            : null,
        status: Math.random() > 0.6 ? "PAID" : "PENDING",
        reference: Math.random() > 0.5 ? `OP-${Math.floor(Math.random() * 10000)}` : null,
      }

      const operatorPayment2 = {
        operation_id: operation.id,
        payer_type: "OPERATOR",
        direction: "EXPENSE",
        method: "Transferencia",
        amount: operation.operator_cost - operatorPayment1.amount,
        currency: operation.currency,
        date_due: departureDate.toISOString().split("T")[0],
        date_paid: null,
        status: "PENDING",
        reference: null,
      }

      paymentsData.push(customerPayment1, customerPayment2, operatorPayment1, operatorPayment2)
    }

    await supabase.from("payments").insert(paymentsData)
    console.log("✅ Created payments")

    // Create cash movements
    const movementsData = []
    const today = new Date()
    const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Get paid payments to create movements
    const { data: paidPayments } = await supabase
      .from("payments")
      .select("*")
      .eq("status", "PAID")
      .not("date_paid", "is", null)

    if (paidPayments) {
      for (const payment of paidPayments.slice(0, 40)) {
        const movementDate = payment.date_paid
          ? new Date(payment.date_paid)
          : randomDate(last30Days, today)

        movementsData.push({
          operation_id: payment.operation_id,
          user_id: randomElement(users).id,
          type: payment.direction === "INCOME" ? "INCOME" : "EXPENSE",
          category: payment.direction === "INCOME" ? "Pago Cliente" : "Pago Operador",
          amount: payment.amount,
          currency: payment.currency,
          movement_date: movementDate.toISOString(),
          notes: payment.reference || null,
        })
      }
    }

    // Add some manual movements
    for (let i = 0; i < 10; i++) {
      movementsData.push({
        operation_id: null,
        user_id: randomElement(users).id,
        type: randomElement(["INCOME", "EXPENSE"]),
        category: randomElement([
          "Gastos Generales",
          "Marketing",
          "Sueldos",
          "Alquiler",
          "Servicios",
          "Otros Ingresos",
        ]),
        amount: Math.floor(Math.random() * 100000) + 10000,
        currency: randomElement(["ARS", "USD"]),
        movement_date: randomDate(last30Days, today).toISOString(),
        notes: `Movimiento manual ${i + 1}`,
      })
    }

    await supabase.from("cash_movements").insert(movementsData)
    console.log("✅ Created cash movements")

    // Create alerts
    const alertsData = []
    const alertTypes = ["PAYMENT_DUE", "OPERATOR_DUE", "UPCOMING_TRIP", "MISSING_DOC", "GENERIC"]

    // Payment due alerts
    const { data: pendingPayments } = await supabase
      .from("payments")
      .select("*, operations(seller_id)")
      .eq("status", "PENDING")
      .lte("date_due", new Date().toISOString().split("T")[0])

    if (pendingPayments) {
      for (const payment of pendingPayments.slice(0, 15)) {
        const operation = payment.operations as any
        alertsData.push({
          operation_id: payment.operation_id,
          user_id: operation?.seller_id || null,
          type: payment.direction === "INCOME" ? "PAYMENT_DUE" : "OPERATOR_DUE",
          description: `Pago ${payment.direction === "INCOME" ? "de cliente" : "a operador"} pendiente: ${payment.amount} ${payment.currency}`,
          date_due: payment.date_due,
          status: "PENDING",
        })
      }
    }

    // Upcoming trip alerts
    const { data: upcomingOperations } = await supabase
      .from("operations")
      .select("*")
      .in("status", ["RESERVED", "CONFIRMED"])
      .gte("departure_date", new Date().toISOString().split("T")[0])
      .lte("departure_date", new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])

    if (upcomingOperations) {
      for (const operation of upcomingOperations.slice(0, 5)) {
        alertsData.push({
          operation_id: operation.id,
          user_id: operation.seller_id,
          type: "UPCOMING_TRIP",
          description: `Viaje próximo: ${operation.destination} - Salida: ${operation.departure_date}`,
          date_due: operation.departure_date,
          status: "PENDING",
        })
      }
    }

    await supabase.from("alerts").insert(alertsData)
    console.log("✅ Created alerts")

    // Create commission records for confirmed and paid operations
    const { data: confirmedOperations } = await supabase
      .from("operations")
      .select("*")
      .eq("status", "CONFIRMED")

    if (confirmedOperations) {
      for (const operation of confirmedOperations.slice(0, 10)) {
        // Check if all customer payments are paid
        const { data: customerPayments } = await supabase
          .from("payments")
          .select("*")
          .eq("operation_id", operation.id)
          .eq("direction", "INCOME")
          .eq("payer_type", "CUSTOMER")

        const allPaid = customerPayments?.every((p: any) => p.status === "PAID") && (customerPayments?.length || 0) > 0

        if (allPaid && operation.margin_amount > 0) {
          // Simple 20% commission rule
          const commissionAmount = operation.margin_amount * 0.2

          await supabase.from("commission_records").insert({
            operation_id: operation.id,
            seller_id: operation.seller_id,
            agency_id: operation.agency_id,
            amount: commissionAmount,
            status: Math.random() > 0.7 ? "PAID" : "PENDING",
            date_calculated: new Date().toISOString().split("T")[0],
            date_paid: Math.random() > 0.7 ? new Date().toISOString().split("T")[0] : null,
          })
        }
      }
      console.log("✅ Created commission records")
    }

    // Create commission rule if it doesn't exist
    const { data: existingRules } = await supabase.from("commission_rules").select("*").limit(1)

    if (!existingRules || existingRules.length === 0) {
      await supabase.from("commission_rules").insert({
        type: "SELLER",
        basis: "FIXED_PERCENTAGE",
        value: 20,
        valid_from: new Date().toISOString().split("T")[0],
      })
      console.log("✅ Created default commission rule")
    }

    console.log("🎉 Mock data seed completed!")
    console.log("")
    console.log("📊 Summary:")
    console.log(`  - Agencies: ${agencies.length}`)
    console.log(`  - Users: ${users?.length || 0}`)
    console.log(`  - Operators: ${operators?.length || 0}`)
    console.log(`  - Customers: ${customers?.length || 0}`)
    console.log(`  - Leads: ${leads?.length || 0}`)
    console.log(`  - Operations: ${operations?.length || 0}`)
    console.log(`  - Payments: ${paymentsData.length}`)
    console.log(`  - Cash Movements: ${movementsData.length}`)
    console.log(`  - Alerts: ${alertsData.length}`)
  } catch (error) {
    console.error("❌ Error seeding mock data:", error)
    throw error
  }
}

seedMockData().catch(console.error)

