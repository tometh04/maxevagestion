"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Plus,
  Pencil,
  Trash2,
  FileText,
  Link2,
  ArrowLeft,
  FolderPlus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { ResourceUploadDialog } from "@/components/library/resource-upload-dialog"
import { CategoryFormDialog } from "@/components/library/category-form-dialog"
import type { LibraryCategory, LibraryResource } from "@/lib/library/types"

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  CONTABLE: "Contable",
  SELLER: "Vendedor",
  VIEWER: "Solo lectura",
  POST_VENTA: "Post venta",
}

interface Props {
  categories: LibraryCategory[]
  resources: LibraryResource[]
}

type PendingDelete =
  | { kind: "resource"; id: string; label: string }
  | { kind: "category"; id: string; label: string }
  | null

export function LibraryAdminClient({ categories, resources }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const [resourceDialog, setResourceDialog] = useState<{
    open: boolean
    resource: LibraryResource | null
  }>({ open: false, resource: null })
  const [categoryDialog, setCategoryDialog] = useState<{
    open: boolean
    category: LibraryCategory | null
  }>({ open: false, category: null })
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [deleting, setDeleting] = useState(false)

  const refresh = () => router.refresh()

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const url =
        pendingDelete.kind === "resource"
          ? `/api/library/resources/${pendingDelete.id}`
          : `/api/library/categories/${pendingDelete.id}`
      const res = await fetch(url, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "No se pudo borrar")
      toast({
        title: pendingDelete.kind === "resource" ? "Material borrado" : "Categoría borrada",
      })
      setPendingDelete(null)
      refresh()
    } catch (error) {
      toast({
        title: "No pudimos borrar",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/library" aria-label="Volver">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gestionar Biblioteca</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Cargá material y organizalo por categorías y destinatarios.
            </p>
          </div>
        </div>
        <Button
          className="gap-2"
          onClick={() => setResourceDialog({ open: true, resource: null })}
        >
          <Plus className="h-4 w-4" />
          Nuevo material
        </Button>
      </div>

      {/* Materiales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Materiales ({resources.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {resources.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Todavía no cargaste material. Usá “Nuevo material” para empezar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Dirigido a</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resources.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium max-w-[220px] truncate">
                        {r.title}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          {r.resource_type === "link" ? (
                            <>
                              <Link2 className="h-3 w-3" /> Enlace
                            </>
                          ) : (
                            <>
                              <FileText className="h-3 w-3" /> Archivo
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.category_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.target_roles.length === 0 ? (
                          <span className="text-muted-foreground">Todos</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.target_roles.map((role) => (
                              <Badge key={role} variant="secondary" className="text-[10px]">
                                {ROLE_LABELS[role] ?? role}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.published ? (
                          <Badge variant="secondary">Publicado</Badge>
                        ) : (
                          <Badge variant="outline">Borrador</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setResourceDialog({ open: true, resource: r })}
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setPendingDelete({ kind: "resource", id: r.id, label: r.title })
                          }
                          aria-label="Borrar"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Categorías */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Categorías ({categories.length})</CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setCategoryDialog({ open: true, category: null })}
          >
            <FolderPlus className="h-4 w-4" />
            Nueva categoría
          </Button>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No hay categorías.
            </p>
          ) : (
            <ul className="divide-y">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.resource_count ?? 0}{" "}
                      {(c.resource_count ?? 0) === 1 ? "recurso" : "recursos"}
                    </p>
                  </div>
                  <div className="whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setCategoryDialog({ open: true, category: c })}
                      aria-label="Editar categoría"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setPendingDelete({ kind: "category", id: c.id, label: c.name })
                      }
                      aria-label="Borrar categoría"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <ResourceUploadDialog
        open={resourceDialog.open}
        resource={resourceDialog.resource}
        categories={categories}
        onOpenChange={(open) => setResourceDialog((s) => ({ ...s, open }))}
        onSaved={refresh}
      />
      <CategoryFormDialog
        open={categoryDialog.open}
        category={categoryDialog.category}
        onOpenChange={(open) => setCategoryDialog((s) => ({ ...s, open }))}
        onSaved={refresh}
      />

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar “{pendingDelete?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.kind === "category"
                ? "Los materiales de esta categoría no se borran: quedan sin categoría."
                : "El material y su archivo se borrarán. Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
