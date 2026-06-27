"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
// Card imports removed - using modern border/rounded divs
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DecimalInput } from "@/components/ui/decimal-input"
import { Label } from "@/components/ui/label"
import { Loader2, ArrowLeft, Plus, Trash2, Calculator, ExternalLink, AlertTriangle } from "lucide-react"
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
import { translateAfipError } from "@/lib/afip/error-translator"
import {
  calculateInvoice,
  formatInvoiceMoney,
  getRecommendedAmountEntryMode,
  ITEM_TAX_TREATMENT_LABELS,
  shouldHideInvoiceTaxBreakdown,
} from "@/lib/invoices/calculation"
import type { ItemTaxTreatment } from "@/lib/invoices/calculation"
import { NewCustomerDialog } from "@/components/customers/new-customer-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface Customer {
  id: string
  first_name: string
  last_name: string
  email: string
  document_type?: string | null
  document_number?: string | null
}

interface OperationCustomer {
  id: string
  customer_id: string
  role: "MAIN" | "COMPANION"
  customers?: Customer | null
}

interface Operation {
  id: string
  file_code: string
  destination: string
  customer_id?: string | null
  total_cost?: number
  sale_currency?: "ARS" | "USD"
  sale_amount_total?: number
  operator_cost_total?: number
  operator_cost_currency?: "ARS" | "USD"
  operator_cost?: number | string | null
  operation_operators?: Array<{
    cost?: number | string | null
    cost_currency?: "ARS" | "USD" | null
  }>
}

interface OperationResponse {
  operation?: Operation
  customers?: OperationCustomer[]
}

interface InvoiceItem {
  descripcion: string
  cantidad: number
  precio_unitario: number
  iva_porcentaje: number
  tax_treatment: ItemTaxTreatment
}

const createEmptyItems = (): InvoiceItem[] => [
  { descripcion: '', cantidad: 1, precio_unitario: 0, iva_porcentaje: 21, tax_treatment: 'GRAVADO' }
]

const normalizeCustomer = (customer: Partial<Customer> & { id: string }): Customer => ({
  id: customer.id,
  first_name: customer.first_name || '',
  last_name: customer.last_name || '',
  email: customer.email || '',
  document_type: customer.document_type || null,
  document_number: customer.document_number || null,
})

const getCustomerFullName = (customer: Customer) =>
  `${customer.first_name || ''} ${customer.last_name || ''}`.trim()

const getCustomerDocumentText = (customer: Customer) =>
  customer.document_number
    ? `${customer.document_type || 'Doc'} ${customer.document_number}`
    : ''

const getCustomerAfipDocType = (customer: Pick<Customer, 'document_type' | 'document_number'>) => {
  const docType = customer.document_type?.toUpperCase()
  const hasDocument = Boolean(customer.document_number)

  if (!hasDocument) return 99
  if (docType === 'CUIT') return 80
  if (docType === 'CUIL') return 86
  if (docType === 'DNI') return 96
  return 99
}

export default function NewInvoicePage() {
  const router = useRouter()
  const urlSearchParams = useSearchParams()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  // AlertDialog persistente para cuando AFIP rechaza la autorización automática.
  // Antes solo había un toast destructive que el user perdía al ser redirigido.
  const [afipFailureAlert, setAfipFailureAlert] = useState<{ message: string; pendingRedirect: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const preselectedOperationId = urlSearchParams.get('operationId') || null
  const preselectedCustomerId = urlSearchParams.get('customerId') || null
  
  // Data
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerSearch, setCustomerSearch] = useState("")
  const [operations, setOperations] = useState<Operation[]>([])
  const [filteredOperations, setFilteredOperations] = useState<Operation[]>([])
  const [pointsOfSale, setPointsOfSale] = useState<Array<{
    agency_id: string
    agency_name: string
    points_of_sale: Array<{ numero: number; tipo: string; bloqueado: boolean }>
    has_ws_points: boolean
    default_point_of_sale?: number
  }>>([])
  
  // Form state
  const [formData, setFormData] = useState({
    customer_id: '',
    operation_id: '',
    agency_id: '', // Se determina del punto de venta seleccionado
    cbte_tipo: 6, // Factura B por defecto (RI emitiendo a Consumidor Final)
    pto_vta: 0, // Se selecciona del punto de venta
    concepto: 2, // Servicios
    receptor_nombre: '',
    receptor_doc_tipo: 99 as number, // 99=Sin especificar (Consumidor Final)
    receptor_doc_nro: '0',
    receptor_condicion_iva: 5 as number, // 5=Consumidor Final por defecto
    fecha_servicio_desde: new Date().toISOString().split('T')[0],
    fecha_servicio_hasta: new Date().toISOString().split('T')[0],
    moneda: 'PES' as 'PES' | 'DOL',
    cotizacion: 1,
  })
  
  // Estado para dialog de nuevo cliente
  const [showNewCustomerDialog, setShowNewCustomerDialog] = useState(false)
  
  const [items, setItems] = useState<InvoiceItem[]>(createEmptyItems())
  
  // Estado para operación seleccionada y conversión
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null)
  const [invoiceCurrency, setInvoiceCurrency] = useState<'PES' | 'DOL'>('PES')
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const [loadingExchangeRate, setLoadingExchangeRate] = useState(false)
  const [cotizacionAfip, setCotizacionAfip] = useState<number | null>(null)
  const [cotizacionLoading, setCotizacionLoading] = useState(false)
  const [invoiceRemaining, setInvoiceRemaining] = useState<number | null>(null)
  const amountEntryMode = getRecommendedAmountEntryMode(formData.cbte_tipo, formData.receptor_condicion_iva)
  const calculatedInvoice = calculateInvoice(items, amountEntryMode)
  const shouldHideTaxBreakdown = shouldHideInvoiceTaxBreakdown({
    amountEntryMode,
    cbteTipo: formData.cbte_tipo,
    receptorCondicionIva: formData.receptor_condicion_iva,
  })
  const activeCurrency = invoiceCurrency === 'DOL' ? 'DOL' : 'PES'
  const formatMoney = (value: number) => formatInvoiceMoney(value, activeCurrency)
  const getDefaultTaxTreatment = (cbteTipo: number): ItemTaxTreatment => cbteTipo === 19 ? 'EXENTO' : 'GRAVADO'
  const roundMoney = (value: number) => Math.round(value * 100) / 100
  const createDefaultItem = (cbteTipo: number): InvoiceItem => {
    const taxTreatment = getDefaultTaxTreatment(cbteTipo)
    return {
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0,
      iva_porcentaje: taxTreatment === 'GRAVADO' ? 21 : 0,
      tax_treatment: taxTreatment,
    }
  }
  const buildOperationInvoiceItems = (summary: any, cbteTipo: number): InvoiceItem[] => {
    const operation = summary.operation || {}
    const saleTotal = Number(operation.sale_amount_total || 0)
    const operatorCost = Number(operation.operator_cost || 0)
    const taxableDifference = roundMoney(Math.max(0, saleTotal - operatorCost))
    const destinationLabel = operation.destination || selectedOperation?.destination || 'Operacion'
    const fileCode = operation.file_code || selectedOperation?.file_code || ''
    const suffix = fileCode ? ` - ${destinationLabel} (${fileCode})` : ` - ${destinationLabel}`

    const nextItems: InvoiceItem[] = []

    if (operatorCost > 0) {
      nextItems.push({
        descripcion: `Costo de venta no gravado${suffix}`,
        cantidad: 1,
        precio_unitario: roundMoney(Math.min(operatorCost, saleTotal || operatorCost)),
        iva_porcentaje: 0,
        tax_treatment: 'NO_GRAVADO',
      })
    }

    if (taxableDifference > 0) {
      nextItems.push({
        descripcion: `Diferencia gravada 10.5%${suffix}`,
        cantidad: 1,
        precio_unitario: taxableDifference,
        iva_porcentaje: 10.5,
        tax_treatment: 'GRAVADO',
      })
    }

    return nextItems.length > 0 ? nextItems : [createDefaultItem(cbteTipo)]
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (invoiceCurrency !== 'DOL' || !formData.agency_id) {
      setCotizacionAfip(null)
      return
    }
    let cancelled = false
    setCotizacionLoading(true)
    const today = new Date().toISOString().split('T')[0]
    fetch(`/api/invoices/exchange-rate?currency=DOL&date=${today}&agency_id=${formData.agency_id}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.rate && d.rate > 0) {
          setCotizacionAfip(d.rate)
          if (exchangeRate === 1) setExchangeRate(d.rate)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCotizacionLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceCurrency, formData.agency_id])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // Cargar puntos de venta por agencia
      const pointsOfSaleRes = await fetch('/api/invoices/points-of-sale')
      if (pointsOfSaleRes.ok) {
        const data = await pointsOfSaleRes.json()
        setPointsOfSale(data.pointsOfSale || [])
        
        // Seleccionar el primer punto de venta CAE disponible por defecto
        if (data.pointsOfSale && data.pointsOfSale.length > 0) {
          const firstAgencyWithWs = data.pointsOfSale.find((a: any) => a.has_ws_points)
          if (firstAgencyWithWs) {
            setFormData(prev => ({
              ...prev,
              agency_id: firstAgencyWithWs.agency_id,
              pto_vta: firstAgencyWithWs.points_of_sale[0].numero,
            }))
          }
        }
      }
      
      // Cargar clientes
      const customersRes = await fetch('/api/customers?limit=100')
      if (customersRes.ok) {
        const data = await customersRes.json()
        setCustomers(data.customers || [])
      }
      
      // Cargar operaciones (inicialmente todas, luego se filtrarán por cliente)
      const operationsRes = await fetch('/api/operations?limit=100')
      if (operationsRes.ok) {
        const data = await operationsRes.json()
        setOperations(data.operations || [])
        setFilteredOperations(data.operations || []) // Inicialmente mostrar todas
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Calcula automáticamente el tipo de comprobante y condición IVA
   * según el documento fiscal disponible del cliente.
   * - CUIT presente → Factura A (RI), DocTipo 80, CondIVA 1
   * - CUIL presente → Factura B (CF), DocTipo 86, CondIVA 5
   * - DNI presente  → Factura B (CF), DocTipo 96, CondIVA 5
   * - Sin documento → Factura B (CF), DocTipo 99, DocNro 0, CondIVA 5
   */
  const getReceptorDefaults = (customer: Customer) => {
    const docType = customer.document_type?.toUpperCase()
    const docNumber = customer.document_number || ''
    const cuit = docType === 'CUIT' ? docNumber : ''
    const cuil = docType === 'CUIL' ? docNumber : ''
    const dni = docType === 'DNI' ? docNumber : ''

    if (cuit) {
      return {
        cbte_tipo: 1,
        receptor_doc_tipo: 80,
        receptor_doc_nro: cuit,
        receptor_condicion_iva: 1,
      }
    }

    if (cuil) {
      return {
        cbte_tipo: 6,
        receptor_doc_tipo: 86,
        receptor_doc_nro: cuil,
        receptor_condicion_iva: 5,
      }
    }

    return {
      cbte_tipo: 6,
      receptor_doc_tipo: dni ? 96 : 99,
      receptor_doc_nro: dni || '0',
      receptor_condicion_iva: 5,
    }
  }

  const upsertCustomer = (customer: Customer) => {
    setCustomers(prev => {
      const existingIndex = prev.findIndex(c => c.id === customer.id)
      if (existingIndex === -1) {
        return [customer, ...prev]
      }

      const next = [...prev]
      next[existingIndex] = {
        ...next[existingIndex],
        ...customer,
      }
      return next
    })
  }

  const fetchCustomerById = async (customerId: string): Promise<Customer | null> => {
    try {
      const response = await fetch(`/api/customers/${customerId}`)
      if (!response.ok) {
        return null
      }

      const data = await response.json()
      if (!data?.customer?.id) {
        return null
      }

      return normalizeCustomer(data.customer)
    } catch (error) {
      console.error('Error loading customer by id:', error)
      return null
    }
  }

  const fetchOperationById = async (operationId: string): Promise<OperationResponse | null> => {
    try {
      const response = await fetch(`/api/operations/${operationId}`)
      if (!response.ok) {
        return null
      }

      return await response.json()
    } catch (error) {
      console.error('Error loading operation details:', error)
      return null
    }
  }

  const loadCustomerOperations = async (customerId: string) => {
    if (!customerId) {
      setFilteredOperations(operations)
      return
    }

    try {
      const operationsRes = await fetch(`/api/customers/${customerId}/operations`)
      if (!operationsRes.ok) {
        setFilteredOperations([])
        return
      }

      const operationsData = await operationsRes.json()
      const operationsWithDetails = await Promise.all(
        (operationsData.operations || []).map(async (op: any) => {
          const opData = await fetchOperationById(op.id)
          return opData?.operation || op
        })
      )

      setFilteredOperations(operationsWithDetails.filter(Boolean))
    } catch (error) {
      console.error('Error loading customer operations:', error)
      setFilteredOperations([])
    }
  }

  const applyCustomerSelection = async (
    customer: Customer,
    options?: { preserveOperationId?: boolean; resetItems?: boolean }
  ) => {
    const normalizedCustomer = normalizeCustomer(customer)
    const receptorDefaults = getReceptorDefaults(normalizedCustomer)

    upsertCustomer(normalizedCustomer)

    setFormData(prev => ({
      ...prev,
      customer_id: normalizedCustomer.id,
      receptor_nombre: getCustomerFullName(normalizedCustomer),
      ...receptorDefaults,
      ...(options?.preserveOperationId ? {} : { operation_id: '' }),
    }))

    if (options?.resetItems !== false) {
      setItems([createDefaultItem(receptorDefaults.cbte_tipo)])
    }

    if (!options?.preserveOperationId) {
      setSelectedOperation(null)
    }

    await loadCustomerOperations(normalizedCustomer.id)
  }

  const handleCustomerChange = async (customerId: string) => {
    if (!customerId) {
      setFilteredOperations(operations)
      setFormData(prev => ({
        ...prev,
        customer_id: '',
        operation_id: '',
      }))
      setSelectedOperation(null)
      setInvoiceRemaining(null)
      setItems([createDefaultItem(formData.cbte_tipo)])
      return
    }

    let customer = customers.find(c => c.id === customerId)

    if (!customer) {
      customer = await fetchCustomerById(customerId) || undefined
    }

    if (customer) {
      await applyCustomerSelection(customer)
    }
  }

  const handleOperationChange = async (operationId: string) => {
    const operation = filteredOperations.find(o => o.id === operationId) || operations.find(o => o.id === operationId)
    if (operation) {
      try {
        const opData = await fetchOperationById(operationId)
        if (opData?.operation) {
          const fullOperation = opData.operation
          const nextInvoiceCurrency: 'PES' | 'DOL' = 'PES'
          
          setSelectedOperation(fullOperation)
          
          let fetchedRate = 1
          if (fullOperation.sale_currency === 'USD') {
            setLoadingExchangeRate(true)
            try {
              const today = new Date()
              const yesterday = new Date(today)
              yesterday.setDate(yesterday.getDate() - 1)

              const tcRes = await fetch(`/api/exchange-rates?date=${yesterday.toISOString().split('T')[0]}`)
              if (tcRes.ok) {
                const tcData = await tcRes.json()
                if (tcData.rate) {
                  fetchedRate = parseFloat(tcData.rate)
                } else {
                  const latestRes = await fetch('/api/exchange-rates/latest')
                  if (latestRes.ok) {
                    const latestData = await latestRes.json()
                    if (latestData.rate) {
                      fetchedRate = parseFloat(latestData.rate)
                    }
                  }
                }
              }
            } catch (error) {
              console.error('Error loading exchange rate:', error)
            } finally {
              setLoadingExchangeRate(false)
            }

            setExchangeRate(fetchedRate)

            setInvoiceCurrency(nextInvoiceCurrency)
            setFormData(prev => ({
              ...prev,
              operation_id: operationId,
              moneda: nextInvoiceCurrency,
            }))
          } else {
            setInvoiceCurrency(nextInvoiceCurrency)
            setFormData(prev => ({
              ...prev,
              operation_id: operationId,
              moneda: nextInvoiceCurrency,
              cotizacion: 1,
            }))
          }

          // Traer datos de facturación de la operación y precargar venta total:
          // costo como no gravado + diferencia gravada al 10.5%.
          const summaryRes = await fetch(`/api/operations/${operationId}/margin-summary`)
          if (!summaryRes.ok) {
            const err = await summaryRes.json().catch(() => ({ error: "Error al cargar operación" }))
            toast({
              title: "No se puede facturar esta operación",
              description: err.error || "Error al cargar",
              variant: "destructive",
            })
            return
          }
          const summary = await summaryRes.json()

          if (summary.summary.reason_disabled === 'no_customer' || summary.summary.reason_disabled === 'no_afip') {
            const reasonText: Record<string, string> = {
              no_customer: "La operación no tiene cliente asignado",
              no_afip: "AFIP no está configurado para esta organización",
            }
            toast({
              title: "No se puede facturar",
              description: reasonText[summary.summary.reason_disabled] || "Operación no facturable",
              variant: "destructive",
            })
            return
          }

          const authorizedTotal = (summary.invoices || [])
            .filter((invoice: any) => invoice.status === 'authorized')
            .reduce((sum: number, invoice: any) => sum + Number(invoice.imp_total || 0), 0)
          const operationSaleTotal = Number(summary.operation?.sale_amount_total || 0)
          const remainingToInvoice = roundMoney(Math.max(0, operationSaleTotal - authorizedTotal))

          if (remainingToInvoice <= 0) {
            toast({
              title: "No se puede facturar",
              description: "La operación ya está facturada completa",
              variant: "destructive",
            })
            return
          }

          setInvoiceRemaining(remainingToInvoice)
          // Los items se arman en la moneda nativa de la operación (USD para ops USD).
          // La factura por defecto se emite en PES, así que si la op es USD hay que
          // convertir los precios a ARS con el TC recién traído. Sin esto los items
          // quedaban en USD pero la moneda decía ARS (el cliente veía "el importe en
          // USD con cartel de ARS") y, al pasar a USD, se volvían a dividir por el TC
          // ("convierte raro" / doble conversión). El resto de los handlers
          // (handleInvoiceCurrencyChange / handleExchangeRateChange) ya asumen que
          // items está en la moneda mostrada, así que acá lo dejamos consistente.
          const builtItems = buildOperationInvoiceItems(summary, formData.cbte_tipo)
          const itemsInInvoiceCurrency =
            fullOperation.sale_currency === 'USD' && nextInvoiceCurrency === 'PES' && fetchedRate > 1
              ? builtItems.map(it => ({ ...it, precio_unitario: roundMoney(it.precio_unitario * fetchedRate) }))
              : builtItems
          setItems(itemsInInvoiceCurrency)
        }
      } catch (error) {
        console.error('Error loading operation details:', error)
        setSelectedOperation(operation)
        setFormData(prev => ({
          ...prev,
          operation_id: operationId,
        }))
      }
    } else {
      setSelectedOperation(null)
      setInvoiceRemaining(null)
      setFormData(prev => ({
        ...prev,
        operation_id: '',
      }))
    }
  }
  
  const handleInvoiceCurrencyChange = (currency: 'PES' | 'DOL') => {
    const oldCurrency = invoiceCurrency
    setInvoiceCurrency(currency)
    setFormData(prev => ({
      ...prev,
      moneda: currency === 'PES' ? 'PES' : 'DOL',
      cotizacion: currency === 'PES' && selectedOperation?.sale_currency === 'USD' 
        ? exchangeRate 
        : 1,
    }))
    
    if (selectedOperation && items.length > 0 && selectedOperation.sale_currency === 'USD') {
      const newItems = items.map(item => {
        let nuevoPrecio = item.precio_unitario
        
        if (oldCurrency === 'PES' && currency === 'DOL') {
          nuevoPrecio = item.precio_unitario / exchangeRate
        }
        else if (oldCurrency === 'DOL' && currency === 'PES') {
          nuevoPrecio = item.precio_unitario * exchangeRate
        }
        
        return {
          ...item,
          precio_unitario: nuevoPrecio,
        }
      })
      setItems(newItems)
    }
  }
  
  const handleExchangeRateChange = (rate: number) => {
    const oldRate = exchangeRate
    setExchangeRate(rate)
    setFormData(prev => ({
      ...prev,
      cotizacion: rate,
    }))
    
    if (selectedOperation?.sale_currency === 'USD' && invoiceCurrency === 'PES' && items.length > 0) {
      const newItems = items.map(item => {
        const precioUSD = item.precio_unitario / oldRate
        return {
          ...item,
          precio_unitario: precioUSD * rate,
        }
      })
      setItems(newItems)
    }
  }

  const handlePointOfSaleChange = (agencyId: string, ptoVta: number) => {
    setFormData(prev => ({
      ...prev,
      agency_id: agencyId,
      pto_vta: ptoVta,
    }))
  }

  useEffect(() => {
    if (loading || !preselectedOperationId) {
      return
    }

    let cancelled = false

    const preloadOperationBillingData = async () => {
      const opData = await fetchOperationById(preselectedOperationId)

      if (!opData?.operation) {
        if (!cancelled) {
          await handleOperationChange(preselectedOperationId)
        }
        return
      }

      // Si vino ?customerId=X en la URL, priorizamos ese (facturación múltiple
      // por operación: el seller eligió a qué pasajero facturar).
      const requestedCustomer = preselectedCustomerId
        ? opData.customers?.find((oc) => oc.customer_id === preselectedCustomerId)
        : null
      const mainOperationCustomer =
        requestedCustomer ||
        opData.customers?.find(operationCustomer => operationCustomer.role === 'MAIN') ||
        opData.customers?.[0]

      let customerToSelect =
        mainOperationCustomer?.customers
          ? normalizeCustomer(mainOperationCustomer.customers)
          : null

      if (!customerToSelect && opData.operation.customer_id) {
        customerToSelect =
          customers.find(customer => customer.id === opData.operation?.customer_id) ||
          await fetchCustomerById(opData.operation.customer_id)
      }

      if (customerToSelect && !cancelled) {
        await applyCustomerSelection(customerToSelect, {
          preserveOperationId: true,
          resetItems: false,
        })
      }

      if (!cancelled) {
        await handleOperationChange(preselectedOperationId)
      }
    }

    void preloadOperationBillingData()

    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, preselectedOperationId])

  const addItem = () => {
    setItems([
      ...items,
      createDefaultItem(formData.cbte_tipo)
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

  const updateItemTaxTreatment = (index: number, taxTreatment: ItemTaxTreatment) => {
    const newItems = [...items]
    newItems[index] = {
      ...newItems[index],
      tax_treatment: taxTreatment,
      iva_porcentaje:
        taxTreatment === 'GRAVADO'
          ? newItems[index].iva_porcentaje > 0
            ? newItems[index].iva_porcentaje
            : 21
          : 0,
    }
    setItems(newItems)
  }

  const handleSubmit = async () => {
    try {
      // Validaciones
      // Factura A requiere CUIT obligatoriamente
      if (formData.cbte_tipo === 1 && (!formData.receptor_doc_nro || formData.receptor_doc_nro === '0')) {
        toast({
          title: "Error de datos fiscales",
          description: "Factura A requiere el CUIT del receptor (Responsable Inscripto). Ingresá el CUIT del cliente.",
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
      
      // Validar tipo de cambio si se factura en ARS desde operación en USD
      if (selectedOperation?.sale_currency === 'USD' && invoiceCurrency === 'PES' && exchangeRate <= 1) {
        toast({
          title: "Error",
          description: "El tipo de cambio debe ser mayor a 1 para convertir USD a ARS",
          variant: "destructive",
        })
        setSaving(false)
        return
      }
      
      // Validar que se haya seleccionado un punto de venta
      if (!formData.agency_id || !formData.pto_vta) {
        toast({
          title: "Error",
          description: "Debe seleccionar un punto de venta",
          variant: "destructive",
        })
        setSaving(false)
        return
      }

      // Validación cliente-side: no facturar por encima de la venta restante de la operación.
      if (invoiceRemaining !== null) {
        const totalFinal = calculatedInvoice.totals.imp_total
        // invoiceRemaining está en la moneda nativa de la operación (USD para ops USD).
        // Si facturamos en PES desde una op USD, los items y el total están en ARS,
        // así que convertimos el restante a ARS para comparar en la misma moneda.
        const remainingInInvoiceCurrency =
          selectedOperation?.sale_currency === 'USD' && invoiceCurrency === 'PES'
            ? invoiceRemaining * exchangeRate
            : invoiceRemaining
        if (totalFinal > remainingInInvoiceCurrency + 0.01) {
          toast({
            title: "No se puede facturar",
            description: `Excede el total vendido restante (${formatMoney(remainingInInvoiceCurrency)})`,
            variant: "destructive",
          })
          setSaving(false)
          return
        }
      }

      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          operation_id: formData.operation_id || null, // Puede ser null
          customer_id: formData.customer_id || null, // Puede ser null
          agency_id: formData.agency_id, // Requerido: viene del punto de venta
          pto_vta: formData.pto_vta, // Requerido: punto de venta seleccionado
          amount_entry_mode: amountEntryMode,
          moneda: invoiceCurrency === 'PES' ? 'PES' : 'DOL',
          cotizacion: invoiceCurrency === 'DOL'
            ? (cotizacionAfip || exchangeRate || 1)
            : selectedOperation?.sale_currency === 'USD'
              ? exchangeRate
              : 1,
          fch_serv_desde: formData.fecha_servicio_desde,
          fch_serv_hasta: formData.fecha_servicio_hasta,
          items,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al crear factura')
      }

      const invoiceData = await response.json()
      const invoiceId = invoiceData.invoice?.id

      // Autorizar automáticamente con AFIP
      if (invoiceId) {
        const authRes = await fetch(`/api/invoices/${invoiceId}/authorize`, {
          method: 'POST',
        })
        const authData = await authRes.json()

        if (authRes.ok && authData.success) {
          toast({
            title: "✅ Factura autorizada por AFIP",
            description: `Nro: ${String(formData.pto_vta).padStart(4,'0')}-${String(authData.data?.cbte_nro).padStart(8,'0')} | CAE: ${authData.data?.cae} | Vto: ${authData.data?.cae_fch_vto}`,
          })
          router.push('/operations/billing')
        } else {
          // AFIP rechazó la autorización. NO redirigir — mostrar AlertDialog persistente
          // con el error completo para que el user no pierda el detalle (antes el toast
          // se iba al redirigir y la factura quedaba en draft sin que el user supiera
          // por qué). Cuando cierre el dialog, redirige al listado donde puede reintentar.
          setAfipFailureAlert({
            message: authData.error || "AFIP no pudo autorizar la factura. Podés reintentar desde el listado.",
            pendingRedirect: true,
          })
        }
      } else {
        toast({
          title: "Factura creada",
          description: "La factura se creó correctamente.",
        })
        router.push('/operations/billing')
      }
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
          <h1 className="text-2xl font-semibold tracking-tight">Nueva Factura Electrónica</h1>
          <p className="text-muted-foreground">
            Crea una nueva factura para autorizar con AFIP
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Datos del comprobante */}
          <div className="rounded-xl border border-border/40 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Tipo de Comprobante</h3>
              <p className="text-xs text-muted-foreground">Selecciona el tipo de factura a emitir</p>
            </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de Comprobante *</Label>
                  <Select
                    value={formData.cbte_tipo.toString()}
                    onValueChange={(v) => {
                      const tipo = parseInt(v)
                      // Sincronizar condición IVA al cambiar tipo manualmente
                      const condicion = tipo === 1 ? 1 : formData.receptor_condicion_iva === 1 ? 5 : formData.receptor_condicion_iva
                      setFormData({ ...formData, cbte_tipo: tipo, receptor_condicion_iva: condicion })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">Factura B</SelectItem>
                      <SelectItem value="1">Factura A</SelectItem>
                      <SelectItem value="11">Factura C (Monotributo)</SelectItem>
                      <SelectItem value="19">Factura E (Exportación)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    B = CF/Exento/Mono · A = RI · E = Exportación
                  </p>
                </div>
                <div>
                  <Label>Punto de Venta / Agencia *</Label>
                  {pointsOfSale.length > 0 && !pointsOfSale.some(a => a.has_ws_points) ? (
                    // Ninguna agencia tiene puntos de venta para web services
                    <div className="rounded-md border border-accent-coral/15 bg-accent-coral/5 p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-accent-coral mt-0.5 shrink-0" />
                        <div className="text-sm text-accent-coral">
                          <p className="font-medium">No tenés puntos de venta habilitados para Web Services</p>
                          <p className="mt-1 text-xs">
                            Para emitir facturas electrónicas necesitás crear un punto de venta de tipo <strong>CAE</strong> en el portal de ARCA.
                          </p>
                        </div>
                      </div>
                      <ol className="text-xs text-accent-coral space-y-1 ml-6 list-decimal">
                        <li>Ingresá a <strong>ARCA (afip.gob.ar)</strong> con Clave Fiscal</li>
                        <li>Ir a <strong>Administración de puntos de venta y domicilios → A/B/M de puntos de venta</strong></li>
                        <li>Crear un nuevo PV seleccionando:
                          <ul className="mt-0.5 ml-3 list-disc">
                            <li>Monotributista: <em>&ldquo;Factura Electrónica - Monotributo - Web Service&rdquo;</em></li>
                            <li>Responsable Inscripto: <em>&ldquo;RECE para aplicativo y Web Service&rdquo;</em></li>
                          </ul>
                        </li>
                        <li>Volvé acá y recargá la página</li>
                      </ol>
                      <a
                        href="https://auth.afip.gob.ar/contribuyente_/login.xhtml"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-accent-coral underline hover:text-accent-coral ml-6"
                      >
                        Ir al portal de ARCA <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ) : (
                    <Select
                      value={formData.pto_vta ? `${formData.agency_id}:${formData.pto_vta}` : ''}
                      onValueChange={(value) => {
                        const [agencyId, ptoVta] = value.split(':')
                        handlePointOfSaleChange(agencyId, parseInt(ptoVta))
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione punto de venta" />
                      </SelectTrigger>
                      <SelectContent>
                        {pointsOfSale.filter(a => a.has_ws_points).map((agency) => (
                          <div key={agency.agency_id}>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                              {agency.agency_name}
                            </div>
                            {agency.points_of_sale.map((pv) => (
                              <SelectItem
                                key={`${agency.agency_id}:${pv.numero}`}
                                value={`${agency.agency_id}:${pv.numero}`}
                              >
                                P.V. {String(pv.numero).padStart(4, '0')} — {pv.tipo}
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {formData.agency_id && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Agencia: {pointsOfSale.find(p => p.agency_id === formData.agency_id)?.agency_name || ''}
                    </p>
                  )}
                </div>
              </div>
          </div>

          {/* Datos del receptor */}
          <div className="rounded-xl border border-border/40 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Datos del Cliente</h3>
              <p className="text-xs text-muted-foreground">Información del receptor de la factura</p>
            </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Label>Seleccionar Cliente</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowNewCustomerDialog(true)}
                      className="h-7 px-2 text-xs"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Nuevo
                    </Button>
                  </div>
                  <Select
                    value={formData.customer_id}
                    onValueChange={handleCustomerChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Buscar cliente..." />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="px-2 pb-2">
                        <Input
                          placeholder="Buscar por nombre, apellido o documento..."
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          className="h-8 text-sm"
                          autoFocus
                        />
                      </div>
                      {customers
                        .filter(c => {
                          if (!customerSearch) return true
                          const search = customerSearch.toLowerCase()
                          return (
                            c.first_name?.toLowerCase().includes(search) ||
                            c.last_name?.toLowerCase().includes(search) ||
                            `${c.first_name} ${c.last_name}`.toLowerCase().includes(search) ||
                            c.document_number?.toLowerCase().includes(search)
                          )
                        })
                        .map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {getCustomerFullName(c)} {getCustomerDocumentText(c) ? `- ${getCustomerDocumentText(c)}` : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Operación Asociada (Opcional)</Label>
                  <Select 
                    value={formData.operation_id} 
                    onValueChange={handleOperationChange}
                    disabled={!formData.customer_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={
                        formData.customer_id 
                          ? "Seleccione operación del cliente" 
                          : "Primero seleccione un cliente"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredOperations.length === 0 ? (
                        <SelectItem value="" disabled>
                          {formData.customer_id 
                            ? "Este cliente no tiene operaciones" 
                            : "Seleccione un cliente primero"}
                        </SelectItem>
                      ) : (
                        filteredOperations.map(op => (
                          <SelectItem key={op.id} value={op.id}>
                            {op.file_code} - {op.destination}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {formData.customer_id && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Mostrando {filteredOperations.length} operación{filteredOperations.length !== 1 ? 'es' : ''} de este cliente
                    </p>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nombre/Razón Social</Label>
                  <Input
                    value={formData.receptor_nombre}
                    onChange={(e) => setFormData({ ...formData, receptor_nombre: e.target.value })}
                    placeholder="Nombre del receptor"
                  />
                </div>
                <div>
                  <Label>CUIT/DNI</Label>
                  <Input
                    value={formData.receptor_doc_nro === '0' ? '' : formData.receptor_doc_nro}
                    onChange={(e) => {
                      // Bug fix 2026-05-06: si el cliente fue cargado con DNI
                      // y el user tipea el CUIT acá manualmente para emitir
                      // Factura A, antes solo updateábamos receptor_doc_nro
                      // — el receptor_doc_tipo seguía siendo 96 (DNI) y AFIP
                      // rechazaba con 10013. Ahora también inferimos el tipo
                      // del documento desde la cantidad de dígitos tipeados:
                      //   11 dígitos → 80 (CUIT)
                      //   7-8 dígitos → 96 (DNI)
                      //   vacío → 99 (Consumidor Final)
                      // Si la condición IVA es Responsable Inscripto (1)
                      // forzamos siempre 80, incluso si todavía no terminó
                      // de tipear los 11 dígitos.
                      const docNro = e.target.value || '0'
                      const digits = docNro.replace(/\D/g, '')
                      let receptor_doc_tipo = formData.receptor_doc_tipo
                      if (formData.receptor_condicion_iva === 1) {
                        receptor_doc_tipo = 80
                      } else if (digits.length === 0) {
                        receptor_doc_tipo = 99
                      } else if (digits.length === 11) {
                        receptor_doc_tipo = 80
                      } else if (digits.length === 7 || digits.length === 8) {
                        receptor_doc_tipo = 96
                      }
                      setFormData({ ...formData, receptor_doc_nro: docNro, receptor_doc_tipo })
                    }}
                    placeholder={formData.receptor_condicion_iva === 1 ? "20123456789 (requerido)" : "Consumidor Final (opcional)"}
                  />
                </div>
              </div>

              {/* Condición IVA del receptor — determina el tipo de factura automáticamente */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Condición IVA del receptor *</Label>
                  <Select
                    value={formData.receptor_condicion_iva.toString()}
                    onValueChange={(v) => {
                      const condicion = parseInt(v)
                      // Mapear condición IVA → tipo de comprobante automáticamente
                      const cbte_tipo = condicion === 1 ? 1 : 6 // RI → A, resto → B

                      // Bug fix 2026-05-06: AFIP error 10013 — Factura A obliga
                      // DocTipo=80 (CUIT). Si el cliente tenía guardado DNI o
                      // CUIL y el user seleccionó Responsable Inscripto, la
                      // versión vieja dejaba pasar DocTipo=96/86 → AFIP rechaza.
                      // Ahora forzamos 80 cuando la condición es RI; el user
                      // ya ve el warning "Factura A requiere CUIT" si el campo
                      // está vacío.
                      let receptor_doc_tipo: number
                      if (condicion === 1) {
                        receptor_doc_tipo = 80
                      } else {
                        const selectedCustomer = customers.find(customer => customer.id === formData.customer_id)
                        const fallbackDocType = selectedCustomer
                          ? getCustomerAfipDocType(selectedCustomer)
                          : [80, 86, 96].includes(formData.receptor_doc_tipo)
                            ? formData.receptor_doc_tipo
                            : 96
                        receptor_doc_tipo =
                          formData.receptor_doc_nro && formData.receptor_doc_nro !== '0'
                            ? fallbackDocType
                            : 99
                      }
                      setFormData({ ...formData, receptor_condicion_iva: condicion, cbte_tipo, receptor_doc_tipo })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Consumidor Final → Factura B</SelectItem>
                      <SelectItem value="1">Responsable Inscripto → Factura A</SelectItem>
                      <SelectItem value="4">Sujeto Exento → Factura B</SelectItem>
                      <SelectItem value="6">Monotributista → Factura B</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tipo de factura: <strong>{formData.cbte_tipo === 1 ? "Factura A" : "Factura B"}</strong>
                  </p>
                </div>
                <div className="flex items-end">
                  {formData.receptor_condicion_iva === 1 && (!formData.receptor_doc_nro || formData.receptor_doc_nro === '0') ? (
                    <div className="flex items-start gap-2 rounded-md border border-accent-coral/15 bg-accent-coral/5 p-3 text-xs text-accent-coral w-full">
                      <AlertTriangle className="h-4 w-4 text-accent-coral mt-0.5 shrink-0" />
                      <span>Factura A requiere CUIT del receptor. Ingresá el CUIT en el campo de arriba.</span>
                    </div>
                  ) : (
                    <div className="rounded-md border border-success/15 bg-success/5 p-3 text-xs text-success w-full">
                      ✓ Tipo de comprobante determinado automáticamente por la condición IVA
                    </div>
                  )}
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
              
              {/* Moneda y Tipo de Cambio - Solo si hay operación en USD */}
              {selectedOperation?.sale_currency === 'USD' && (
                <div className="p-4 bg-primary/5 dark:bg-primary rounded-lg border border-primary/15 dark:border-primary space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-primary dark:text-primary">
                      ⚠️ Operación en USD - Configuración de Facturación
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Moneda de Facturación *</Label>
                      <Select 
                        value={invoiceCurrency} 
                        onValueChange={(v) => handleInvoiceCurrencyChange(v as 'PES' | 'DOL')}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PES">Pesos Argentinos (ARS)</SelectItem>
                          <SelectItem value="DOL">Dólares (USD)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        {invoiceCurrency === 'PES' 
                          ? 'La factura se emitirá en pesos, convirtiendo desde USD'
                          : 'La factura se emitirá en dólares'}
                      </p>
                    </div>
                    
                    {invoiceCurrency === 'PES' && (
                      <div>
                        <Label>
                          Tipo de Cambio USD/ARS *
                          {loadingExchangeRate && (
                            <Loader2 className="h-3 w-3 inline ml-2 animate-spin" />
                          )}
                        </Label>
                        <DecimalInput
                          value={exchangeRate}
                          onChange={(v) => handleExchangeRateChange(parseFloat(v) || 1)}
                          placeholder="Ej: 1500"
                        />
                        {cotizacionAfip && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Oficial AFIP hoy: <strong>{cotizacionAfip.toFixed(2)}</strong>
                            {cotizacionLoading && " (consultando...)"}
                          </p>
                        )}
                        {!cotizacionAfip && (
                          <p className="text-xs text-muted-foreground mt-1">
                            TC del día hábil anterior (según normativa AFIP)
                          </p>
                        )}
                        {cotizacionAfip && Math.abs(exchangeRate - cotizacionAfip) / cotizacionAfip > 0.02 && (
                          <p className="text-xs text-accent-coral mt-1">
                            ⚠️ Tu cotización difiere más del 2% del oficial. AFIP va a rechazar (error 10119).
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {invoiceCurrency === 'PES' && selectedOperation.sale_amount_total && (
                    <div className="text-xs text-muted-foreground">
                      <p>
                        <strong>Monto original:</strong> USD {selectedOperation.sale_amount_total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </p>
                      <p>
                        <strong>Equivalente en ARS:</strong> ARS {(selectedOperation.sale_amount_total * exchangeRate).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  )}
                </div>
              )}
          </div>

          {/* Items */}
          <div className="rounded-xl border border-border/40 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Conceptos / Items</h3>
                <p className="text-xs text-muted-foreground">Detalle de los servicios a facturar</p>
              </div>
              <Button variant="outline" size="sm" className="h-8 rounded-full" onClick={addItem}>
                <Plus className="h-4 w-4 mr-2" />
                Agregar Item
              </Button>
            </div>
              {items.map((item, index) => {
                const itemTotals = calculatedInvoice.items[index]
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
                    
                    <div className="grid gap-3 md:grid-cols-5">
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
                        <Label>{amountEntryMode === 'FINAL' ? 'Precio Final' : 'Precio Unit.'}</Label>
                        <DecimalInput
                          value={item.precio_unitario}
                          onChange={(v) => updateItem(index, 'precio_unitario', parseFloat(v) || 0)}
                        />
                      </div>
                      <div>
                        <Label>Tratamiento</Label>
                        <Select
                          value={item.tax_treatment}
                          onValueChange={(value) => updateItemTaxTreatment(index, value as ItemTaxTreatment)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GRAVADO">{ITEM_TAX_TREATMENT_LABELS.GRAVADO}</SelectItem>
                            <SelectItem value="EXENTO">{ITEM_TAX_TREATMENT_LABELS.EXENTO}</SelectItem>
                            <SelectItem value="NO_GRAVADO">{ITEM_TAX_TREATMENT_LABELS.NO_GRAVADO}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>IVA %</Label>
                        <Select 
                          value={item.tax_treatment === 'GRAVADO' ? item.iva_porcentaje.toString() : '0'}
                          onValueChange={(v) => updateItem(index, 'iva_porcentaje', parseFloat(v))}
                          disabled={item.tax_treatment !== 'GRAVADO'}
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
                        <Label>{amountEntryMode === 'FINAL' ? 'Total Final' : 'Total c/IVA'}</Label>
                        <Input
                          value={formatMoney(itemTotals?.total || 0)}
                          disabled
                          className="bg-muted text-right font-medium"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.tax_treatment === 'GRAVADO'
                        ? amountEntryMode === 'FINAL'
                          ? 'El importe ingresado se interpreta como total final; el neto e IVA se calculan internamente.'
                          : 'El importe ingresado se interpreta como neto; el total suma IVA.'
                        : item.tax_treatment === 'EXENTO'
                          ? 'Este concepto no calcula IVA y se informa como operación exenta en AFIP.'
                          : 'Este concepto no calcula IVA y se informa como no gravado en AFIP.'}
                    </p>
                  </div>
                )
              })}
          </div>
        </div>

        {/* Resumen */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border/40 p-5 space-y-4 sticky top-6">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Resumen
            </h3>
              <div className="space-y-2">
                {!shouldHideTaxBreakdown && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Neto gravado</span>
                    <span>{formatMoney(calculatedInvoice.totals.imp_neto)}</span>
                  </div>
                )}
                {!shouldHideTaxBreakdown && calculatedInvoice.totals.imp_tot_conc > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">No gravado</span>
                    <span>{formatMoney(calculatedInvoice.totals.imp_tot_conc)}</span>
                  </div>
                )}
                {!shouldHideTaxBreakdown && calculatedInvoice.totals.imp_op_ex > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Exento</span>
                    <span>{formatMoney(calculatedInvoice.totals.imp_op_ex)}</span>
                  </div>
                )}
                {!shouldHideTaxBreakdown && calculatedInvoice.totals.imp_iva > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">IVA</span>
                    <span>{formatMoney(calculatedInvoice.totals.imp_iva)}</span>
                  </div>
                )}
                <div className="border-t pt-2">
                  <div className="flex justify-between items-baseline">
                    <span className="font-semibold">{shouldHideTaxBreakdown ? 'Total final' : 'Total'}</span>
                    <span className="text-2xl font-semibold tabular-nums tracking-tight">{formatMoney(calculatedInvoice.totals.imp_total)}</span>
                  </div>
                </div>
              </div>
              {shouldHideTaxBreakdown && (
                <p className="text-xs text-muted-foreground">
                  Factura B a consumidor final: el importe cargado se toma como monto final y el IVA no se discrimina visualmente.
                </p>
              )}

              <div className="p-3 bg-muted rounded-lg space-y-1">
                <p className="text-xs text-muted-foreground">
                  <strong>Tipo:</strong>{" "}
                  <span className={formData.cbte_tipo === 1 ? "text-primary font-semibold" : "text-success font-semibold"}>
                    {COMPROBANTE_LABELS[formData.cbte_tipo as keyof typeof COMPROBANTE_LABELS]}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Condición receptor:</strong>{" "}
                  {formData.receptor_condicion_iva === 1 ? "Responsable Inscripto"
                    : formData.receptor_condicion_iva === 4 ? "Sujeto Exento"
                    : formData.receptor_condicion_iva === 6 ? "Monotributista"
                    : "Consumidor Final"}
                </p>
                <p className="text-xs text-muted-foreground">
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
                  Crear y Autorizar con AFIP
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  La factura se creará y autorizará en AFIP automáticamente.
                </p>
              </div>
          </div>
        </div>
      </div>

      {/* Dialog para crear nuevo cliente. Pasa operationId para que el doc
          OCR-eado se vincule a la operación (item 11). Pre-fillea con el
          CUIT/DNI typed en receptor (item 10b) para no perder lo escrito. */}
      <NewCustomerDialog
        open={showNewCustomerDialog}
        onOpenChange={setShowNewCustomerDialog}
        onSuccess={(customer) => {
          if (customer) {
            void applyCustomerSelection(normalizeCustomer(customer))
            setShowNewCustomerDialog(false)
          }
        }}
        operationId={formData.operation_id || undefined}
        prefillData={(() => {
          const docNro = formData.receptor_doc_nro && formData.receptor_doc_nro !== '0' ? formData.receptor_doc_nro : undefined
          if (!docNro) return undefined
          // Map AFIP receptor_doc_tipo → customer document_type
          // 80=CUIT, 86=CUIL, 96=DNI, 99=Sin especificar
          const typeMap: Record<number, string> = { 80: "CUIT", 86: "CUIL", 96: "DNI" }
          return {
            document_type: typeMap[formData.receptor_doc_tipo],
            document_number: docNro,
            // Si el receptor name está cargado, lo dejo en first_name (el user puede separar después)
            first_name: formData.receptor_nombre || undefined,
          }
        })()}
      />

      {/* AlertDialog persistente cuando AFIP rechaza la autorización automática.
          La factura quedó como draft pero el user necesita ver el motivo completo
          antes de ser redirigido al listado. */}
      <AlertDialog
        open={afipFailureAlert !== null}
        onOpenChange={(open) => {
          if (!open && afipFailureAlert?.pendingRedirect) {
            router.push('/operations/billing')
          }
          if (!open) setAfipFailureAlert(null)
        }}
      >
        <AlertDialogContent className="max-w-lg">
          {(() => {
            const t = translateAfipError(afipFailureAlert?.message)
            return (
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  {t.title}
                  {t.code !== null && (
                    <span className="text-xs font-mono text-muted-foreground">#{t.code}</span>
                  )}
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>La factura quedó guardada como <strong>borrador</strong>. Podés reintentar desde el listado con el botón &quot;Autorizar&quot;.</p>

                    {/* Caso traducido: mostrar explicación + paso accionable */}
                    {t.severity !== 'unknown' && (
                      <>
                        <div className="rounded-md border border-accent-coral/30 bg-accent-coral/5 p-3 space-y-2">
                          <p className="text-sm">{t.explanation}</p>
                          <div className="border-t border-accent-coral/20 pt-2">
                            <p className="text-xs font-medium text-accent-coral mb-1">Qué hacer:</p>
                            <p className="text-sm">{t.action}</p>
                          </div>
                        </div>
                        <details className="rounded-md border border-border bg-muted/20 p-2">
                          <summary className="text-xs cursor-pointer text-muted-foreground select-none">
                            Ver mensaje técnico de AFIP
                          </summary>
                          <p className="text-xs font-mono whitespace-pre-wrap break-words mt-2 text-muted-foreground">
                            {t.rawMessage}
                          </p>
                        </details>
                      </>
                    )}

                    {/* Fallback: código no mapeado, mostrar raw + causas comunes */}
                    {t.severity === 'unknown' && (
                      <>
                        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                          <p className="text-xs font-medium text-destructive mb-1">Error reportado por AFIP:</p>
                          <p className="text-sm font-mono whitespace-pre-wrap break-words">{t.rawMessage}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{t.action}</p>
                      </>
                    )}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
            )
          })()}
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              if (afipFailureAlert?.pendingRedirect) {
                router.push('/operations/billing')
              }
              setAfipFailureAlert(null)
            }}>
              Entendido, ir al listado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
