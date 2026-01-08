"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, FileText, Send, Eye, Download, Search, Filter } from "lucide-react"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { COMPROBANTE_LABELS } from "@/lib/afip/types"

interface Invoice {
  id: string
  cbte_tipo: number
  pto_vta: number
  cbte_nro?: number
  cae?: string
  cae_fch_vto?: string
  receptor_nombre: string
  receptor_doc_nro: string
  imp_total: number
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
          <h1 className="text-3xl font-bold">Facturación Electrónica</h1>
          <p className="text-muted-foreground">
            Gestión de facturas electrónicas AFIP
          </p>
        </div>
        <Button asChild>
          <Link href="/operations/billing/new">
            <Plus className="mr-2 h-4 w-4" />
            Nueva Factura
          </Link>
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente, CUIT, número o CAE..."
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <Filter className="mr-2 h-4 w-4" />
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
        </CardContent>
      </Card>

      {/* Tabla de facturas */}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
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
                        <Button variant="outline" size="icon">
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
        </CardContent>
      </Card>

      {/* Dialog de detalle de factura */}
      <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedInvoice && COMPROBANTE_LABELS[selectedInvoice.cbte_tipo as keyof typeof COMPROBANTE_LABELS]}
              {selectedInvoice?.cbte_nro && ` ${String(selectedInvoice.pto_vta).padStart(4, '0')}-${String(selectedInvoice.cbte_nro).padStart(8, '0')}`}
            </DialogTitle>
            <DialogDescription>
              Detalle de la factura
            </DialogDescription>
          </DialogHeader>
          
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Cliente</Label>
                  <p className="font-medium">{selectedInvoice.receptor_nombre}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">CUIT/DNI</Label>
                  <p className="font-mono">{selectedInvoice.receptor_doc_nro}</p>
                </div>
              </div>

              {selectedInvoice.cae && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">CAE</Label>
                    <p className="font-mono">{selectedInvoice.cae}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Vencimiento CAE</Label>
                    <p>{selectedInvoice.cae_fch_vto}</p>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-muted-foreground">Items</Label>
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">P. Unit.</TableHead>
                      <TableHead className="text-right">IVA</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedInvoice.invoice_items?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.descripcion}</TableCell>
                        <TableCell className="text-right">{item.cantidad}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.precio_unitario)}</TableCell>
                        <TableCell className="text-right">{item.iva_porcentaje}%</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end">
                <div className="text-right">
                  <p className="text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{formatCurrency(selectedInvoice.imp_total)}</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedInvoice(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
