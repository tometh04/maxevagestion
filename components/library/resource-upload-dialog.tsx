"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Upload, Link2, UploadCloud, FileText, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import {
  LIBRARY_BUCKET,
  LIBRARY_MIME_EXTENSIONS,
  LIBRARY_TARGET_ROLES,
  type LibraryCategory,
  type LibraryResource,
} from "@/lib/library/types"

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  CONTABLE: "Contable",
  SELLER: "Vendedor",
  VIEWER: "Solo lectura",
  POST_VENTA: "Post venta",
}

const ACCEPT = Object.keys(LIBRARY_MIME_EXTENSIONS).join(",")

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: LibraryCategory[]
  onSaved: () => void
  /** Si se pasa, el diálogo edita metadatos (no el archivo). */
  resource?: LibraryResource | null
}

async function fetchJson(url: string, method: string, body: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || "Ocurrió un error")
  return data
}

export function ResourceUploadDialog({
  open,
  onOpenChange,
  categories,
  onSaved,
  resource,
}: Props) {
  const { toast } = useToast()
  const isEdit = Boolean(resource)

  const [kind, setKind] = useState<"file" | "link">("file")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [categoryId, setCategoryId] = useState<string>("none")
  const [targetRoles, setTargetRoles] = useState<string[]>([])
  const [published, setPublished] = useState(true)
  const [externalUrl, setExternalUrl] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset / precarga al abrir.
  useEffect(() => {
    if (!open) return
    if (resource) {
      setKind(resource.resource_type)
      setTitle(resource.title)
      setDescription(resource.description ?? "")
      setCategoryId(resource.category_id ?? "none")
      setTargetRoles(resource.target_roles ?? [])
      setPublished(resource.published)
      setExternalUrl(resource.external_url ?? "")
    } else {
      setKind("file")
      setTitle("")
      setDescription("")
      setCategoryId("none")
      setTargetRoles([])
      setPublished(true)
      setExternalUrl("")
    }
    setFile(null)
  }, [open, resource])

  function toggleRole(role: string) {
    setTargetRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    )
  }

  function acceptFile(f: File | null | undefined) {
    if (!f) return
    if (!LIBRARY_MIME_EXTENSIONS[f.type]) {
      toast({
        title: "Tipo de archivo no permitido",
        description: "Se aceptan PDF, imágenes (PNG/JPG/WebP) y videos (MP4/WebM/MOV).",
        variant: "destructive",
      })
      return
    }
    setFile(f)
  }

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    acceptFile(e.target.files?.[0])
    // permite volver a elegir el mismo archivo tras limpiarlo
    e.target.value = ""
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    acceptFile(e.dataTransfer.files?.[0])
  }

  async function handleSubmit() {
    if (title.trim().length < 2) {
      toast({ title: "Poné un título", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const meta = {
        title: title.trim(),
        description: description.trim() || null,
        categoryId: categoryId === "none" ? null : categoryId,
        targetRoles,
        published,
      }

      if (isEdit && resource) {
        await fetchJson(`/api/library/resources/${resource.id}`, "PATCH", meta)
      } else if (kind === "link") {
        await fetchJson("/api/library/resources", "POST", {
          resource_type: "link",
          externalUrl: externalUrl.trim(),
          ...meta,
        })
      } else {
        if (!file) throw new Error("Elegí un archivo")
        // 1) pedir signed upload URL
        const target = await fetchJson("/api/library/resources/upload-url", "POST", {
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
        })
        // 2) subir directo al storage
        const up = await supabase.storage
          .from(LIBRARY_BUCKET)
          .uploadToSignedUrl(target.path, target.token, file, {
            contentType: file.type || undefined,
          })
        if (up.error) throw new Error(up.error.message)
        // 3) confirmar registrando el recurso
        await fetchJson("/api/library/resources", "POST", {
          resource_type: "file",
          storagePath: target.path,
          fileMimeType: file.type,
          fileSize: file.size,
          originalFileName: file.name,
          ...meta,
        })
      }

      toast({ title: isEdit ? "Material actualizado" : "Material agregado" })
      onSaved()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: "No pudimos guardar el material",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar material" : "Nuevo material"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Actualizá los datos del material."
              : "Subí un archivo (PDF, imagen o video) o pegá un enlace."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Toggle tipo (solo al crear) */}
          {!isEdit && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={kind === "file" ? "default" : "outline"}
                className="gap-2"
                onClick={() => setKind("file")}
              >
                <Upload className="h-4 w-4" /> Archivo
              </Button>
              <Button
                type="button"
                variant={kind === "link" ? "default" : "outline"}
                className="gap-2"
                onClick={() => setKind("link")}
              >
                <Link2 className="h-4 w-4" /> Enlace
              </Button>
            </div>
          )}

          {/* Archivo / Enlace */}
          {!isEdit && kind === "file" && (
            <div className="space-y-1.5">
              <Label>Archivo</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                onChange={onFileSelect}
                className="sr-only"
              />
              {!file ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragActive(true)
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={onDrop}
                  className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
                    dragActive
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-accent/50"
                  }`}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                    <UploadCloud className="h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      Arrastrá un archivo o{" "}
                      <span className="text-primary underline underline-offset-2">
                        hacé clic para elegir
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF, imagen o video · hasta 500 MB
                    </p>
                  </div>
                </button>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Cambiar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setFile(null)}
                      aria-label="Quitar archivo"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {!isEdit && kind === "link" && (
            <div className="space-y-1.5">
              <Label htmlFor="lib-url">Enlace</Label>
              <Input
                id="lib-url"
                placeholder="https://..."
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
              />
            </div>
          )}

          {/* Título */}
          <div className="space-y-1.5">
            <Label htmlFor="lib-title">Título</Label>
            <Input
              id="lib-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Manual de ventas 2026"
            />
          </div>

          {/* Descripción */}
          <div className="space-y-1.5">
            <Label htmlFor="lib-desc">Descripción (opcional)</Label>
            <Textarea
              id="lib-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Categoría */}
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin categoría</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Destinatarios */}
          <div className="space-y-2">
            <Label>Dirigido a</Label>
            <p className="text-xs text-muted-foreground">
              {targetRoles.length === 0
                ? "Sin seleccionar = visible para todos."
                : "Solo los roles marcados lo verán."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {LIBRARY_TARGET_ROLES.map((role) => (
                <label
                  key={role}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={targetRoles.includes(role)}
                    onCheckedChange={() => toggleRole(role)}
                  />
                  {ROLE_LABELS[role] ?? role}
                </label>
              ))}
            </div>
          </div>

          {/* Publicado */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Publicado</Label>
              <p className="text-xs text-muted-foreground">
                Si está apagado, nadie lo ve hasta publicarlo.
              </p>
            </div>
            <Switch checked={published} onCheckedChange={setPublished} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
