"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Partner {
  id: string
  partner_name: string
  profit_percentage: number | null
}

interface DistributeProfitsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
  month: number
  profitAmount: number
  exchangeRate: number
  onSuccess?: () => void
}

export function DistributeProfitsDialog({
  open,
  onOpenChange,
  year,
  month,
  profitAmount,
  exchangeRate,
  onSuccess,
}: DistributeProfitsDialogProps) {
  const { toast } = useToast()
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(false)
  const [distributing, setDistributing] = useState(false)
  const [preview, setPreview] = useState<Array<{ partner_name: string; percentage: number; amount: number }>>([])

  // Cargar socios al abrir el dialog
  useEffect(() => {
    if (open) {
      loadPartners()
    }
  }, [open])

  // Calcular preview cuando cambian los datos
  useEffect(() => {
    if (partners.length > 0 && profitAmount > 0) {
      const previewData = partners
        .filter((p) => (p.profit_percentage || 0) > 0)
        .map((partner) => ({
          partner_name: partner.partner_name,
          percentage: partner.profit_percentage || 0,
          amount: (profitAmount * (partner.profit_percentage || 0)) / 100,
        }))
      setPreview(previewData)
    }
  }, [partners, profitAmount])

  const loadPartners = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/partner-accounts")
      const data = await res.json()
      if (data.partners) {
        setPartners(data.partners.filter((p: Partner) => p.is_active !== false))
      }
    } catch (error) {
      console.error("Error loading partners:", error)
      toast({
        title: "Error",
        description: "No se pudieron cargar los socios",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDistribute = async () => {
    // Verificar que la suma de porcentajes sea 100
    const totalPercentage = partners.reduce((sum, p) => sum + (p.profit_percentage || 0), 0)
    if (Math.abs(totalPercentage - 100) > 0.01) {
      toast({
        title: "Error",
        description: `La suma de porcentajes debe ser 100%. Actual: ${totalPercentage.toFixed(2)}%`,
        variant: "destructive",
      })
      return
    }

    setDistributing(true)
    try {
      const res = await fetch("/api/partner-accounts/distribute-profits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          profitAmount,
          exchangeRate,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        toast({
          title: "Éxito",
          description: data.message || "Ganancias distribuidas exitosamente",
        })
        onOpenChange(false)
        if (onSuccess) {
          onSuccess()
        }
      } else {
        toast({
          title: "Error",
          description: data.error || "No se pudieron distribuir las ganancias",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error distributing profits:", error)
      toast({
        title: "Error",
        description: "Error al distribuir ganancias",
        variant: "destructive",
      })
    } finally {
      setDistributing(false)
    }
  }

  const totalPercentage = partners.reduce((sum, p) => sum + (p.profit_percentage || 0), 0)
  const isValid = Math.abs(totalPercentage - 100) < 0.01 && profitAmount > 0 && preview.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Distribuir Ganancias a Socios</DialogTitle>
          <DialogDescription>
            Distribuye las ganancias del mes {month}/{year} entre los socios según sus porcentajes asignados.
            Total a distribuir: ${profitAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })} USD
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Alerta de validación de porcentajes */}
            {totalPercentage > 0 && (
              <Alert variant={isValid ? "default" : "destructive"}>
                {isValid ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>
                      Porcentajes válidos: {totalPercentage.toFixed(2)}% = 100%
                    </AlertDescription>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      La suma de porcentajes debe ser 100%. Actual: {totalPercentage.toFixed(2)}%
                    </AlertDescription>
                  </>
                )}
              </Alert>
            )}

            {/* Preview de distribución */}
            {preview.length > 0 && (
              <div className="space-y-2">
                <Label>Vista Previa de Distribución</Label>
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Socio</TableHead>
                        <TableHead className="text-right">Porcentaje</TableHead>
                        <TableHead className="text-right">Monto USD</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{item.partner_name}</TableCell>
                          <TableCell className="text-right">{item.percentage.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">
                            ${item.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold">
                        <TableCell>TOTAL</TableCell>
                        <TableCell className="text-right">{totalPercentage.toFixed(2)}%</TableCell>
                        <TableCell className="text-right">
                          ${profitAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {preview.length === 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No hay socios activos con porcentaje de ganancias asignado. Configure los porcentajes en "Cuentas de Socios".
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={distributing}>
            Cancelar
          </Button>
          <Button onClick={handleDistribute} disabled={!isValid || distributing || loading}>
            {distributing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Distribuyendo...
              </>
            ) : (
              "Distribuir Ganancias"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
