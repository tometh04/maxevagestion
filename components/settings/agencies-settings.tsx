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
        alert(data.error || "Error al guardar agencia")
      }
    } catch (error) {
      console.error("Error saving agency:", error)
      alert("Error al guardar agencia")
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Agencias</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleNew}>Nueva Agencia</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingAgency ? "Editar Agencia" : "Nueva Agencia"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                <Button type="submit" className="w-full">
                  {editingAgency ? "Actualizar" : "Crear"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
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
                  <TableCell>{agency.name}</TableCell>
                  <TableCell>{agency.city}</TableCell>
                  <TableCell>{agency.timezone}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(agency)}>
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
  )
}

