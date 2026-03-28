"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Calculator, BookOpen } from "lucide-react"

interface IvaTabsProps {
  posicionContent: React.ReactNode
  libroContent: React.ReactNode
}

export function IvaTabs({ posicionContent, libroContent }: IvaTabsProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">IVA</h1>

      <Tabs defaultValue="posicion">
        <TabsList>
          <TabsTrigger value="posicion" className="gap-1.5">
            <Calculator className="h-3.5 w-3.5" />
            Posición IVA
          </TabsTrigger>
          <TabsTrigger value="libro" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Libro IVA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posicion" className="mt-6">
          {posicionContent}
        </TabsContent>

        <TabsContent value="libro" className="mt-6">
          {libroContent}
        </TabsContent>
      </Tabs>
    </div>
  )
}
