"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, Send, Eye, Download, Search, Filter, FileText, User, DollarSign, ShieldCheck, AlertCircle, Hash, Calendar } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import Link from "next/link"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { COMPROBANTE_LABELS } from "@/lib/afip/types"

interface Invoice {
  id: string
  agency_id?: string
  cbte_tipo: number
  pto_vta: number
  cbte_nro?: number
  cae?: string
  cae_fch_vto?: string
  receptor_nombre: string
  receptor_doc_nro: string
  receptor_condicion_iva?: number
  imp_neto?: number
  imp_iva?: number
  imp_total: number
  moneda?: string
  cotizacion?: number
  status: string
  fecha_emision?: string
  created_at: string
  operations?: { id: string; file_code: string; destination: string }
  customers?: { id: string; first_name: string; last_name: string }
  invoice_items?: Array<{
    id: string
    descripcion: string
    cantidad: number
    precio_unitario: number
    subtotal: number
    iva_porcentaje: number
    iva_importe: number
    total: number
  }>
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Borrador", variant: "outline" },
  pending: { label: "Pendiente", variant: "secondary" },
  sent: { label: "Enviada", variant: "default" },
  authorized: { label: "Autorizada", variant: "default" },
  rejected: { label: "Rechazada", variant: "destructive" },
  cancelled: { label: "Anulada", variant: "destructive" },
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)
}

export function InvoicesPageClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [search, setSearch] = useState("")
  const [authorizing, setAuthorizing] = useState<string | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  useEffect(() => {
    loadInvoices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const loadInvoices = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== "ALL") params.append("status", statusFilter)

      const response = await fetch(`/api/invoices?${params.toString()}`)
      
      if (!response.ok) {
        throw new Error('Error al cargar facturas')
      }

      const data = await response.json()
      setInvoices(data.invoices || [])
    } catch (error: any) {
      console.error('Error loading invoices:', error)
      toast({
        title: "Error",
        description: error.message || "No se pudieron cargar las facturas",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const authorizeInvoice = async (invoiceId: string) => {
    try {
      setAuthorizing(invoiceId)
      
      const response = await fetch(`/api/invoices/${invoiceId}/authorize`, {
        method: 'POST',
      })

      const data = await response.json()

      if (response.ok && data.success) {
        toast({
          title: "Factura autorizada",
          description: `CAE: ${data.data.cae}`,
        })
        loadInvoices()
      } else {
        toast({
          title: "Error al autorizar",
          description: data.error || "No se pudo autorizar la factura",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error('Error authorizing invoice:', error)
      toast({
        title: "Error",
        description: error.message || "Error al autorizar factura",
        variant: "destructive",
      })
    } finally {
      setAuthorizing(null)
    }
  }

  const filteredInvoices = invoices.filter(inv => {
    if (!search) return true
    const searchLower = search.toLowerCase()
    return (
      inv.receptor_nombre.toLowerCase().includes(searchLower) ||
      inv.receptor_doc_nro.includes(search) ||
      inv.cbte_nro?.toString().includes(search) ||
      inv.cae?.includes(search)
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/operations">Operaciones</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Facturación</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facturación Electrónica</h1>
          <p className="text-sm text-muted-foreground">
            Gestión de facturas electrónicas AFIP
          </p>
        </div>
        <Button size="sm" className="h-8 rounded-full" asChild>
          <Link href="/operations/billing/new">
            <Plus className="mr-2 h-4 w-4" />
            Nueva Factura
          </Link>
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, CUIT, número o CAE..."
            className="pl-10 h-8 text-xs rounded-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px] w-auto">
            <Filter className="mr-2 h-3.5 w-3.5" />
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="authorized">Autorizada</SelectItem>
            <SelectItem value="rejected">Rechazada</SelectItem>
            <SelectItem value="cancelled">Anulada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla de facturas */}
      <div className="rounded-xl border border-border/40 overflow-hidden">
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>Comprobante</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>CUIT/DNI</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>CAE</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <div className="font-medium">
                      {COMPROBANTE_LABELS[invoice.cbte_tipo as keyof typeof COMPROBANTE_LABELS] || `Tipo ${invoice.cbte_tipo}`}
                    </div>
                    {invoice.cbte_nro && (
                      <div className="text-sm text-muted-foreground">
                        {String(invoice.pto_vta).padStart(4, '0')}-{String(invoice.cbte_nro).padStart(8, '0')}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{invoice.receptor_nombre}</TableCell>
                  <TableCell className="font-mono text-sm">{invoice.receptor_doc_nro}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(invoice.imp_total)}
                  </TableCell>
                  <TableCell>
                    {invoice.cae ? (
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {invoice.cae}
                      </code>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusLabels[invoice.status]?.variant || "outline"}>
                      {statusLabels[invoice.status]?.label || invoice.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {invoice.fecha_emision 
                      ? format(new Date(invoice.fecha_emision), "dd/MM/yyyy", { locale: es })
                      : format(new Date(invoice.created_at), "dd/MM/yyyy", { locale: es })
                    }
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedInvoice(invoice)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {(invoice.status === 'draft' || invoice.status === 'pending') && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => authorizeInvoice(invoice.id)}
                          disabled={authorizing === invoice.id}
                        >
                          {authorizing === invoice.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Send className="mr-1 h-4 w-4" />
                              Autorizar
                            </>
                          )}
                        </Button>
                      )}
                      {invoice.status === 'authorized' && (
                        <Button
                          variant="outline"
                          size="icon"
                          title="Descargar PDF"
                          onClick={() => window.open(`/api/invoices/${invoice.id}/pdf`, '_blank')}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredInvoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {search || statusFilter !== "ALL" 
                      ? "No se encontraron facturas con los filtros aplicados"
                      : "No hay facturas creadas. Crea tu primera factura."
                    }
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dialog de detalle de factura */}
      <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span>
                {selectedInvoice && COMPROBANTE_LABELS[selectedInvoice.cbte_tipo as keyof typeof COMPROBANTE_LABELS]}
                {selectedInvoice?.cbte_nro && ` ${String(selectedInvoice.pto_vta).padStart(4, '0')}-${String(selectedInvoice.cbte_nro).padStart(8, '0')}`}
              </span>
              {selectedInvoice && (
                <Badge variant={statusLabels[selectedInvoice.status]?.variant ?? 'outline'}>
                  {statusLabels[selectedInvoice.status]?.label ?? selectedInvoice.status}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Detalle de la factura electrónica
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && (
            <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Datos del Receptor */}
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center h-6 w-6 rounded-md bg-blue-500/10">
                    <User className="h-3.5 w-3.5 text-blue-500" />
                  </div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Receptor</h4>
                </div>
                <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-0.5">Cliente</p>
                    <p className="text-sm font-medium">{selectedInvoice.receptor_nombre}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-0.5">CUIT/DNI</p>
                    <p className="text-sm font-mono">{selectedInvoice.receptor_doc_nro !== '0' ? selectedInvoice.receptor_doc_nro : 'Consumidor Final'}</p>
                  </div>
                  {selectedInvoice.operations && (
                    <div className="col-span-2">
                      <p className="text-[11px] text-muted-foreground mb-0.5">Operación</p>
                      <p className="text-sm">{selectedInvoice.operations.file_code} — {selectedInvoice.operations.destination}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* AFIP / CAE */}
              {selectedInvoice.cae ? (
                <div className="rounded-xl border border-green-200 dark:border-green-800/40 bg-green-50/50 dark:bg-green-950/20 p-4 space-y-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center justify-center h-6 w-6 rounded-md bg-green-500/10">
                      <ShieldCheck className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    </div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-widest text-green-700 dark:text-green-400">Autorización AFIP</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                    <div>
                      <p className="text-[11px] text-green-600/70 dark:text-green-500/70 mb-0.5">CAE</p>
                      <p className="text-sm font-mono font-medium text-green-800 dark:text-green-300">{selectedInvoice.cae}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-green-600/70 dark:text-green-500/70 mb-0.5">Vencimiento CAE</p>
                      <p className="text-sm text-green-800 dark:text-green-300">{selectedInvoice.cae_fch_vto}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-green-600/70 dark:text-green-500/70 mb-0.5">Comprobante N°</p>
                      <p className="text-sm font-mono text-green-800 dark:text-green-300">
                        {String(selectedInvoice.pto_vta).padStart(4, '0')}-{String(selectedInvoice.cbte_nro).padStart(8, '0')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-green-600/70 dark:text-green-500/70 mb-0.5">Fecha de Emisión</p>
                      <p className="text-sm text-green-800 dark:text-green-300">
                        {selectedInvoice.fecha_emision
                          ? format(new Date(selectedInvoice.fecha_emision), "dd/MM/yyyy", { locale: es })
                          : format(new Date(selectedInvoice.created_at), "dd/MM/yyyy", { locale: es })
                        }
                      </p>
                    </div>
                  </div>
                </div>
              ) : selectedInvoice.status === 'rejected' ? (
                <div className="rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center h-6 w-6 rounded-md bg-red-500/10">
                      <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    </div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-widest text-red-700 dark:text-red-400">Rechazada por AFIP</h4>
                  </div>
                  <p className="text-xs text-red-700 dark:text-red-300">Esta factura no fue autorizada. Creá una nueva con los datos corregidos.</p>
                </div>
              ) : null}

              {/* Items */}
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center h-6 w-6 rounded-md bg-emerald-500/10">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                  </div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Detalle</h4>
                </div>
                <div className="rounded-lg border border-border/30 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs">Descripción</TableHead>
                        <TableHead className="text-xs text-right w-[60px]">Cant.</TableHead>
                        <TableHead className="text-xs text-right w-[100px]">P. Unit.</TableHead>
                        <TableHead className="text-xs text-right w-[60px]">IVA</TableHead>
                        <TableHead className="text-xs text-right w-[100px]">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedInvoice.invoice_items?.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-sm">{item.descripcion}</TableCell>
                          <TableCell className="text-sm text-right tabular-nums">{item.cantidad}</TableCell>
                          <TableCell className="text-sm text-right tabular-nums">{formatCurrency(item.precio_unitario)}</TableCell>
                          <TableCell className="text-sm text-right">{item.iva_porcentaje}%</TableCell>
                          <TableCell className="text-sm text-right font-medium tabular-nums">{formatCurrency(item.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Totals */}
                <div className="flex justify-end">
                  <div className="w-[240px] space-y-1.5 pt-2">
                    {(selectedInvoice.imp_neto != null && selectedInvoice.imp_neto !== selectedInvoice.imp_total) && (
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Subtotal</span>
                        <span className="tabular-nums">{formatCurrency(selectedInvoice.imp_neto)}</span>
                      </div>
                    )}
                    {(selectedInvoice.imp_iva != null && selectedInvoice.imp_iva > 0) && (
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>IVA</span>
                        <span className="tabular-nums">{formatCurrency(selectedInvoice.imp_iva)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline pt-1.5 border-t border-border/40">
                      <span className="text-sm font-medium">Total</span>
                      <span className="text-xl font-semibold tabular-nums tracking-tight">{formatCurrency(selectedInvoice.imp_total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="px-6 pb-6">
            <Button variant="outline" onClick={() => setSelectedInvoice(null)}>
              Cerrar
            </Button>
            {selectedInvoice?.status === 'authorized' && (
              <Button
                variant="default"
                onClick={() => window.open(`/api/invoices/${selectedInvoice.id}/pdf`, '_blank')}
              >
                <Download className="mr-2 h-4 w-4" />
                Descargar PDF
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
