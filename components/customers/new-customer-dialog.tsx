"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"
import { Loader2, Upload, FileText, X, CheckCircle } from "lucide-react"
import { useCustomerSettings } from "@/hooks/use-customer-settings"
import { CustomFieldsForm } from "./custom-fields-form"

interface NewCustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (customer?: any) => void
}

const documentTypes = [
  { value: "DNI", label: "DNI" },
  { value: "PASSPORT", label: "Pasaporte" },
  { value: "CUIT", label: "CUIT" },
  { value: "OTHER", label: "Otro" },
]

const nationalities = [
  { value: "Argentina", label: "Argentina" },
  { value: "Brasil", label: "Brasil" },
  { value: "Chile", label: "Chile" },
  { value: "Uruguay", label: "Uruguay" },
  { value: "Paraguay", label: "Paraguay" },
  { value: "Colombia", label: "Colombia" },
  { value: "México", label: "México" },
  { value: "España", label: "España" },
  { value: "Estados Unidos", label: "Estados Unidos" },
  { value: "Otro", label: "Otro" },
]

export function NewCustomerDialog({
  open,
  onOpenChange,
  onSuccess,
}: NewCustomerDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isProcessingOCR, setIsProcessingOCR] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [ocrSuccess, setOcrSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { settings, loading: settingsLoading } = useCustomerSettings()

  // Generar schema dinámicamente según configuración
  const customerSchema = useMemo(() => {
    // Schema base - sin email ni instagram
    const baseFields: Record<string, z.ZodTypeAny> = {
      first_name: z.string().min(1, "Nombre es requerido"),
      last_name: z.string().min(1, "Apellido es requerido"),
      phone: z.string().min(1, "Teléfono es requerido"),
      document_type: z.string().optional(),
      document_number: z.string().optional(),
      date_of_birth: z.string().optional(),
      nationality: z.string().optional(),
    }

    // Aplicar validaciones de configuración
    if (settings?.validations) {
      const validations = settings.validations
      
      if (validations.phone?.required) {
        baseFields.phone = z.string().min(1, "Teléfono es requerido")
      }
    }

    // Agregar campos personalizados al schema
    if (settings?.custom_fields) {
      settings.custom_fields.forEach((field) => {
        let fieldSchema: z.ZodTypeAny
        
        switch (field.type) {
          case 'number':
            fieldSchema = field.required 
              ? z.number({ required_error: `${field.label} es requerido` })
              : z.number().optional()
            break
          case 'email':
            fieldSchema = field.required
              ? z.string().min(1, `${field.label} es requerido`).email(`${field.label} inválido`)
              : z.string().email(`${field.label} inválido`).optional()
            break
          default:
            fieldSchema = field.required
              ? z.string().min(1, `${field.label} es requerido`)
              : z.string().optional()
        }
        
        baseFields[field.name] = fieldSchema
      })
    }

    return z.object(baseFields)
  }, [settings])

  type CustomerFormValues = z.infer<typeof customerSchema>

  // Generar valores por defecto incluyendo campos personalizados
  const defaultValues = useMemo(() => {
    const baseDefaults: any = {
      first_name: "",
      last_name: "",
      phone: "",
      document_type: "",
      document_number: "",
      date_of_birth: "",
      nationality: "",
    }

    // Agregar valores por defecto de campos personalizados
    if (settings?.custom_fields) {
      settings.custom_fields.forEach((field) => {
        baseDefaults[field.name] = field.default_value || (field.type === 'number' ? undefined : '')
      })
    }

    return baseDefaults
  }, [settings])

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues,
  })

  // Actualizar valores por defecto cuando cambia la configuración
  useEffect(() => {
    if (settings && !settingsLoading) {
      form.reset(defaultValues)
    }
  }, [settings, settingsLoading, defaultValues, form])

  // Procesar documento con OCR
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validar tipo de archivo
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Solo se permiten imágenes (JPEG, PNG, WebP)")
      return
    }

    // Validar tamaño (máximo 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("El archivo es demasiado grande. Máximo 10MB")
      return
    }

    setUploadedFile(file)
    setIsProcessingOCR(true)
    setOcrSuccess(false)

    try {
      // Determinar tipo de documento basado en el tipo seleccionado o inferir
      const currentDocType = form.getValues("document_type")
      const documentType = currentDocType === "PASSPORT" ? "PASSPORT" : "DNI"

      // Crear FormData para enviar al endpoint de OCR
      const formData = new FormData()
      formData.append("file", file)
      formData.append("type", documentType)

      toast.info("Analizando documento con IA...")

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

  const removeUploadedFile = () => {
    setUploadedFile(null)
    setOcrSuccess(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const onSubmit = async (values: CustomerFormValues) => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          document_type: values.document_type || null,
          document_number: values.document_number || null,
          date_of_birth: values.date_of_birth || null,
          nationality: values.nationality || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        // Manejar error de duplicado
        if (response.status === 409) {
          throw new Error(error.error || "Ya existe un cliente con estos datos")
        }
        throw new Error(error.error || "Error al crear cliente")
      }

      const data = await response.json()
      const newCustomer = data.customer

      // Si hay un documento subido, guardarlo asociado al cliente
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
      onSuccess(newCustomer)
      onOpenChange(false)
    } catch (error) {
      console.error("Error creating customer:", error)
      toast.error(error instanceof Error ? error.message : "Error al crear cliente")
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset()
      setUploadedFile(null)
      setOcrSuccess(false)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Cliente</DialogTitle>
          <DialogDescription>
            Completa los datos para registrar un nuevo cliente
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre *</FormLabel>
                    <FormControl>
                      <Input placeholder="Juan" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apellido *</FormLabel>
                    <FormControl>
                      <Input placeholder="Pérez" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono *</FormLabel>
                    <FormControl>
                      <Input placeholder="+54 11 1234-5678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="document_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Documento</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {documentTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="document_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de Documento</FormLabel>
                    <FormControl>
                      <Input placeholder="12345678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date_of_birth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Nacimiento</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nationality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nacionalidad</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar nacionalidad" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {nationalities.map((nat) => (
                          <SelectItem key={nat.value} value={nat.value}>
                            {nat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                    accept="image/jpeg,image/jpg,image/png,image/webp"
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

            {/* Campos personalizados */}
            {settings?.custom_fields && settings.custom_fields.length > 0 && (
              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-sm font-medium">Información Adicional</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <CustomFieldsForm 
                    control={form.control} 
                    customFields={settings.custom_fields} 
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isLoading || isProcessingOCR}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading || isProcessingOCR}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando...
                  </>
                ) : (
                  "Crear Cliente"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
