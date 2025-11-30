"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DocumentUploadDialog } from "./document-upload-dialog"
import { OCRResultsDialog } from "./ocr-results-dialog"
import { FileText, Upload, Sparkles } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { useRouter } from "next/navigation"

interface DocumentsSectionProps {
  documents: any[]
  operationId?: string
  customerId?: string
}

export function DocumentsSection({ documents, operationId, customerId }: DocumentsSectionProps) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [parsedData, setParsedData] = useState<any>(null)
  const [isParsing, setIsParsing] = useState(false)
  const router = useRouter()

  const handleUploadSuccess = (document: any) => {
    router.refresh()
    // If it's DNI or PASSPORT, automatically trigger OCR
    if ((document.type === "DNI" || document.type === "PASSPORT") && document.id) {
      handleParseDocument(document.id)
    }
  }

  const handleParseDocument = async (documentId: string) => {
    setIsParsing(true)
    setSelectedDocumentId(documentId)

    try {
      const response = await fetch("/api/documents/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentId }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Error al procesar el documento")
      }

      const { data } = await response.json()
      setParsedData(data)
      setOcrDialogOpen(true)
      router.refresh()
    } catch (error) {
      console.error("Error parsing document:", error)
      alert(error instanceof Error ? error.message : "Error al procesar el documento")
    } finally {
      setIsParsing(false)
    }
  }

  const handleConfirmOCR = async (data: any) => {
    // The OCR API already updates the customer, so we just need to refresh
    router.refresh()
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Documentos</CardTitle>
          <Button onClick={() => setUploadDialogOpen(true)} size="sm">
            <Upload className="mr-2 h-4 w-4" />
            Subir Documento
          </Button>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay documentos</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{doc.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(doc.uploaded_at), "dd/MM/yyyy HH:mm", { locale: es })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(doc.type === "DNI" || doc.type === "PASSPORT") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleParseDocument(doc.id)}
                        disabled={isParsing}
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        Procesar OCR
                      </Button>
                    )}
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm">
                        Ver
                      </Button>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DocumentUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        operationId={operationId || null}
        customerId={customerId || null}
        onSuccess={handleUploadSuccess}
        onParseRequested={handleParseDocument}
      />

      <OCRResultsDialog
        open={ocrDialogOpen}
        onOpenChange={setOcrDialogOpen}
        documentId={selectedDocumentId || ""}
        parsedData={parsedData}
        onConfirm={handleConfirmOCR}
      />
    </>
  )
}


