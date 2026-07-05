# 📄 Documentación: Implementación de Creación de Cliente con OCR desde Operación

## 🎯 Resumen

Se implementó la funcionalidad para crear un nuevo cliente directamente desde operaciones, con OCR automático que extrae datos del DNI/Pasaporte y autocompleta el formulario. Esta funcionalidad está disponible en **dos puntos de entrada**:

1. **Desde el diálogo de creación de operación** (`new-operation-dialog.tsx`): Crear cliente al crear una nueva operación
2. **Desde el detalle de operación existente** (`passengers-section.tsx`): Agregar clientes a operaciones existentes (perfecto para viajes grupales)

### Características del OCR

- **Soporte para múltiples formatos:** Imágenes (JPEG, PNG, WebP) y PDFs (máximo 15MB)
- **Extracción automática de campos:**
  - Nombre y apellido
  - Número de documento
  - **Número de trámite** (`procedure_number`) - para DNI y Pasaportes
  - Fecha de nacimiento
  - Nacionalidad
  - Tipo de documento (DNI o PASSPORT)
- **Procesamiento con OpenAI Vision (GPT-4o)** para máxima precisión
- **Autocompletado inteligente** del formulario con datos extraídos

---

## 1️⃣ Cambios en `new-operation-dialog.tsx`

### 1.1. Importar el diálogo de cliente

```typescript
import { NewCustomerDialog } from "@/components/customers/new-customer-dialog"
```

### 1.2. Estados para gestionar clientes

```typescript
// Estado para clientes
const [customers, setCustomers] = useState<Array<{ id: string; first_name: string; last_name: string }>>([])
const [loadingCustomers, setLoadingCustomers] = useState(false)
const [showNewCustomerDialog, setShowNewCustomerDialog] = useState(false)
```

### 1.3. Cargar clientes al abrir el diálogo

```typescript
// Cargar configuración de operaciones
useEffect(() => {
  if (open) {
    loadSettings()
    loadCustomers() // ← NUEVO: Cargar clientes
  }
}, [open])

// Función para cargar clientes
const loadCustomers = async () => {
  setLoadingCustomers(true)
  try {
    const response = await fetch('/api/customers?limit=200')
    if (response.ok) {
      const data = await response.json()
      setCustomers((data.customers || []).map((c: any) => ({
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
      })))
    }
  } catch (error) {
    console.error('Error loading customers:', error)
  } finally {
    setLoadingCustomers(false)
  }
}
```

### 1.4. Agregar campo "Cliente" al formulario

**En el schema:**

```typescript
const operationSchema = z.object({
  // ... otros campos
  customer_id: z.string().optional().nullable(), // ← NUEVO
  // ...
})
```

**En los valores por defecto:**

```typescript
defaultValues: {
  // ... otros campos
  customer_id: null, // ← NUEVO
  // ...
}
```

### 1.5. Campo "Cliente" en el formulario (UI)

```typescript
<FormField
  control={form.control}
  name="customer_id"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Cliente</FormLabel>
      <div className="flex gap-2">
        <Select onValueChange={field.onChange} value={field.value || ""}>
          <FormControl>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar cliente" />
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            {loadingCustomers ? (
              <div className="p-2 text-center text-sm text-muted-foreground">
                Cargando...
              </div>
            ) : customers.length === 0 ? (
              <div className="p-2 text-center text-sm text-muted-foreground">
                No hay clientes
              </div>
            ) : (
              customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.first_name} {customer.last_name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setShowNewCustomerDialog(true)} // ← Abrir diálogo
          title="Crear nuevo cliente"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <FormMessage />
    </FormItem>
  )}
/>
```

### 1.6. Renderizar `NewCustomerDialog` al final del componente

```typescript
{/* Diálogo para crear nuevo cliente */}
<NewCustomerDialog
  open={showNewCustomerDialog}
  onOpenChange={setShowNewCustomerDialog}
  onSuccess={(customer) => {
    if (customer) {
      // Agregar el nuevo cliente a la lista y seleccionarlo
      setCustomers(prev => [...prev, {
        id: customer.id,
        first_name: customer.first_name,
        last_name: customer.last_name,
      }])
      form.setValue("customer_id", customer.id) // ← Seleccionar automáticamente
      setShowNewCustomerDialog(false)
    }
  }}
/>
```

### 1.7. Enviar `customer_id` al crear la operación

```typescript
const requestBody: any = {
  ...values,
  customer_id: values.customer_id || null, // ← Incluir en el request
  // ... otros campos
}
```

---

## 2️⃣ Cambios en `new-customer-dialog.tsx`

### 2.1. Estados para OCR

```typescript
const [isProcessingOCR, setIsProcessingOCR] = useState(false)
const [uploadedFile, setUploadedFile] = useState<File | null>(null)
const [ocrSuccess, setOcrSuccess] = useState(false)
const fileInputRef = useRef<HTMLInputElement>(null)
```

### 2.2. Función para procesar documento con OCR

```typescript
const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0]
  if (!file) return

  // Validar tipo de archivo
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]
  if (!allowedTypes.includes(file.type)) {
    toast.error("Solo se permiten imágenes (JPEG, PNG, WebP) o PDFs")
    return
  }

  // Validar tamaño (máximo 15MB)
  if (file.size > 15 * 1024 * 1024) {
    toast.error("El archivo es demasiado grande. Máximo 15MB")
    return
  }

  setUploadedFile(file)
  setIsProcessingOCR(true)
  setOcrSuccess(false)

  try {
    // Determinar tipo de documento
    const currentDocType = form.getValues("document_type")
    const documentType = currentDocType === "PASSPORT" ? "PASSPORT" : "DNI"

    // Crear FormData para enviar al endpoint de OCR
    const formData = new FormData()
    formData.append("file", file)
    formData.append("type", documentType)

    toast.info("Analizando documento con IA...")

    // Llamar al endpoint de OCR
    const response = await fetch("/api/documents/ocr-only", {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || "Error al procesar documento")
    }

    const data = await response.json()
    
    if (data.extractedData) {
      const extracted = data.extractedData
      
      // Autocompletar campos del formulario
      if (extracted.first_name) {
        form.setValue("first_name", extracted.first_name)
      }
      if (extracted.last_name) {
        form.setValue("last_name", extracted.last_name)
      }
      // Si viene full_name y no hay first_name/last_name separados
      if (extracted.full_name && !extracted.first_name) {
        const nameParts = extracted.full_name.split(" ")
        if (nameParts.length >= 2) {
          form.setValue("last_name", nameParts[0])
          form.setValue("first_name", nameParts.slice(1).join(" "))
        }
      }
      if (extracted.document_number) {
        form.setValue("document_number", extracted.document_number)
      }
      if (extracted.document_type) {
        form.setValue("document_type", extracted.document_type)
      } else if (documentType) {
        form.setValue("document_type", documentType)
      }
      if (extracted.date_of_birth) {
        form.setValue("date_of_birth", extracted.date_of_birth)
      }
      if (extracted.nationality) {
        // Mapear nacionalidad a opciones válidas
        const nationalityMap: Record<string, string> = {
          "ARG": "Argentina",
          "ARGENTINA": "Argentina",
          "BRA": "Brasil",
          "BRASIL": "Brasil",
          "BRAZIL": "Brasil",
          "CHL": "Chile",
          "CHILE": "Chile",
          "URY": "Uruguay",
          "URUGUAY": "Uruguay",
          "PRY": "Paraguay",
          "PARAGUAY": "Paraguay",
          "COL": "Colombia",
          "COLOMBIA": "Colombia",
          "MEX": "México",
          "MEXICO": "México",
          "ESP": "España",
          "SPAIN": "España",
          "USA": "Estados Unidos",
          "UNITED STATES": "Estados Unidos",
        }
        const normalizedNat = extracted.nationality.toUpperCase()
        const mappedNat = nationalityMap[normalizedNat] || extracted.nationality
        form.setValue("nationality", mappedNat)
      }

      setOcrSuccess(true)
      toast.success("¡Datos extraídos correctamente!")
    } else {
      toast.warning("No se pudieron extraer datos del documento")
    }
  } catch (error) {
    console.error("Error processing OCR:", error)
    toast.error(error instanceof Error ? error.message : "Error al procesar documento")
  } finally {
    setIsProcessingOCR(false)
  }
}
```

### 2.3. UI para subir documento (después de fecha de nacimiento)

```typescript
{/* Sección de carga de documento con OCR */}
<div className="border rounded-lg p-4 bg-muted/30">
  <div className="flex items-center gap-2 mb-3">
    <FileText className="h-5 w-5 text-primary" />
    <span className="font-medium">Escanear Documento</span>
  </div>
  <p className="text-sm text-muted-foreground mb-3">
    Sube una foto del DNI o Pasaporte y los datos se completarán automáticamente
  </p>
  
  {!uploadedFile ? (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
        onChange={handleFileUpload}
        className="hidden"
        id="document-upload"
      />
      <label htmlFor="document-upload">
        <Button
          type="button"
          variant="outline"
          className="w-full cursor-pointer"
          disabled={isProcessingOCR}
          asChild
        >
          <span>
            {isProcessingOCR ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando documento...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Subir foto de DNI / Pasaporte
              </>
            )}
          </span>
        </Button>
      </label>
    </div>
  ) : (
    <div className="flex items-center justify-between p-3 bg-background rounded-md border">
      <div className="flex items-center gap-3">
        {ocrSuccess ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : (
          <FileText className="h-5 w-5 text-muted-foreground" />
        )}
        <div>
          <p className="text-sm font-medium truncate max-w-[200px]">
            {uploadedFile.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {ocrSuccess ? "Datos extraídos correctamente" : "Documento cargado"}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={removeUploadedFile}
        disabled={isProcessingOCR}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )}
</div>
```

### 2.4. Guardar documento después de crear el cliente

```typescript
const onSubmit = async (values: CustomerFormValues) => {
  setIsLoading(true)
  try {
    // Crear cliente
    const response = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        email: null,
        instagram_handle: null,
        document_type: values.document_type || null,
        document_number: values.document_number || null,
        date_of_birth: values.date_of_birth || null,
        nationality: values.nationality || null,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || "Error al crear cliente")
    }

    const data = await response.json()
    const newCustomer = data.customer

    // ← NUEVO: Si hay un documento subido, guardarlo asociado al cliente
    if (uploadedFile && newCustomer?.id) {
      try {
        const docFormData = new FormData()
        docFormData.append("file", uploadedFile)
        docFormData.append("type", values.document_type || "DNI")
        docFormData.append("customerId", newCustomer.id)

        const docResponse = await fetch("/api/documents/upload-with-ocr", {
          method: "POST",
          body: docFormData,
        })

        if (docResponse.ok) {
          console.log("✅ Documento guardado en el perfil del cliente")
        } else {
          console.error("Error al guardar documento:", await docResponse.text())
        }
      } catch (docError) {
        console.error("Error uploading document to customer:", docError)
      }
    }

    toast.success("Cliente creado correctamente")
    form.reset()
    setUploadedFile(null)
    setOcrSuccess(false)
    onSuccess(newCustomer) // ← Pasar el cliente creado al callback
    onOpenChange(false)
  } catch (error) {
    console.error("Error creating customer:", error)
    toast.error(error instanceof Error ? error.message : "Error al crear cliente")
  } finally {
    setIsLoading(false)
  }
}
```

### 2.5. Prevenir cierre accidental del diálogo

```typescript
const handleOpenChange = (newOpen: boolean) => {
  if (!newOpen && open) {
    // Si se intenta cerrar, mostrar confirmación
    setShowCloseConfirm(true)
  } else {
    onOpenChange(newOpen)
  }
}

// En el Dialog:
<Dialog open={open} onOpenChange={handleOpenChange}>
  <DialogContent 
    className="max-w-2xl max-h-[90vh] overflow-y-auto"
    onEscapeKeyDown={(e) => e.preventDefault()} // ← Prevenir ESC
    onPointerDownOutside={(e) => e.preventDefault()} // ← Prevenir click fuera
  >
    {/* ... contenido ... */}
  </DialogContent>
</Dialog>

{/* Diálogo de confirmación */}
<AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>¿Estás seguro que quieres cerrar?</AlertDialogTitle>
      <AlertDialogDescription>
        Perderás todos los cambios no guardados. Esta acción no se puede deshacer.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={handleCancelClose}>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={handleConfirmClose} className="bg-destructive">
        Cerrar
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## 3️⃣ Nuevo Endpoint: `/api/documents/ocr-only/route.ts`

Este endpoint procesa el documento con OCR y devuelve los datos extraídos **sin guardarlo**.

```typescript
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import OpenAI from "openai"

/**
 * Endpoint para extraer datos de un documento usando OCR sin guardarlo
 * Solo procesa la imagen y devuelve los datos extraídos
 */
export async function POST(request: Request) {
  try {
    await getCurrentUser()
    
    // Validar API key de OpenAI
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey || openaiApiKey.trim() === "") {
      return NextResponse.json(
        { error: "OpenAI API key no configurada" },
        { status: 500 }
      )
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get("file") as File
    const documentType = formData.get("type") as string || "DNI"

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 })
    }

    // Validar tipo de archivo
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, WebP)" },
        { status: 400 }
      )
    }

    // Validar tamaño (máximo 10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "El archivo es demasiado grande. Máximo 10MB" },
        { status: 400 }
      )
    }

    // Convertir a base64
    const fileBuffer = await file.arrayBuffer()
    const base64Image = Buffer.from(fileBuffer).toString("base64")

    // Preparar prompt según tipo de documento
    let prompt = ""
    if (documentType === "PASSPORT") {
      prompt = `Eres un experto en OCR de documentos de identidad. Analiza esta imagen de un PASAPORTE y extrae la información.

TAREA: Extraer los datos visibles del pasaporte y devolverlos en formato JSON.

CAMPOS A EXTRAER:
- document_type: "PASSPORT"
- document_number: Número del pasaporte (ej: "AAE422895")
- first_name: Nombre(s) 
- last_name: Apellido(s)
- full_name: Nombre completo
- date_of_birth: Fecha de nacimiento en formato YYYY-MM-DD
- nationality: Nacionalidad (ej: "ARG" o "ARGENTINA")
- sex: Sexo (M/F)
- expiration_date: Fecha de vencimiento en formato YYYY-MM-DD

CONVERSIÓN DE FECHAS:
- "09 ENE 87" → "1987-01-09"
- "06 DIC 16" → "2016-12-06"  
- "06 DIC 26" → "2026-12-06"

RESPUESTA: Devuelve ÚNICAMENTE un objeto JSON válido con los campos que puedas leer. Si un campo no es legible, omítelo o usa null.`
    } else {
      prompt = `Eres un experto en OCR de documentos de identidad. Analiza esta imagen de un DNI y extrae la información.

TAREA: Extraer los datos visibles del DNI y devolverlos en formato JSON.

CAMPOS A EXTRAER:
- document_type: "DNI"
- document_number: Número de documento
- first_name: Nombre(s)
- last_name: Apellido(s)
- full_name: Nombre completo tal como aparece
- date_of_birth: Fecha de nacimiento en formato YYYY-MM-DD
- nationality: "Argentina" o "ARG"
- sex: Sexo (M/F/X)

CONVERSIÓN DE FECHAS:
- Si la fecha aparece como "09 ENE 1987" convierte a "1987-01-09"
- Si aparece como "09/01/1987" convierte a "1987-01-09"

RESPUESTA: Devuelve ÚNICAMENTE un objeto JSON válido con los campos que puedas leer. Si un campo no es legible, omítelo o usa null.`
    }

    // Llamar a OpenAI Vision
    const openai = new OpenAI({ apiKey: openaiApiKey })
    
    console.log("📄 Procesando documento con OCR...")
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    })

    const responseText = completion.choices[0]?.message?.content || ""
    console.log("📄 OpenAI response:", responseText.substring(0, 300))

    if (!responseText || responseText.trim() === "" || responseText.trim() === "{}") {
      return NextResponse.json({ 
        error: "No se pudieron extraer datos del documento",
        extractedData: null 
      }, { status: 200 })
    }

    // Parsear respuesta JSON
    let extractedData: any = null
    try {
      extractedData = JSON.parse(responseText)
    } catch {
      // Intentar extraer JSON de la respuesta
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                       responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                       responseText.match(/\{[\s\S]*\}/)
      
      if (jsonMatch) {
        try {
          const jsonStr = jsonMatch[1] || jsonMatch[0]
          extractedData = JSON.parse(jsonStr)
        } catch {
          console.error("❌ Error parsing extracted JSON")
        }
      }
    }

    if (!extractedData) {
      return NextResponse.json({ 
        error: "No se pudieron parsear los datos del documento",
        extractedData: null 
      }, { status: 200 })
    }

    console.log("✅ Datos extraídos:", Object.keys(extractedData))

    return NextResponse.json({
      success: true,
      extractedData,
    })

  } catch (error) {
    console.error("Error in OCR-only endpoint:", error)
    return NextResponse.json(
      { error: "Error al procesar el documento" },
      { status: 500 }
    )
  }
}
```

---

## 4️⃣ Cambios en `/api/customers/route.ts`

Asegurar que `email` NO sea requerido:

```typescript
// En el POST handler, NO validar email como requerido
const {
  first_name,
  last_name,
  phone,
  // email NO es requerido
  // ...
} = body

// Validación básica (sin email)
if (!first_name || !last_name || !phone) {
  return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
}
```

---

## 🔄 Flujo Completo

1. Usuario abre "Nueva Operación"
2. Hace clic en el botón "+" junto al campo "Cliente"
3. Se abre el diálogo `NewCustomerDialog`
4. Usuario sube foto del DNI/Pasaporte
5. Se llama a `/api/documents/ocr-only` con la imagen
6. OpenAI Vision extrae los datos del documento
7. Se autocompletan los campos del formulario (nombre, apellido, documento, fecha de nacimiento, nacionalidad)
8. Usuario completa/ajusta datos y crea el cliente
9. Se llama a `/api/customers` para crear el cliente
10. Si hay documento subido, se guarda con `/api/documents/upload-with-ocr` asociado al cliente
11. El cliente se agrega a la lista y se selecciona automáticamente en la operación
12. Usuario continúa creando la operación con el cliente ya seleccionado

---

## 📋 Resumen de Archivos Modificados

1. **`components/operations/new-operation-dialog.tsx`**
   - Estados para clientes
   - Función `loadCustomers()`
   - Campo "Cliente" en el formulario
   - Botón "+" para crear cliente
   - Renderizar `NewCustomerDialog`
   - Incluir `customer_id` en el request

2. **`components/customers/new-customer-dialog.tsx`**
   - Estados para OCR (`isProcessingOCR`, `uploadedFile`, `ocrSuccess`)
   - Función `handleFileUpload()` para procesar OCR
   - UI para subir documento
   - Guardar documento después de crear cliente
   - Prevenir cierre accidental

3. **`app/api/documents/ocr-only/route.ts`** (NUEVO)
   - Endpoint que procesa documento con OpenAI Vision
   - Devuelve datos extraídos sin guardar

4. **`app/api/customers/route.ts`**
   - Remover validación de `email` como requerido

---

## ⚠️ Puntos Importantes

1. **El OCR se ejecuta ANTES de crear el cliente** (solo extrae datos)
2. **El documento se guarda DESPUÉS de crear el cliente** (usa el `customer_id`)
3. **El cliente creado se selecciona automáticamente** en la operación
4. **El diálogo no se cierra con ESC o click fuera** (requiere confirmación)
5. **El endpoint `/api/documents/ocr-only` NO guarda nada**, solo extrae datos

---

---

## 5️⃣ Agregar Clientes con OCR desde Detalle de Operación (`passengers-section.tsx`)

**Fecha:** 2025-01-19

### 5.1. Importar el diálogo de cliente

```typescript
import { NewCustomerDialog } from "@/components/customers/new-customer-dialog"
```

### 5.2. Estados para gestionar clientes

```typescript
const [showNewCustomerDialog, setShowNewCustomerDialog] = useState(false)
```

### 5.3. Botón "Crear Cliente Nuevo (OCR)" en el dialog de agregar pasajero

```typescript
{/* Botón crear cliente nuevo */}
<div className="flex items-center justify-between">
  <Label>Buscar cliente existente</Label>
  <Button
    type="button"
    variant="outline"
    size="sm"
    onClick={() => setShowNewCustomerDialog(true)}
  >
    <UserPlus className="h-4 w-4 mr-2" />
    Crear Cliente Nuevo (OCR)
  </Button>
</div>
```

### 5.4. Renderizar `NewCustomerDialog` al final del componente

```typescript
{/* Dialog para crear cliente nuevo con OCR */}
<NewCustomerDialog
  open={showNewCustomerDialog}
  onOpenChange={setShowNewCustomerDialog}
  onSuccess={(customer) => {
    if (customer) {
      // Agregar automáticamente el cliente creado a la operación
      const addCustomerToOperation = async () => {
        try {
          const response = await fetch(`/api/operations/${operationId}/customers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customer_id: customer.id,
              role: selectedRole, // MAIN o COMPANION
            }),
          })

          if (!response.ok) {
            throw new Error("Error al agregar pasajero")
          }

          const data = await response.json()
          
          // Agregar al estado local
          setCustomers(prev => [...prev, {
            ...data.operationCustomer,
            customers: customer
          }])

          toast.success(`${customer.first_name} agregado como pasajero`)
          setAddDialogOpen(false)
          setSelectedCustomer(null)
          setSearchQuery("")
          setSearchResults([])
          onUpdate?.()
        } catch (error) {
          console.error("Error adding passenger:", error)
          toast.error("Error al agregar pasajero")
        }
      }

      addCustomerToOperation()
      setShowNewCustomerDialog(false)
    }
  }}
/>
```

### 5.5. Flujo de uso

1. Usuario abre el detalle de una operación existente
2. Va a la sección "Pasajeros"
3. Hace clic en "Agregar" para agregar un nuevo pasajero
4. En el dialog de agregar pasajero, hace clic en "Crear Cliente Nuevo (OCR)"
5. Se abre el diálogo `NewCustomerDialog` con funcionalidad completa de OCR
6. Usuario sube foto del DNI/Pasaporte
7. El OCR extrae los datos automáticamente
8. Usuario completa/ajusta datos y crea el cliente
9. El cliente se agrega automáticamente a la operación como pasajero
10. El cliente creado se muestra en la lista de pasajeros de la operación

### 5.6. Caso de uso: Viajes Grupales

Esta funcionalidad es especialmente útil para **viajes grupales** donde se necesitan agregar múltiples clientes a una misma operación. El usuario puede:

- Agregar clientes existentes mediante búsqueda
- Crear nuevos clientes con OCR directamente desde el detalle de la operación
- Asignar roles: Principal (MAIN) o Acompañante (COMPANION)
- Ver todos los pasajeros asociados a la operación en una sola vista

---

## 🚀 Para Replicar en Otro Proyecto

1. Copiar el endpoint `/api/documents/ocr-only/route.ts`
2. Agregar estados y funciones en `new-operation-dialog.tsx` (para crear operación nueva)
3. Agregar estados y funciones en `passengers-section.tsx` (para agregar clientes a operaciones existentes)
4. Agregar estados y funciones de OCR en `new-customer-dialog.tsx`
5. Agregar UI de subida de documento en `new-customer-dialog.tsx`
6. Modificar `/api/customers/route.ts` para no requerir email
7. Asegurar que el endpoint `/api/documents/upload-with-ocr` acepte `customerId`
8. Agregar endpoint `/api/operations/[id]/customers` (POST) para agregar clientes a operaciones

---

## 📝 Notas Importantes

- **Dos puntos de entrada:** La funcionalidad de crear cliente con OCR está disponible tanto al crear una nueva operación como al agregar pasajeros a una operación existente
- **Uso para viajes grupales:** La funcionalidad de `PassengersSection` permite agregar múltiples clientes a una misma operación, ideal para viajes grupales
- **OCR unificado:** Ambos puntos de entrada usan el mismo diálogo `NewCustomerDialog` con funcionalidad completa de OCR
- **Automático:** El cliente creado se selecciona automáticamente en la operación nueva o se agrega automáticamente como pasajero en operaciones existentes

---

**Última actualización:** 2025-01-19
**Fin del documento**
