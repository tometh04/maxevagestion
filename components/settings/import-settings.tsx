"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ImportSection } from "@/components/settings/import-section"
import { Users, CreditCard, Building2, Wallet, FileSpreadsheet, Upload, Info } from "lucide-react"

const importTypes = [
  {
    id: "customers",
    name: "Clientes",
    description: "Importar clientes/pasajeros con sus datos personales",
    icon: Users,
    fields: ["first_name", "last_name", "phone", "email", "document_type", "document_number", "date_of_birth", "nationality"],
    requiredFields: ["first_name", "last_name", "phone"],
    template: "clientes_template.csv",
  },
  {
    id: "operators",
    name: "Operadores",
    description: "Importar operadores/proveedores mayoristas",
    icon: Building2,
    fields: ["name", "contact_name", "contact_email", "contact_phone", "credit_limit"],
    requiredFields: ["name"],
    template: "operadores_template.csv",
  },
  {
    id: "operations",
    name: "Operaciones",
    description: "Importar ventas/operaciones históricas",
    icon: FileSpreadsheet,
    fields: ["file_code", "customer_email", "destination", "departure_date", "return_date", "adults", "children", "sale_amount", "operator_cost", "currency", "status", "seller_email", "operator_name"],
    requiredFields: ["destination", "departure_date", "sale_amount", "operator_cost"],
    template: "operaciones_template.csv",
  },
  {
    id: "payments",
    name: "Pagos",
    description: "Importar pagos de clientes o a operadores",
    icon: CreditCard,
    fields: ["operation_file_code", "amount", "currency", "date_due", "date_paid", "status", "direction", "payer_type", "method", "reference"],
    requiredFields: ["operation_file_code", "amount", "currency", "date_due", "direction"],
    template: "pagos_template.csv",
  },
  {
    id: "cash_movements",
    name: "Movimientos de Caja",
    description: "Importar movimientos históricos de caja",
    icon: Wallet,
    fields: ["date", "type", "amount", "currency", "description", "account_name", "category", "notes"],
    requiredFields: ["date", "type", "amount", "currency", "description"],
    template: "movimientos_caja_template.csv",
  },
]

export function ImportSettings() {
  const [activeTab, setActiveTab] = useState("customers")

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
          <Upload className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Importación Masiva de Datos</h2>
          <p className="text-sm text-muted-foreground">Importa datos desde archivos CSV para migrar información existente al sistema</p>
        </div>
      </div>

      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
            <Info className="h-3.5 w-3.5 text-primary" />
          </div>
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Instrucciones</h4>
        </div>
        <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
          <li><strong>Descarga la plantilla</strong> del tipo de dato que quieres importar</li>
          <li><strong>Completa los datos</strong> en la plantilla siguiendo el formato indicado</li>
          <li><strong>Sube el archivo</strong> y revisa la vista previa</li>
          <li><strong>Confirma la importación</strong> si los datos son correctos</li>
        </ol>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          {importTypes.map((type) => (
            <TabsTrigger key={type.id} value={type.id} className="flex items-center gap-2">
              <type.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{type.name}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {importTypes.map((type) => (
          <TabsContent key={type.id} value={type.id}>
            <ImportSection
              type={type.id}
              name={type.name}
              description={type.description}
              fields={type.fields}
              requiredFields={type.requiredFields}
              templateName={type.template}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
