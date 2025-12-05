"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, FileText, Eye, Trash2, Loader2, CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { format } from "date-fns"
import { useRouter } from "next/navigation"

/**
 * Verifica el estado de vencimiento de un documento
 */
function checkPassportStatus(expirationDate: string, tripDate?: string): {
  status: "OK" | "WARNING" | "DANGER" | "EXPIRED"
  message: string
} {
  const today = new Date()
  const expDate = new Date(expirationDate)
  
  if (expDate < today) {
    return { status: "EXPIRED", message: "Documento vencido" }
  }
  
  if (tripDate) {
    const trip = new Date(tripDate)
    if (expDate < trip) {
      return { status: "DANGER", message: "Vence antes del viaje" }
    }
    const sixMonthsAfterTrip = new Date(trip)
    sixMonthsAfterTrip.setMonth(sixMonthsAfterTrip.getMonth() + 6)
    if (expDate < sixMonthsAfterTrip) {
      return { status: "WARNING", message: "Vence cerca del viaje" }
    }
  } else {
    const sixMonthsFromNow = new Date(today)
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6)
    if (expDate < sixMonthsFromNow) {
      return { status: "WARNING", message: "Vence pronto" }
    }
  }
  
  return { status: "OK", message: "Vigente" }
}

interface Document {
  id: string
  type: string
  file_url: string
  scanned_data: any
  uploaded_at: string
  users?: {
    name: string
    email: string
  }
}

interface DocumentsSectionProps {
  documents: Document[]
  operationId?: string
  customerId?: string
  departureDate?: string // Para verificar vencimiento vs viaje
}

export function DocumentsSection({ documents: initialDocuments, operationId, customerId, departureDate }: DocumentsSectionProps) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments || [])
  const [uploading, setUploading] = useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Actualizar documents cuando cambien los props
  useEffect(() => {
    setDocuments(initialDocuments || [])
  }, [initialDocuments])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validar tipo
      const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]
      if (!allowedTypes.includes(file.type)) {
        toast.error("Tipo de archivo no permitido. Solo imágenes (JPEG, PNG, WebP) y PDF")
        return
      }

      // Validar tamaño (10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error("El archivo es demasiado grande. Máximo 10MB")
        return
      }

      setSelectedFile(file)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile || !documentType) {
      toast.error("Selecciona un archivo y un tipo de documento")
      return
    }

    try {
      setUploading(true)
      const formData = new FormData()
      formData.append("file", selectedFile)
      formData.append("type", documentType)
      if (operationId) formData.append("operationId", operationId)
      if (customerId) formData.append("customerId", customerId)

      const response = await fetch("/api/documents/upload-with-ocr", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al subir documento")
      }

      const data = await response.json()
      toast.success("Documento subido y escaneado correctamente")
      
      // Refrescar la página para obtener los documentos actualizados
      router.refresh()
      
      // Reset form
      setSelectedFile(null)
      setDocumentType("")
      setUploadDialogOpen(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    } catch (error: any) {
      console.error("Error uploading document:", error)
      toast.error(error.message || "Error al subir documento")
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (documentId: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este documento?")) {
      return
    }

    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Error al eliminar documento")
      }

      toast.success("Documento eliminado")
      router.refresh()
    } catch (error) {
      console.error("Error deleting document:", error)
      toast.error("Error al eliminar documento")
    }
  }

  const getDocumentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      PASSPORT: "Pasaporte",
      DNI: "DNI",
      LICENSE: "Licencia",
      VOUCHER: "Voucher",
      INVOICE: "Factura",
      PAYMENT_PROOF: "Comprobante de Pago",
      OTHER: "Otro",
    }
    return labels[type] || type
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Documentos</CardTitle>
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Subir Documento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Subir Documento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Tipo de Documento</label>
                <Select value={documentType} onValueChange={setDocumentType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona el tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PASSPORT">Pasaporte</SelectItem>
                    <SelectItem value="DNI">DNI</SelectItem>
                    <SelectItem value="LICENSE">Licencia de Conducir</SelectItem>
                    <SelectItem value="VOUCHER">Voucher</SelectItem>
                    <SelectItem value="INVOICE">Factura</SelectItem>
                    <SelectItem value="PAYMENT_PROOF">Comprobante de Pago</SelectItem>
                    <SelectItem value="OTHER">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Archivo</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileSelect}
                  className="w-full text-sm"
                />
                {selectedFile && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    Seleccionado: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                <p>• Formatos permitidos: JPEG, PNG, WebP, PDF</p>
                <p>• Tamaño máximo: 10MB</p>
                <p>• Los documentos de tipo Pasaporte, DNI o Licencia se escanearán automáticamente con IA</p>
              </div>
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || !documentType || uploading}
                className="w-full"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Subiendo y escaneando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Subir y Escanear
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 text-center">
            No hay documentos subidos
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="bg-muted/50 rounded-lg p-4 space-y-3 border border-border"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge variant="outline">{getDocumentTypeLabel(doc.type)}</Badge>
                      {doc.scanned_data && (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Escaneado
                        </Badge>
                      )}
                      {doc.fromLead && (
                        <Badge variant="secondary" className="text-[10px]">
                          Desde Lead
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Subido: {format(new Date(doc.uploaded_at), "dd/MM/yyyy HH:mm")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(doc.file_url, "_blank")}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(doc.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Datos escaneados */}
                {doc.scanned_data && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">
                      Datos Extraídos por IA:
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {/* Mostrar todos los campos disponibles dinámicamente */}
                      {Object.entries(doc.scanned_data)
                        .filter(([key, value]) => 
                          value !== null && 
                          value !== undefined && 
                          value !== "" &&
                          !["scanned_at", "scanned_by", "document_type"].includes(key)
                        )
                        .map(([key, value]) => {
                          // Mapear nombres de campos a etiquetas legibles
                          const fieldLabels: Record<string, string> = {
                            document_number: "Número de Documento",
                            full_name: "Nombre Completo",
                            first_name: "Nombre",
                            last_name: "Apellido",
                            date_of_birth: "Fecha de Nacimiento",
                            nationality: "Nacionalidad",
                            expiration_date: "Vencimiento",
                            issue_date: "Fecha de Emisión",
                            sex: "Sexo",
                            place_of_birth: "Lugar de Nacimiento",
                            address: "Domicilio",
                            tramite_number: "Nº de Trámite",
                            personal_number: "Nº Personal/DNI",
                            issuing_authority: "Autoridad Emisora",
                            license_number: "Nº de Licencia",
                            class: "Clase",
                            restrictions: "Restricciones",
                            mrz_line1: "MRZ Línea 1",
                            mrz_line2: "MRZ Línea 2",
                          }
                          const label = fieldLabels[key] || key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
                          
                          // Manejar fecha de vencimiento con badge
                          if (key === "expiration_date") {
                            const status = checkPassportStatus(String(value), departureDate)
                            return (
                              <div key={key} className="col-span-2">
                                <span className="text-muted-foreground">{label}:</span>{" "}
                                <span className="font-medium">{String(value)}</span>
                                {status.status === "EXPIRED" && (
                                  <Badge variant="destructive" className="ml-2">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    {status.message}
                                  </Badge>
                                )}
                                {status.status === "DANGER" && (
                                  <Badge variant="destructive" className="ml-2">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    {status.message}
                                  </Badge>
                                )}
                                {status.status === "WARNING" && (
                                  <Badge variant="outline" className="ml-2 border-yellow-500 text-yellow-600">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    {status.message}
                                  </Badge>
                                )}
                                {status.status === "OK" && (
                                  <Badge variant="outline" className="ml-2 border-green-500 text-green-600">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    {status.message}
                                  </Badge>
                                )}
                              </div>
                            )
                          }
                          
                          return (
                            <div key={key} className={key === "address" || key === "full_name" ? "col-span-2" : ""}>
                              <span className="text-muted-foreground">{label}:</span>{" "}
                              <span className="font-medium">{String(value)}</span>
                            </div>
                          )
                        })
                      }
                      {/* Mostrar mensaje si no hay datos útiles */}
                      {Object.entries(doc.scanned_data).filter(([key, value]) => 
                        value !== null && 
                        value !== undefined && 
                        value !== "" &&
                        !["scanned_at", "scanned_by", "document_type"].includes(key)
                      ).length === 0 && (
                        <div className="col-span-2 text-muted-foreground italic">
                          No se pudieron extraer datos del documento. Intenta con una imagen más clara.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

