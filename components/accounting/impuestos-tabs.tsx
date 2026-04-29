"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Calculator, ShieldCheck, Building2, Percent } from "lucide-react"

interface ImpuestosTabsProps {
  ivaContent: React.ReactNode
  withholdingsContent: React.ReactNode
  iibbContent: React.ReactNode
  gananciasContent: React.ReactNode
}

export function ImpuestosTabs({
  ivaContent,
  withholdingsContent,
  iibbContent,
  gananciasContent,
}: ImpuestosTabsProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Impuestos</h1>

      <Tabs defaultValue="iva">
        <TabsList>
          <TabsTrigger value="iva" className="gap-1.5">
            <Calculator className="h-3.5 w-3.5" />
            IVA
          </TabsTrigger>
          <TabsTrigger value="withholdings" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Percepciones y Retenciones
          </TabsTrigger>
          <TabsTrigger value="iibb" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            IIBB
          </TabsTrigger>
          <TabsTrigger value="ganancias" className="gap-1.5">
            <Percent className="h-3.5 w-3.5" />
            Ganancias
          </TabsTrigger>
        </TabsList>

        <TabsContent value="iva" className="mt-6">
          {ivaContent}
        </TabsContent>

        <TabsContent value="withholdings" className="mt-6">
          {withholdingsContent}
        </TabsContent>

        <TabsContent value="iibb" className="mt-6">
          {iibbContent}
        </TabsContent>

        <TabsContent value="ganancias" className="mt-6">
          {gananciasContent}
        </TabsContent>
      </Tabs>
    </div>
  )
}
