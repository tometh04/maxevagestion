"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Trash2, AlertCircle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

interface ChartAccount {
  id: string
  account_code: string
  account_name: string
  category: string
  subcategory: string | null
  is_movement_account: boolean
  level: number
}

interface EntryLine {
  chart_account_id: string
  debit_amount: string
  credit_amount: string
}

interface CreateJournalEntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  ACTIVO: "Activo",
  PASIVO: "Pasivo",
  PATRIMONIO_NETO: "Patrimonio Neto",
  RESULTADO: "Resultado",
}

function formatNumber(value: number): string {
  return value.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function CreateJournalEntryDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateJournalEntryDialogProps) {
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<ChartAccount[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)

  // Form state
  const [entryDate, setEntryDate] = useState(
    new Date().toISOString().split("T")[0]
  )
  const [description, setDescription] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<EntryLine[]>([
    { chart_account_id: "", debit_amount: "", credit_amount: "" },
    { chart_account_id: "", debit_amount: "", credit_amount: "" },
  ])

  // Load chart of accounts
  useEffect(() => {
    if (!open) return
    setLoadingAccounts(true)
    fetch("/api/accounting/chart-of-accounts")
      .then((res) => res.json())
      .then((data) => {
        const flat: ChartAccount[] = data.flat || data.data || []
        setAccounts(flat.filter((a) => a.is_movement_account))
      })
      .catch(console.error)
      .finally(() => setLoadingAccounts(false))
  }, [open])

  // Calculate totals
  const totalDebit = lines.reduce(
    (sum, line) => sum + (parseFloat(line.debit_amount) || 0),
    0
  )
  const totalCredit = lines.reduce(
    (sum, line) => sum + (parseFloat(line.credit_amount) || 0),
    0
  )
  const difference = Math.abs(totalDebit - totalCredit)
  const isBalanced = difference < 0.01 && totalDebit > 0

  const addLine = () => {
    setLines([
      ...lines,
      { chart_account_id: "", debit_amount: "", credit_amount: "" },
    ])
  }

  const removeLine = (index: number) => {
    if (lines.length <= 2) return
    setLines(lines.filter((_, i) => i !== index))
  }

  const updateLine = (
    index: number,
    field: keyof EntryLine,
    value: string
  ) => {
    const updated = [...lines]
    updated[index] = { ...updated[index], [field]: value }

    // Si pone valor en Debe, limpiar Haber y viceversa
    if (field === "debit_amount" && value) {
      updated[index].credit_amount = ""
    } else if (field === "credit_amount" && value) {
      updated[index].debit_amount = ""
    }

    setLines(updated)
  }

  const resetForm = () => {
    setEntryDate(new Date().toISOString().split("T")[0])
    setDescription("")
    setNotes("")
    setLines([
      { chart_account_id: "", debit_amount: "", credit_amount: "" },
      { chart_account_id: "", debit_amount: "", credit_amount: "" },
    ])
  }

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error("Ingresá una descripción")
      return
    }
    if (!isBalanced) {
      toast.error("El asiento debe estar balanceado (Debe = Haber)")
      return
    }

    // Validate all lines have account selected
    const validLines = lines.filter(
      (l) => l.chart_account_id && (parseFloat(l.debit_amount) > 0 || parseFloat(l.credit_amount) > 0)
    )
    if (validLines.length < 2) {
      toast.error("Se necesitan al menos 2 líneas con cuenta y monto")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/accounting/journal-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_date: entryDate,
          description: description.trim(),
          notes: notes.trim() || null,
          currency: "ARS",
          lines: validLines.map((line) => ({
            chart_account_id: line.chart_account_id,
            debit_amount: parseFloat(line.debit_amount) || null,
            credit_amount: parseFloat(line.credit_amount) || null,
          })),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Error creando asiento")
      }

      const result = await res.json()
      toast.success(`Asiento #${result.entry_number} guardado correctamente`)
      resetForm()
      onCreated()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  // Group accounts by category
  const accountsByCategory = accounts.reduce(
    (acc, account) => {
      const cat = account.category
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(account)
      return acc
    },
    {} as Record<string, ChartAccount[]>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Asiento Contable</DialogTitle>
          <DialogDescription>
            Creá un asiento manual con partida doble. Debe = Haber.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="entry-date">Fecha</Label>
              <Input
                id="entry-date"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Descripción</Label>
              <Input
                id="description"
                placeholder="Ej: Pago de alquiler oficina"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Líneas del asiento</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine} className="gap-1">
                <Plus className="h-3.5 w-3.5" />
                Agregar línea
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left py-2 px-3 font-medium">Cuenta</th>
                    <th className="text-right py-2 px-3 font-medium w-[140px]">Debe</th>
                    <th className="text-right py-2 px-3 font-medium w-[140px]">Haber</th>
                    <th className="w-[40px]" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={index} className="border-b last:border-b-0">
                      <td className="py-1.5 px-2">
                        <Select
                          value={line.chart_account_id}
                          onValueChange={(val) =>
                            updateLine(index, "chart_account_id", val)
                          }
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="Seleccionar cuenta..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px]">
                            {Object.entries(accountsByCategory).map(
                              ([category, accs]) => (
                                <SelectGroup key={category}>
                                  <SelectLabel className="text-xs text-muted-foreground uppercase">
                                    {CATEGORY_LABELS[category] || category}
                                  </SelectLabel>
                                  {accs
                                    .sort((a, b) =>
                                      a.account_code.localeCompare(b.account_code)
                                    )
                                    .map((acc) => (
                                      <SelectItem key={acc.id} value={acc.id}>
                                        <span className="text-muted-foreground mr-1.5">
                                          {acc.account_code}
                                        </span>
                                        {acc.account_name}
                                      </SelectItem>
                                    ))}
                                </SelectGroup>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-1.5 px-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={line.debit_amount}
                          onChange={(e) =>
                            updateLine(index, "debit_amount", e.target.value)
                          }
                          className="h-9 text-right text-xs font-mono"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={line.credit_amount}
                          onChange={(e) =>
                            updateLine(index, "credit_amount", e.target.value)
                          }
                          className="h-9 text-right text-xs font-mono"
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeLine(index)}
                          disabled={lines.length <= 2}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="bg-muted/50 font-semibold">
                    <td className="py-2 px-3">TOTALES</td>
                    <td className="py-2 px-3 text-right font-mono text-sm">
                      $ {formatNumber(totalDebit)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sm">
                      $ {formatNumber(totalCredit)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Balance indicator */}
            <div
              className={`flex items-center gap-2 text-sm px-3 py-2 rounded-md ${
                isBalanced
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : totalDebit > 0 || totalCredit > 0
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {isBalanced ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Asiento balanceado
                </>
              ) : totalDebit > 0 || totalCredit > 0 ? (
                <>
                  <AlertCircle className="h-4 w-4" />
                  Diferencia: $ {formatNumber(difference)}
                </>
              ) : (
                <>Ingresá montos en Debe y Haber</>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              placeholder="Notas adicionales sobre el asiento..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !isBalanced || !description.trim()}
          >
            {loading ? "Guardando..." : "Guardar Asiento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
