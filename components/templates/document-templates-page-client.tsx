"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { QuotationModelsPageClient } from "@/components/templates/quotation-models-page-client"
import { TemplatesPageClient } from "@/components/templates/templates-page-client"

export function DocumentTemplatesPageClient({
  agencies,
}: {
  agencies: Array<{ id: string; name: string }>
}) {
  return (
    <Tabs defaultValue="quotations" className="space-y-5">
      <TabsList>
        <TabsTrigger value="quotations">Cotizaciones</TabsTrigger>
        <TabsTrigger value="other">Otros documentos</TabsTrigger>
      </TabsList>
      <TabsContent value="quotations"><QuotationModelsPageClient /></TabsContent>
      <TabsContent value="other"><TemplatesPageClient agencies={agencies} /></TabsContent>
    </Tabs>
  )
}
