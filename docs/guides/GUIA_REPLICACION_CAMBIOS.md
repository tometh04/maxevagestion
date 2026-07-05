# Guía Detallada para Replicar Cambios - Últimas 12 Horas

**Fecha:** 2026-01-14  
**Proyecto:** erplozada  
**Período:** Últimas 12 horas (17 commits)

---

## 📋 Índice

1. [Cambios en Operaciones](#cambios-en-operaciones)
2. [Cambios en Clientes](#cambios-en-clientes)
3. [Cambios en Contabilidad](#cambios-en-contabilidad)
4. [Cambios en UI/UX](#cambios-en-uiux)
5. [Migraciones de Base de Datos](#migraciones-de-base-de-datos)
6. [Checklist de Replicación](#checklist-de-replicación)

---

## 1. Cambios en Operaciones

### 1.1. Cambiar moneda predeterminada a USD

**Archivos afectados:**
- `components/operations/new-operation-dialog.tsx`
- `components/operations/edit-operation-dialog.tsx`
- `components/operations/operation-payments-section.tsx`
- `app/api/operations/route.ts`
- `app/api/operations/[id]/route.ts`
- `components/finances/finances-settings-page-client.tsx`
- `supabase/migrations/065_create_financial_settings.sql`

**Cambios a realizar:**

1. **En schemas de formularios:**
   - Cambiar `defaultValues.currency` de `"ARS"` a `"USD"`
   - Cambiar `defaultValues.sale_currency` de `"ARS"` a `"USD"`

2. **En APIs:**
   - Cambiar fallbacks de `currency || "ARS"` a `currency || "USD"`
   - Cambiar fallbacks de `sale_currency || "ARS"` a `sale_currency || "USD"`

3. **En migraciones:**
   - Verificar que `default_currency` sea `"USD"` en configuraciones

**Ejemplo:**
```typescript
// ANTES
currency: z.enum(["ARS", "USD"]).default("ARS")

// DESPUÉS
currency: z.enum(["ARS", "USD"]).default("USD")
```

---

### 1.2. Eliminar campos check-in/check-out

**Archivos afectados:**
- `components/operations/new-operation-dialog.tsx`
- `app/api/operations/route.ts`
- Schemas de validación (Zod)

**Cambios a realizar:**

1. **En schema de validación:**
   ```typescript
   // ELIMINAR estas líneas del schema:
   checkin_date: z.date().optional(),
   checkout_date: z.date().optional(),
   ```

2. **En formulario (JSX):**
   ```typescript
   // ELIMINAR estos FormField:
   <FormField
     control={form.control}
     name="checkin_date"
     render={({ field }) => (
       // ... campo de fecha
     )}
   />
   <FormField
     control={form.control}
     name="checkout_date"
     render={({ field }) => (
       // ... campo de fecha
     )}
   />
   ```

3. **En API (`app/api/operations/route.ts`):**
   - Eliminar `checkin_date` y `checkout_date` del destructuring
   - Eliminar de `operationData`
   - Eliminar referencias en lógica de cálculo de fechas

4. **En defaultValues:**
   ```typescript
   // ELIMINAR:
   checkin_date: undefined,
   checkout_date: undefined,
   ```

---

### 1.3. Agregar campo de Cliente al formulario

**Archivos afectados:**
- `components/operations/new-operation-dialog.tsx`
- `app/api/operations/route.ts`

**Cambios a realizar:**

1. **En schema:**
   ```typescript
   customer_id: z.string().uuid().optional().nullable(),
   ```

2. **En estado del componente:**
   ```typescript
   const [localCustomers, setLocalCustomers] = useState<Customer[]>([])
   const [showNewCustomerDialog, setShowNewCustomerDialog] = useState(false)

   useEffect(() => {
     const loadCustomers = async () => {
       const res = await fetch("/api/customers")
       const data = await res.json()
       setLocalCustomers(data.customers || [])
     }
     loadCustomers()
   }, [])
   ```

3. **En formulario (reemplazar "Tipo de Producto" con "Cliente"):**
   ```typescript
   <FormField
     control={form.control}
     name="customer_id"
     render={({ field }) => (
       <FormItem>
         <FormLabel>Cliente</FormLabel>
         <Select
           value={field.value || ""}
           onValueChange={(value) => field.onChange(value || null)}
         >
           <SelectTrigger>
             <SelectValue placeholder="Seleccionar cliente" />
           </SelectTrigger>
           <SelectContent>
             <SelectItem value="new">
               <Button variant="ghost" className="w-full">
                 <Plus className="h-4 w-4 mr-2" />
                 Crear nuevo cliente
               </Button>
             </SelectItem>
             {localCustomers.map((customer) => (
               <SelectItem key={customer.id} value={customer.id}>
                 {customer.first_name} {customer.last_name}
               </SelectItem>
             ))}
           </SelectContent>
         </Select>
       </FormItem>
     )}
   />
   ```

4. **En API (`app/api/operations/route.ts`):**
   ```typescript
   const { customer_id, ...rest } = body

   // En operationData:
   const operationData = {
     ...rest,
     customer_id: customer_id || null,
     // ... otros campos
   }
   ```

5. **Reorganizar campos:**
   - Cliente en columna 1
   - Vendedor Secundario en columna 2

---

### 1.4. Tipo de Producto por Operador

**Archivos afectados:**
- `components/operations/new-operation-dialog.tsx`
- `app/api/operations/route.ts`
- `supabase/migrations/066_add_product_type_to_operation_operators.sql` (NUEVO)

**Cambios a realizar:**

1. **Crear migración:**
   ```sql
   -- supabase/migrations/066_add_product_type_to_operation_operators.sql
   ALTER TABLE operation_operators
   ADD COLUMN IF NOT EXISTS product_type TEXT 
   CHECK (product_type IN ('FLIGHT', 'HOTEL', 'PACKAGE', 'CRUISE', 'TRANSFER', 'MIXED'));
   ```

2. **En componente (estado de operadores):**
   ```typescript
   interface Operator {
     operator_id: string
     cost: number
     cost_currency: string
     product_type?: 'FLIGHT' | 'HOTEL' | 'PACKAGE' | 'CRUISE' | 'TRANSFER' | 'MIXED'
   }

   const [operatorList, setOperatorList] = useState<Operator[]>([])
   ```

3. **En formulario (UI de operadores múltiples):**
   ```typescript
   {operatorList.map((op, index) => (
     <Card key={index}>
       <CardContent>
         {/* Select de operador */}
         {/* Input de costo */}
         {/* SELECT DE TIPO DE PRODUCTO */}
         <Select
           value={op.product_type || ""}
           onValueChange={(value) => {
             const updated = [...operatorList]
             updated[index].product_type = value as any
             setOperatorList(updated)
           }}
         >
           <SelectTrigger>
             <SelectValue placeholder="Tipo de producto" />
           </SelectTrigger>
           <SelectContent>
             <SelectItem value="FLIGHT">Vuelo</SelectItem>
             <SelectItem value="HOTEL">Hotel</SelectItem>
             <SelectItem value="PACKAGE">Paquete</SelectItem>
             <SelectItem value="CRUISE">Crucero</SelectItem>
             <SelectItem value="TRANSFER">Traslado</SelectItem>
             <SelectItem value="MIXED">Mixto</SelectItem>
           </SelectContent>
         </Select>
       </CardContent>
     </Card>
   ))}
   ```

4. **En API:**
   ```typescript
   const operatorsList = body.operators.map((op: any) => ({
     operator_id: op.operator_id,
     cost: op.cost,
     cost_currency: op.cost_currency,
     product_type: op.product_type || null,
   }))
   ```

---

### 1.5. Refresh automático de tabla

**Archivos afectados:**
- `components/operations/operations-table.tsx`
- `components/operations/new-operation-dialog.tsx`

**Cambios a realizar:**

1. **En `operations-table.tsx`:**
   ```typescript
   useEffect(() => {
     const handleRefresh = () => {
       fetchOperations()
     }
     window.addEventListener('refresh-operations', handleRefresh)
     return () => {
       window.removeEventListener('refresh-operations', handleRefresh)
     }
   }, [])
   ```

2. **En `new-operation-dialog.tsx` (después de crear operación exitosamente):**
   ```typescript
   // Después de toast.success:
   window.dispatchEvent(new Event('refresh-operations'))
   ```

---

### 1.6. Prevenir cierre accidental de diálogos

**Archivos afectados:**
- `components/operations/new-operation-dialog.tsx`
- `components/customers/new-customer-dialog.tsx`
- `components/operators/new-operator-dialog.tsx`

**Cambios a realizar:**

1. **Agregar estado:**
   ```typescript
   const [showCloseConfirm, setShowCloseConfirm] = useState(false)
   const [pendingClose, setPendingClose] = useState(false)
   ```

2. **Modificar Dialog:**
   ```typescript
   <Dialog
     open={open}
     onOpenChange={(newOpen) => {
       if (!newOpen && form.formState.isDirty) {
         setPendingClose(true)
         setShowCloseConfirm(true)
       } else {
         onOpenChange(newOpen)
       }
     }}
   >
   ```

3. **Agregar AlertDialog de confirmación:**
   ```typescript
   <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
     <AlertDialogContent>
       <AlertDialogHeader>
         <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
         <AlertDialogDescription>
           ¿Estás seguro que quieres cerrar? Perderás todos los cambios no guardados.
         </AlertDialogDescription>
       </AlertDialogHeader>
       <AlertDialogFooter>
         <AlertDialogCancel onClick={() => setShowCloseConfirm(false)}>
           Cancelar
         </AlertDialogCancel>
         <AlertDialogAction
           onClick={() => {
             setShowCloseConfirm(false)
             if (pendingClose) {
               form.reset()
               onOpenChange(false)
               setPendingClose(false)
             }
           }}
         >
           Cerrar
         </AlertDialogAction>
       </AlertDialogFooter>
     </AlertDialogContent>
   </AlertDialog>
   ```

4. **Prevenir cierre con ESC y click fuera:**
   ```typescript
   // En DialogContent:
   onEscapeKeyDown={(e) => {
     if (form.formState.isDirty) {
       e.preventDefault()
       setShowCloseConfirm(true)
     }
   }}
   onPointerDownOutside={(e) => {
     if (form.formState.isDirty) {
       e.preventDefault()
       setShowCloseConfirm(true)
     }
   }}
   ```

---

### 1.7. Cambiar terminología

**Archivos afectados:**
- `components/operations/new-operation-dialog.tsx`

**Cambios a realizar:**

1. **Cambiar labels:**
   - "Niños" → "Children"
   - "Bebés" → "Infantes"

```typescript
// ANTES
<Label>Niños</Label>
<Label>Bebés</Label>

// DESPUÉS
<Label>Children</Label>
<Label>Infantes</Label>
```

---

## 2. Cambios en Clientes

### 2.1. OCR con IA para autocompletar desde DNI/Pasaporte

**Archivos afectados:**
- `app/api/documents/ocr-only/route.ts` (NUEVO)
- `components/customers/new-customer-dialog.tsx`

**Cambios a realizar:**

1. **Crear nueva API (`app/api/documents/ocr-only/route.ts`):**
   ```typescript
   import { NextResponse } from "next/server"
   import { createServerClient } from "@/lib/supabase/server"
   import { getCurrentUser } from "@/lib/auth"
   import { scanDocumentWithAI } from "@/lib/ai/document-scanner"

   export async function POST(request: Request) {
     try {
       const { user } = await getCurrentUser()
       const formData = await request.formData()
       const file = formData.get("file") as File

       if (!file) {
         return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 })
       }

       // Convertir File a Buffer
       const bytes = await file.arrayBuffer()
       const buffer = Buffer.from(bytes)

       // Procesar con OCR
       const extractedData = await scanDocumentWithAI(buffer, file.name)

       return NextResponse.json({
         success: true,
         data: extractedData,
       })
     } catch (error: any) {
       console.error("Error en OCR:", error)
       return NextResponse.json(
         { error: error.message || "Error al procesar documento" },
         { status: 500 }
       )
     }
   }
   ```

2. **En `new-customer-dialog.tsx`:**
   ```typescript
   const [isProcessingOCR, setIsProcessingOCR] = useState(false)
   const [uploadedFile, setUploadedFile] = useState<File | null>(null)
   const [ocrSuccess, setOcrSuccess] = useState(false)
   const fileInputRef = useRef<HTMLInputElement>(null)

   const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
     const file = event.target.files?.[0]
     if (!file) return

     setIsProcessingOCR(true)
     setUploadedFile(file)

     try {
       const formData = new FormData()
       formData.append("file", file)

       const response = await fetch("/api/documents/ocr-only", {
         method: "POST",
         body: formData,
       })

       const data = await response.json()

       if (data.success && data.data) {
         const extracted = data.data
         form.setValue("first_name", extracted.first_name || "")
         form.setValue("last_name", extracted.last_name || "")
         form.setValue("document_type", extracted.document_type || "DNI")
         form.setValue("document_number", extracted.document_number || "")
         form.setValue("date_of_birth", extracted.date_of_birth || "")
         form.setValue("nationality", extracted.nationality || "")
         setOcrSuccess(true)
       }
     } catch (error) {
       console.error("Error en OCR:", error)
       toast.error("Error al procesar documento")
     } finally {
       setIsProcessingOCR(false)
     }
   }

   // En JSX (después de fecha de nacimiento):
   <div>
     <Label>Documento (DNI/Pasaporte)</Label>
     <Input
       ref={fileInputRef}
       type="file"
       accept="image/*,.pdf"
       onChange={handleFileUpload}
       className="hidden"
     />
     <Button
       type="button"
       variant="outline"
       onClick={() => fileInputRef.current?.click()}
       disabled={isProcessingOCR}
     >
       {isProcessingOCR ? (
         <Loader2 className="h-4 w-4 animate-spin mr-2" />
       ) : (
         <Upload className="h-4 w-4 mr-2" />
       )}
       {uploadedFile ? "Cambiar documento" : "Subir documento"}
     </Button>
     {ocrSuccess && (
       <Badge variant="success">Datos extraídos correctamente</Badge>
     )}
   </div>
   ```

3. **Al crear cliente, también guardar documento:**
   ```typescript
   if (uploadedFile) {
     // Guardar documento en Supabase Storage
     const fileExt = uploadedFile.name.split('.').pop()
     const fileName = `${customerId}/document-${Date.now()}.${fileExt}`
     
     const { error: uploadError } = await supabase.storage
       .from('customer-documents')
       .upload(fileName, uploadedFile)
     
     if (!uploadError) {
       // Crear registro en documents table
       await supabase.from('documents').insert({
         customer_id: customerId,
         document_type: 'IDENTITY',
         file_path: fileName,
         // ... otros campos
       })
     }
   }
   ```

---

### 2.2. Eliminar campos Email e Instagram

**Archivos afectados:**
- `components/customers/new-customer-dialog.tsx`
- `app/api/customers/route.ts`

**Cambios a realizar:**

1. **En formulario:**
   - Eliminar `<FormField name="email" />`
   - Eliminar `<FormField name="instagram_handle" />`

2. **En schema:**
   - Eliminar `email` y `instagram_handle` del schema (o hacerlos opcionales)

3. **En API:**
   - Eliminar validación de email requerido
   - Email es completamente opcional

---

### 2.3. Email completamente opcional

**Archivos afectados:**
- `app/api/customers/route.ts`

**Cambios a realizar:**

```typescript
// ELIMINAR esta validación:
if (!first_name || !last_name || !phone || !email) {
  return NextResponse.json({ error: "Campos requeridos faltantes" }, { status: 400 })
}

// DEJAR SOLO:
if (!first_name || !last_name || !phone) {
  return NextResponse.json({ error: "Campos requeridos faltantes" }, { status: 400 })
}

// Y en validaciones de settings, hacer email opcional:
if (validations?.email?.required && !email) {
  // Solo validar si está configurado como requerido
}
```

---

## 3. Cambios en Contabilidad

### 3.1. Registrar pagos en cuentas de caja según método

**Archivos afectados:**
- `app/api/payments/mark-paid/route.ts`

**Cambios a realizar:**

1. **Importar funciones necesarias:**
   ```typescript
   import { createLedgerMovement } from "@/lib/accounting/ledger"
   import { getOrCreateDefaultAccount } from "@/lib/accounting/financial-accounts"
   ```

2. **Después de registrar en "Cuentas por Cobrar/Pagar" y "RESULTADO", agregar:**
   ```typescript
   // ============================================
   // 3. REGISTRAR EN CUENTA DE CAJA SEGÚN MÉTODO DE PAGO
   // ============================================
   let cashAccountType: "CASH" | "BANK" | "MP" | "USD" = "CASH"
   if (paymentData.method === "Efectivo") {
     cashAccountType = "CASH"
   } else if (paymentData.method === "Transferencia") {
     cashAccountType = "BANK"
   } else if (paymentData.method === "Mercado Pago" || paymentData.method === "MP") {
     cashAccountType = "MP"
   } else if (paymentData.method === "USD") {
     cashAccountType = "USD"
   }

   // Obtener o crear cuenta de caja
   const cashAccountId = await getOrCreateDefaultAccount(
     cashAccountType,
     paymentData.currency as "ARS" | "USD",
     user.id,
     supabase
   )

   // Crear movimiento en cuenta de caja
   const cashLedgerType = paymentData.direction === "INCOME" ? "INCOME" : "EXPENSE"
   
   await createLedgerMovement(
     {
       operation_id: paymentData.operation_id || null,
       lead_id: null,
       type: cashLedgerType,
       concept: paymentData.direction === "INCOME"
         ? `Cobro en ${paymentData.method || "efectivo"} - Operación ${paymentData.operation_id?.slice(0, 8) || ""}`
         : `Pago en ${paymentData.method || "efectivo"} - Operación ${paymentData.operation_id?.slice(0, 8) || ""}`,
       currency: paymentData.currency as "ARS" | "USD",
       amount_original: parseFloat(paymentData.amount),
       exchange_rate: paymentData.currency === "USD" ? exchangeRate : null,
       amount_ars_equivalent: amountARS,
       method: ledgerMethod, // "CASH", "BANK", "MP", etc.
       account_id: cashAccountId,
       seller_id: sellerId,
       operator_id: operatorId,
       receipt_number: reference || null,
       notes: reference || null,
       created_by: user.id,
     },
     supabase
   )
   ```

---

### 3.2. Corregir retiros de socios

**Archivos afectados:**
- `app/api/partner-accounts/withdrawals/route.ts`
- `components/accounting/partner-accounts-client.tsx`

**Cambios a realizar:**

1. **En API (`app/api/partner-accounts/withdrawals/route.ts`):**
   ```typescript
   // Hacer account_id obligatorio:
   if (!account_id) {
     return NextResponse.json({ 
       error: "Cuenta financiera es requerida. Debe seleccionar de qué cuenta se realiza el retiro." 
     }, { status: 400 })
   }

   // Verificar que cuenta existe:
   const { data: account, error: accountError } = await supabase
     .from("financial_accounts")
     .select("id, currency")
     .eq("id", account_id)
     .single()

   if (accountError || !account) {
     return NextResponse.json({ error: "Cuenta financiera no encontrada" }, { status: 404 })
   }

   // Calcular exchange rate si es USD:
   let exchangeRate: number | null = null
   if (currency === "USD") {
     const rateDate = new Date(withdrawal_date)
     exchangeRate = await getExchangeRate(supabase, rateDate)
     if (!exchangeRate) {
       exchangeRate = await getLatestExchangeRate(supabase)
     }
     if (!exchangeRate) {
       exchangeRate = 1000 // Fallback
     }
   }

   // Calcular amount_ars_equivalent:
   const amountARS = calculateARSEquivalent(
     parseFloat(amount),
     currency as "ARS" | "USD",
     exchangeRate
   )

   // Usar createLedgerMovement en vez de insertar directamente:
   const { id: ledgerMovementId } = await createLedgerMovement(
     {
       operation_id: null,
       lead_id: null,
       type: "EXPENSE",
       concept: `Retiro socio: ${partner.partner_name}${description ? ` - ${description}` : ""}`,
       currency: currency as "ARS" | "USD",
       amount_original: parseFloat(amount),
       exchange_rate: currency === "USD" ? exchangeRate : null,
       amount_ars_equivalent: amountARS,
       method: "CASH",
       account_id: account_id,
       seller_id: null,
       operator_id: null,
       receipt_number: null,
       notes: description || null,
       created_by: user.id,
     },
     supabase
   )
   ```

2. **En frontend (`components/accounting/partner-accounts-client.tsx`):**
   ```typescript
   // Agregar estado:
   const [withdrawalAccountId, setWithdrawalAccountId] = useState("")
   const [financialAccounts, setFinancialAccounts] = useState<Array<{ id: string; name: string; currency: string }>>([])

   // Cargar cuentas cuando se abre el diálogo:
   useEffect(() => {
     if (newWithdrawalOpen) {
       const loadFinancialAccounts = async () => {
         const res = await fetch("/api/accounting/financial-accounts")
         const data = await res.json()
         if (data.accounts) {
           setFinancialAccounts(data.accounts.filter((acc: any) => acc.is_active !== false))
         }
       }
       loadFinancialAccounts()
     }
   }, [newWithdrawalOpen])

   // Agregar campo en formulario:
   <FormField
     name="account_id"
     render={({ field }) => (
       <FormItem>
         <FormLabel>Cuenta Financiera *</FormLabel>
         <Select value={withdrawalAccountId} onValueChange={setWithdrawalAccountId}>
           <SelectTrigger>
             <SelectValue placeholder="Seleccionar cuenta" />
           </SelectTrigger>
           <SelectContent>
             {financialAccounts.map((account) => (
               <SelectItem key={account.id} value={account.id}>
                 {account.name} ({account.currency})
               </SelectItem>
             ))}
           </SelectContent>
         </Select>
       </FormItem>
     )}
   />

   // En handleCreateWithdrawal:
   if (!withdrawalAccountId) {
     toast.error("Debes seleccionar una cuenta financiera")
     return
   }

   // En body del request:
   body: JSON.stringify({
     ...otherFields,
     account_id: withdrawalAccountId,
   })
   ```

---

## 4. Cambios en UI/UX

### 4.1. Mostrar texto completo en submenús del sidebar

**Archivos afectados:**
- `components/ui/sidebar.tsx`

**Cambios a realizar:**

```typescript
// En SidebarMenuSubButton, cambiar className:
// ANTES:
className={cn(
  "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
  className
)}

// DESPUÉS:
className={cn(
  "flex h-7 min-w-0 -translate-x-px items-center gap-2 break-words rounded-md px-2 text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:break-words [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
  className
)}
```

**Cambios clave:**
- `overflow-hidden` → mantener (o eliminar según necesidad)
- `truncate` → `break-words`
- `[&>span:last-child]:truncate` → `[&>span:last-child]:break-words`

---

## 5. Migraciones de Base de Datos

### 5.1. Agregar product_type a operation_operators

**Archivo:** `supabase/migrations/066_add_product_type_to_operation_operators.sql`

```sql
-- =====================================================
-- Migración 066: Agregar product_type a operation_operators
-- =====================================================

ALTER TABLE operation_operators
ADD COLUMN IF NOT EXISTS product_type TEXT 
CHECK (product_type IN ('FLIGHT', 'HOTEL', 'PACKAGE', 'CRUISE', 'TRANSFER', 'MIXED'));

-- Comentario
COMMENT ON COLUMN operation_operators.product_type IS 'Tipo de producto para este operador (Vuelo, Hotel, Paquete, etc)';
```

**Ejecutar:**
- Aplicar migración en Supabase
- O ejecutar SQL manualmente en la base de datos

---

## 6. Checklist de Replicación

### ✅ Pre-requisitos
- [ ] Base de datos con estructura similar
- [ ] API de OpenAI configurada (para OCR)
- [ ] Funciones de contabilidad implementadas (`createLedgerMovement`, `getOrCreateDefaultAccount`, etc.)
- [ ] Componentes UI disponibles (shadcn/ui)

### ✅ Cambios en Operaciones
- [ ] Cambiar moneda predeterminada a USD
- [ ] Eliminar campos check-in/check-out
- [ ] Agregar campo de Cliente
- [ ] Agregar tipo de producto por operador
- [ ] Implementar refresh automático
- [ ] Prevenir cierre accidental de diálogos
- [ ] Cambiar terminología

### ✅ Cambios en Clientes
- [ ] Implementar OCR con IA
- [ ] Eliminar campos Email e Instagram
- [ ] Hacer email completamente opcional

### ✅ Cambios en Contabilidad
- [ ] Registrar pagos en cuentas de caja
- [ ] Corregir retiros de socios

### ✅ Cambios en UI/UX
- [ ] Mostrar texto completo en submenús

### ✅ Migraciones
- [ ] Ejecutar migración de product_type

### ✅ Testing
- [ ] Probar creación de operaciones
- [ ] Probar creación de clientes con OCR
- [ ] Probar pagos y verificar cuentas
- [ ] Probar retiros de socios
- [ ] Verificar UI en sidebar

---

## 📝 Notas Importantes

1. **OCR con IA:** Requiere OpenAI API key y función `scanDocumentWithAI` implementada
2. **Contabilidad:** Los cambios en pagos afectan la lógica contable completa - revisar cuidadosamente
3. **Retiros de socios:** Ahora requiere cuenta financiera obligatoria - actualizar formularios
4. **Migraciones:** Aplicar migraciones en orden y verificar dependencias

---

**Fin de la guía**
