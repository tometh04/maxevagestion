"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Upload, FileText, X, Eye, Trash2, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
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

interface LeadDocumentsSectionProps {
  leadId: string
}

export function LeadDocumentsSection({ leadId }: LeadDocumentsSectionProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadDocuments()
  }, [leadId])

  const loadDocuments = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/leads/${leadId}/documents`)
      if (!response.ok) {
        throw new Error("Error al cargar documentos")
      }
      const data = await response.json()
      setDocuments(data.documents || [])
    } catch (error) {
      console.error("Error loading documents:", error)
      toast.error("Error al cargar documentos")
    } finally {
      setLoading(false)
    }
  }

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

      const response = await fetch(`/api/leads/${leadId}/documents/upload`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al subir documento")
      }

      const data = await response.json()
      toast.success("Documento subido y escaneado correctamente")
      
      // Recargar documentos
      await loadDocuments()
      
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
      const response = await fetch(`/api/leads/${leadId}/documents/${documentId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Error al eliminar documento")
      }

      toast.success("Documento eliminado")
      await loadDocuments()
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

  if (loading) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Documentos Escaneados
        </h3>
        <div className="text-sm text-muted-foreground">Cargando...</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Documentos Escaneados
        </h3>
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
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
      </div>

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
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">{getDocumentTypeLabel(doc.type)}</Badge>
                    {doc.scanned_data && (
                      <Badge variant="default" className="bg-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Escaneado
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Subido: {format(new Date(doc.uploaded_at), "PPp")}
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
                    {doc.scanned_data.document_number && (
                      <div>
                        <span className="text-muted-foreground">Número:</span>{" "}
                        <span className="font-medium">{doc.scanned_data.document_number}</span>
                      </div>
                    )}
                    {doc.scanned_data.full_name && (
                      <div>
                        <span className="text-muted-foreground">Nombre:</span>{" "}
                        <span className="font-medium">{doc.scanned_data.full_name}</span>
                      </div>
                    )}
                    {doc.scanned_data.first_name && (
                      <div>
                        <span className="text-muted-foreground">Nombre:</span>{" "}
                        <span className="font-medium">{doc.scanned_data.first_name}</span>
                      </div>
                    )}
                    {doc.scanned_data.last_name && (
                      <div>
                        <span className="text-muted-foreground">Apellido:</span>{" "}
                        <span className="font-medium">{doc.scanned_data.last_name}</span>
                      </div>
                    )}
                    {doc.scanned_data.date_of_birth && (
                      <div>
                        <span className="text-muted-foreground">Fecha de Nacimiento:</span>{" "}
                        <span className="font-medium">{doc.scanned_data.date_of_birth}</span>
                      </div>
                    )}
                    {doc.scanned_data.nationality && (
                      <div>
                        <span className="text-muted-foreground">Nacionalidad:</span>{" "}
                        <span className="font-medium">{doc.scanned_data.nationality}</span>
                      </div>
                    )}
                    {doc.scanned_data.expiration_date && (
                      <div>
                        <span className="text-muted-foreground">Vencimiento:</span>{" "}
                        <span className="font-medium">{doc.scanned_data.expiration_date}</span>
                      </div>
                    )}
                    {doc.scanned_data.place_of_birth && (
                      <div>
                        <span className="text-muted-foreground">Lugar de Nacimiento:</span>{" "}
                        <span className="font-medium">{doc.scanned_data.place_of_birth}</span>
                      </div>
                    )}
                    {doc.scanned_data.address && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Dirección:</span>{" "}
                        <span className="font-medium">{doc.scanned_data.address}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

