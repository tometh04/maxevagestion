"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, ArrowLeft, Plus, Trash2, Calculator } from "lucide-react"
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
import { COMPROBANTE_LABELS } from "@/lib/afip/types"

interface Customer {
  id: string
  first_name: string
  last_name: string
  email: string
  cuit?: string
  dni?: string
}

interface Operation {
  id: string
  file_code: string
  destination: string
  total_cost?: number
}

interface InvoiceItem {
  descripcion: string
  cantidad: number
  precio_unitario: number
  iva_porcentaje: number
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(value)
}

export default function NewInvoicePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  
  // Data
  const [customers, setCustomers] = useState<Customer[]>([])
  const [operations, setOperations] = useState<Operation[]>([])
  
  // Form state
  const [formData, setFormData] = useState({
    customer_id: '',
    operation_id: '',
    cbte_tipo: 11, // Factura C por defecto
    pto_vta: 1,
    concepto: 2, // Servicios
    receptor_nombre: '',
    receptor_doc_tipo: 80, // CUIT
    receptor_doc_nro: '',
    fecha_servicio_desde: new Date().toISOString().split('T')[0],
    fecha_servicio_hasta: new Date().toISOString().split('T')[0],
  })
  
  const [items, setItems] = useState<InvoiceItem[]>([
    { descripcion: '', cantidad: 1, precio_unitario: 0, iva_porcentaje: 21 }
  ])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // Cargar clientes
      const customersRes = await fetch('/api/customers?limit=100')
      if (customersRes.ok) {
        const data = await customersRes.json()
        setCustomers(data.customers || [])
      }
      
      // Cargar operaciones
      const operationsRes = await fetch('/api/operations?limit=100')
      if (operationsRes.ok) {
        const data = await operationsRes.json()
        setOperations(data.operations || [])
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId)
    if (customer) {
      setFormData({
        ...formData,
        customer_id: customerId,
        receptor_nombre: `${customer.first_name} ${customer.last_name}`,
        receptor_doc_nro: customer.cuit || customer.dni || '',
        receptor_doc_tipo: customer.cuit ? 80 : 96, // 80=CUIT, 96=DNI
      })
    }
  }

  const handleOperationChange = (operationId: string) => {
    const operation = operations.find(o => o.id === operationId)
    if (operation) {
      setFormData({
        ...formData,
        operation_id: operationId,
      })
      
      // Auto-completar item con información de la operación
      if (items.length === 1 && !items[0].descripcion) {
        setItems([{
          descripcion: `Servicios turísticos - ${operation.destination} (${operation.file_code})`,
          cantidad: 1,
          precio_unitario: operation.total_cost || 0,
          iva_porcentaje: 21,
        }])
      }
    }
  }

  const addItem = () => {
    setItems([
      ...items,
      { descripcion: '', cantidad: 1, precio_unitario: 0, iva_porcentaje: 21 }
    ])
  }

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index))
    }
  }

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
  }

  // Calcular totales
  const calculateItemTotal = (item: InvoiceItem) => {
    const subtotal = item.cantidad * item.precio_unitario
    const ivaImporte = subtotal * (item.iva_porcentaje / 100)
    return { subtotal, ivaImporte, total: subtotal + ivaImporte }
  }

  const totals = items.reduce((acc, item) => {
    const itemTotals = calculateItemTotal(item)
    return {
      subtotal: acc.subtotal + itemTotals.subtotal,
      iva: acc.iva + itemTotals.ivaImporte,
      total: acc.total + itemTotals.total,
    }
  }, { subtotal: 0, iva: 0, total: 0 })

  const handleSubmit = async () => {
    try {
      // Validaciones
      if (!formData.receptor_nombre || !formData.receptor_doc_nro) {
        toast({
          title: "Error",
          description: "Debe seleccionar un cliente con datos fiscales",
          variant: "destructive",
        })
        return
      }

      if (items.some(item => !item.descripcion || item.precio_unitario <= 0)) {
        toast({
          title: "Error",
          description: "Todos los items deben tener descripción y precio",
          variant: "destructive",
        })
        return
      }

      setSaving(true)
      
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          items: items.map(item => {
            const itemTotals = calculateItemTotal(item)
            return {
              ...item,
              subtotal: itemTotals.subtotal,
              iva_importe: itemTotals.ivaImporte,
              total: itemTotals.total,
            }
          }),
          imp_neto: totals.subtotal,
          imp_iva: totals.iva,
          imp_total: totals.total,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al crear factura')
      }

      toast({
        title: "Factura creada",
        description: "La factura se creó como borrador. Puede autorizarla con AFIP.",
      })
      
      router.push('/operations/billing')
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

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
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/operations/billing">Facturación</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Nueva Factura</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/operations/billing">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Nueva Factura Electrónica</h1>
          <p className="text-muted-foreground">
            Crea una nueva factura para autorizar con AFIP
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Datos del comprobante */}
          <Card>
            <CardHeader>
              <CardTitle>Tipo de Comprobante</CardTitle>
              <CardDescription>Selecciona el tipo de factura a emitir</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de Comprobante *</Label>
                  <Select 
                    value={formData.cbte_tipo.toString()} 
                    onValueChange={(v) => setFormData({ ...formData, cbte_tipo: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Factura A</SelectItem>
                      <SelectItem value="6">Factura B</SelectItem>
                      <SelectItem value="11">Factura C</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Punto de Venta</Label>
                  <Input
                    type="number"
                    value={formData.pto_vta}
                    onChange={(e) => setFormData({ ...formData, pto_vta: parseInt(e.target.value) || 1 })}
                    min={1}
                    max={99999}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Datos del receptor */}
          <Card>
            <CardHeader>
              <CardTitle>Datos del Cliente</CardTitle>
              <CardDescription>Información del receptor de la factura</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Seleccionar Cliente</Label>
                  <Select 
                    value={formData.customer_id} 
                    onValueChange={handleCustomerChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Buscar cliente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.first_name} {c.last_name} {c.cuit ? `- ${c.cuit}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Operación Asociada</Label>
                  <Select 
                    value={formData.operation_id} 
                    onValueChange={handleOperationChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Vincular a operación (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {operations.map(op => (
                        <SelectItem key={op.id} value={op.id}>
                          {op.file_code} - {op.destination}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nombre/Razón Social *</Label>
                  <Input
                    value={formData.receptor_nombre}
                    onChange={(e) => setFormData({ ...formData, receptor_nombre: e.target.value })}
                    placeholder="Nombre del receptor"
                  />
                </div>
                <div>
                  <Label>CUIT/DNI *</Label>
                  <Input
                    value={formData.receptor_doc_nro}
                    onChange={(e) => setFormData({ ...formData, receptor_doc_nro: e.target.value })}
                    placeholder="20123456789"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Fecha Desde (Servicio)</Label>
                  <Input
                    type="date"
                    value={formData.fecha_servicio_desde}
                    onChange={(e) => setFormData({ ...formData, fecha_servicio_desde: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Fecha Hasta (Servicio)</Label>
                  <Input
                    type="date"
                    value={formData.fecha_servicio_hasta}
                    onChange={(e) => setFormData({ ...formData, fecha_servicio_hasta: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Conceptos / Items</CardTitle>
                  <CardDescription>Detalle de los servicios a facturar</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item, index) => {
                const itemTotals = calculateItemTotal(item)
                return (
                  <div key={index} className="p-4 border rounded-lg space-y-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Item #{index + 1}</span>
                      {items.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    
                    <div>
                      <Label>Descripción *</Label>
                      <Input
                        value={item.descripcion}
                        onChange={(e) => updateItem(index, 'descripcion', e.target.value)}
                        placeholder="Descripción del servicio"
                      />
                    </div>
                    
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <Label>Cantidad</Label>
                        <Input
                          type="number"
                          value={item.cantidad}
                          onChange={(e) => updateItem(index, 'cantidad', parseFloat(e.target.value) || 0)}
                          min={1}
                        />
                      </div>
                      <div>
                        <Label>Precio Unit.</Label>
                        <Input
                          type="number"
                          value={item.precio_unitario}
                          onChange={(e) => updateItem(index, 'precio_unitario', parseFloat(e.target.value) || 0)}
                          min={0}
                          step={0.01}
                        />
                      </div>
                      <div>
                        <Label>IVA %</Label>
                        <Select 
                          value={item.iva_porcentaje.toString()}
                          onValueChange={(v) => updateItem(index, 'iva_porcentaje', parseFloat(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0%</SelectItem>
                            <SelectItem value="10.5">10.5%</SelectItem>
                            <SelectItem value="21">21%</SelectItem>
                            <SelectItem value="27">27%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Subtotal</Label>
                        <Input
                          value={formatCurrency(itemTotals.subtotal)}
                          disabled
                          className="bg-muted text-right"
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>

        {/* Resumen */}
        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Resumen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">IVA</span>
                  <span>{formatCurrency(totals.iva)}</span>
                </div>
                <div className="border-t pt-2">
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>{formatCurrency(totals.total)}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">
                  <strong>Tipo:</strong> {COMPROBANTE_LABELS[formData.cbte_tipo as keyof typeof COMPROBANTE_LABELS]}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <strong>Punto de Venta:</strong> {String(formData.pto_vta).padStart(4, '0')}
                </p>
              </div>

              <div className="space-y-2">
                <Button 
                  onClick={handleSubmit} 
                  className="w-full"
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Crear Factura (Borrador)
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  La factura se creará como borrador. Podrás autorizarla con AFIP después.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
