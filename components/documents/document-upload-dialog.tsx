"use client"

import { useState, useRef } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Upload, FileText, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

const documentTypeOptions = [
  { value: "PASSPORT", label: "Pasaporte" },
  { value: "DNI", label: "DNI" },
  { value: "VOUCHER", label: "Voucher" },
  { value: "INVOICE", label: "Factura" },
  { value: "PAYMENT_PROOF", label: "Comprobante de Pago" },
  { value: "OTHER", label: "Otro" },
]

const uploadSchema = z.object({
  type: z.enum(["PASSPORT", "DNI", "VOUCHER", "INVOICE", "PAYMENT_PROOF", "OTHER"]),
  file: z.instanceof(File).refine((file) => file.size <= 10 * 1024 * 1024, {
    message: "El archivo debe ser menor a 10MB",
  }),
})

type UploadFormValues = z.infer<typeof uploadSchema>

interface DocumentUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  operationId?: string | null
  customerId?: string | null
  onSuccess?: (document: any) => void
  onParseRequested?: (documentId: string) => void
}

export function DocumentUploadDialog({
  open,
  onOpenChange,
  operationId,
  customerId,
  onSuccess,
  onParseRequested,
}: DocumentUploadDialogProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      type: "DNI",
      file: undefined as any,
    },
  })

  const selectedFile = form.watch("file")

  const onSubmit = async (values: UploadFormValues) => {
    setIsUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", values.file)
      formData.append("type", values.type)
      if (operationId) formData.append("operationId", operationId)
      if (customerId) formData.append("customerId", customerId)

      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Error al subir el documento")
      }

      const { document } = await response.json()

      form.reset()
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }

      onSuccess?.(document)

      // If it's a DNI or PASSPORT, suggest OCR parsing
      if ((values.type === "DNI" || values.type === "PASSPORT") && onParseRequested) {
        onParseRequested(document.id)
      } else {
        onOpenChange(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[500px] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Subir Documento</DialogTitle>
          <DialogDescription>
            Sube un documento para asociarlo a {operationId ? "esta operación" : customerId ? "este cliente" : "el sistema"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <Alert className="text-red-600">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Documento</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {documentTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
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
              name="file"
              render={({ field: { value, onChange, ...fieldProps } }) => (
                <FormItem>
                  <FormLabel>Archivo</FormLabel>
                  <FormControl>
                    <div className="space-y-2">
                      <Input
                        {...fieldProps}
                        type="file"
                        accept="image/*,.pdf"
                        ref={fileInputRef}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            onChange(file)
                          }
                        }}
                        disabled={isUploading}
                      />
                      {selectedFile && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <FileText className="h-4 w-4" />
                          <span>{selectedFile.name}</span>
                          <span className="text-xs">
                            ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isUploading}>
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Subir
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}


