"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Building2, Plus, Pencil } from "lucide-react"
import { toast } from "sonner"

const agencySchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  city: z.string().min(1, "La ciudad es requerida"),
  timezone: z.string().min(1, "El timezone es requerido"),
})

type AgencyFormValues = z.infer<typeof agencySchema>

export function AgenciesSettings() {
  const [agencies, setAgencies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingAgency, setEditingAgency] = useState<any>(null)
  const [isSaving, setIsSaving] = useState(false)

  const form = useForm<AgencyFormValues>({
    resolver: zodResolver(agencySchema),
    defaultValues: {
      name: "",
      city: "",
      timezone: "America/Argentina/Buenos_Aires",
    },
  })

  useEffect(() => {
    loadAgencies()
  }, [])

  const loadAgencies = async () => {
    try {
      const res = await fetch("/api/settings/agencies")
      const data = await res.json()
      setAgencies(data.agencies || [])
    } catch (error) {
      console.error("Error loading agencies:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (values: AgencyFormValues) => {
    setIsSaving(true)
    try {
      const res = await fetch("/api/settings/agencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingAgency ? { id: editingAgency.id, ...values } : values),
      })
      const data = await res.json()
      if (res.ok) {
        setOpen(false)
        setEditingAgency(null)
        form.reset()
        loadAgencies()
      } else {
        toast.error(data.error || "Error al guardar agencia")
      }
    } catch (error) {
      console.error("Error saving agency:", error)
      toast.error("Error al guardar agencia")
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = (agency: any) => {
    setEditingAgency(agency)
    form.reset({
      name: agency.name,
      city: agency.city,
      timezone: agency.timezone,
    })
    setOpen(true)
  }

  const handleNew = () => {
    setEditingAgency(null)
    form.reset({
      name: "",
      city: "",
      timezone: "America/Argentina/Buenos_Aires",
    })
    setOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Agencias</h2>
            <p className="text-sm text-muted-foreground">Gestiona las sucursales de tu empresa</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={handleNew}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Nueva Agencia
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingAgency ? "Editar Agencia" : "Nueva Agencia"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                      <Building2 className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Datos de la Agencia</h4>
                  </div>
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ciudad</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Timezone</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="America/Argentina/Buenos_Aires" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isSaving}>
                  {isSaving ? "Guardando..." : editingAgency ? "Actualizar" : "Crear"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
            <Building2 className="h-3.5 w-3.5 text-primary" />
          </div>
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Sucursales</h4>
        </div>
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/50">
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : agencies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No hay agencias
                  </TableCell>
                </TableRow>
              ) : (
                agencies.map((agency) => (
                  <TableRow key={agency.id}>
                    <TableCell className="font-medium">{agency.name}</TableCell>
                    <TableCell>{agency.city}</TableCell>
                    <TableCell className="text-muted-foreground text-sm font-mono">{agency.timezone}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(agency)}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
