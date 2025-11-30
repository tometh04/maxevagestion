"use client"

import { useState, useEffect } from "react"
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
import { DatePicker } from "@/components/ui/date-picker"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { format } from "date-fns"
import { es } from "date-fns/locale"

const ocrResultsSchema = z.object({
  first_name: z.string().min(1, "Nombre es requerido"),
  last_name: z.string().min(1, "Apellido es requerido"),
  document_type: z.string().optional(),
  document_number: z.string().optional(),
  date_of_birth: z.string().optional(),
  expiration_date: z.string().optional(),
  nationality: z.string().optional(),
})

type OCRResultsFormValues = z.infer<typeof ocrResultsSchema>

interface OCRResultsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: string
  parsedData: any
  onConfirm: (data: OCRResultsFormValues) => Promise<void>
}

export function OCRResultsDialog({
  open,
  onOpenChange,
  documentId,
  parsedData,
  onConfirm,
}: OCRResultsDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<OCRResultsFormValues>({
    resolver: zodResolver(ocrResultsSchema),
    defaultValues: {
      first_name: parsedData?.first_name || "",
      last_name: parsedData?.last_name || "",
      document_type: parsedData?.document_type || "",
      document_number: parsedData?.document_number || "",
      date_of_birth: parsedData?.date_of_birth || "",
      expiration_date: parsedData?.expiration_date || "",
      nationality: parsedData?.nationality || "",
    },
  })

  useEffect(() => {
    if (parsedData) {
      form.reset({
        first_name: parsedData.first_name || "",
        last_name: parsedData.last_name || "",
        document_type: parsedData.document_type || "",
        document_number: parsedData.document_number || "",
        date_of_birth: parsedData.date_of_birth || "",
        expiration_date: parsedData.expiration_date || "",
        nationality: parsedData.nationality || "",
      })
    }
  }, [parsedData, form])

  const handleConfirm = async (values: OCRResultsFormValues) => {
    setIsProcessing(true)
    setError(null)

    try {
      await onConfirm(values)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al confirmar datos")
    } finally {
      setIsProcessing(false)
    }
  }

  // Check if document is expired
  const isExpired = parsedData?.expiration_date
    ? new Date(parsedData.expiration_date) < new Date()
    : false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[600px] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resultados del OCR</DialogTitle>
          <DialogDescription>
            Revisa y confirma los datos extraídos del documento. Puedes editar cualquier campo antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        {isExpired && (
          <Alert className="text-red-600">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              ⚠️ Este documento está vencido. Se generará una alerta automáticamente.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="text-red-600">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleConfirm)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                    <FormLabel>Apellido</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
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
                      <Input {...field} />
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
                      <DatePicker
                        value={field.value || ""}
                        onChange={(value) => field.onChange(value)}
                        placeholder="Seleccionar fecha"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiration_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Vencimiento</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value || ""}
                        onChange={(value) => field.onChange(value)}
                        placeholder="Seleccionar fecha"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nationality"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Nacionalidad</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isProcessing}>
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Confirmar y Guardar
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


