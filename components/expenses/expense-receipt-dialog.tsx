"use client"

import { useState, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, Upload, FileText, ExternalLink, Receipt as ReceiptIcon, CloudUpload } from "lucide-react"

interface Receipt {
  id: string
  file_url: string
  uploaded_at: string
}

interface ExpenseReceiptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expenseType: "variable" | "recurring"
  expenseId: string
  expenseName?: string
}

export function ExpenseReceiptDialog({
  open,
  onOpenChange,
  expenseType,
  expenseId,
  expenseName,
}: ExpenseReceiptDialogProps) {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      fetchReceipts()
    }
  }, [open, expenseId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchReceipts = async () => {
    setLoading(true)
    try {
      const param = expenseType === "variable"
        ? `cash_movement_id=${expenseId}`
        : `recurring_payment_id=${expenseId}`
      const res = await fetch(`/api/expenses/receipts?${param}`)
      if (res.ok) {
        const data = await res.json()
        setReceipts(data.receipts || [])
      }
    } catch (err) {
      console.error("Error fetching receipts:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      if (expenseType === "variable") {
        formData.append("cash_movement_id", expenseId)
      } else {
        formData.append("recurring_payment_id", expenseId)
      }

      const res = await fetch("/api/expenses/receipts", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Error al subir comprobante")
      }

      await fetchReceipts()
    } catch (err) {
      console.error("Error uploading receipt:", err)
      alert(err instanceof Error ? err.message : "Error al subir comprobante")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const isImage = (url: string) => {
    return /\.(jpg|jpeg|png|webp)$/i.test(url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Comprobantes</DialogTitle>
          {expenseName && (
            <p className="text-sm text-muted-foreground">{expenseName}</p>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-emerald-500/10">
                  <ReceiptIcon className="h-3.5 w-3.5 text-emerald-500" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Comprobantes Cargados</h4>
              </div>
              {receipts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay comprobantes cargados
                </p>
              ) : (
                <div className="grid gap-3">
                  {receipts.map((receipt) => (
                    <div
                      key={receipt.id}
                      className="border rounded-lg p-3 flex items-center gap-3"
                    >
                      {isImage(receipt.file_url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={receipt.file_url}
                          alt="Comprobante"
                          className="w-16 h-16 object-cover rounded border"
                        />
                      ) : (
                        <div className="w-16 h-16 flex items-center justify-center bg-muted rounded border">
                          <FileText className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {new Date(receipt.uploaded_at).toLocaleDateString("es-AR")}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(receipt.file_url, "_blank")}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-orange-500/10">
                  <CloudUpload className="h-3.5 w-3.5 text-orange-500" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Subir Comprobante</h4>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Subir Comprobante
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                JPG, PNG, WebP o PDF. Máximo 10MB.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
