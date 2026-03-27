"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Palette, Image, Building2, Upload, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

// ---------------------------------------------------------------------------
// Color options
// ---------------------------------------------------------------------------
const COLOR_OPTIONS = [
  { name: "Indigo", hex: "#6366f1", hsl: "239 84% 67%" },
  { name: "Blue", hex: "#3b82f6", hsl: "217 91% 60%" },
  { name: "Emerald", hex: "#10b981", hsl: "160 84% 39%" },
  { name: "Violet", hex: "#8b5cf6", hsl: "258 90% 66%" },
  { name: "Rose", hex: "#f43f5e", hsl: "347 77% 50%" },
  { name: "Amber", hex: "#f59e0b", hsl: "38 92% 50%" },
  { name: "Teal", hex: "#14b8a6", hsl: "168 76% 42%" },
  { name: "Slate", hex: "#64748b", hsl: "215 16% 47%" },
] as const

// ---------------------------------------------------------------------------
// Helper: save setting (API with localStorage fallback)
// ---------------------------------------------------------------------------
async function saveSetting(key: string, value: string) {
  // Always save to localStorage for immediate access
  localStorage.setItem(key, value)

  try {
    const res = await fetch("/api/settings/organization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    })
    if (!res.ok) throw new Error("API error")
  } catch {
    // API failed — localStorage fallback is already saved
    console.warn(`Failed to save ${key} to API, using localStorage fallback`)
  }
}

async function loadSetting(key: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/settings/organization?key=${key}`)
    if (res.ok) {
      const json = await res.json()
      if (json.data && json.data.length > 0) {
        const value = json.data[0].value
        localStorage.setItem(key, value)
        return value
      }
    }
  } catch {
    // API failed — fall back to localStorage
  }
  return localStorage.getItem(key)
}

async function loadAllSettings(): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  try {
    const res = await fetch("/api/settings/organization")
    if (res.ok) {
      const json = await res.json()
      if (json.data) {
        for (const row of json.data) {
          result[row.key] = row.value
          localStorage.setItem(row.key, row.value)
        }
      }
      return result
    }
  } catch {
    // fall back to localStorage
  }

  // Fallback: read known keys from localStorage
  const keys = [
    "brand_color",
    "brand_logo",
    "company_name",
    "address",
    "phone",
    "email",
    "website",
    "tax_id",
  ]
  for (const k of keys) {
    const v = localStorage.getItem(k)
    if (v) result[k] = v
  }
  return result
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function InterfaceSettings() {
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [companyData, setCompanyData] = useState({
    company_name: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    tax_id: "",
  })
  const [savingCompany, setSavingCompany] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load all settings on mount
  useEffect(() => {
    loadAllSettings().then((settings) => {
      if (settings.brand_color) setSelectedColor(settings.brand_color)
      if (settings.brand_logo) setLogoUrl(settings.brand_logo)
      setCompanyData((prev) => ({
        ...prev,
        company_name: settings.company_name || "",
        address: settings.address || "",
        phone: settings.phone || "",
        email: settings.email || "",
        website: settings.website || "",
        tax_id: settings.tax_id || "",
      }))
    })
  }, [])

  // --- Color picker handler ---
  const handleColorSelect = useCallback(async (hsl: string, hex: string) => {
    setSelectedColor(hsl)
    document.documentElement.style.setProperty("--primary", hsl)
    await saveSetting("brand_color", hsl)
    toast.success("Color principal actualizado")
  }, [])

  // --- Logo upload handler ---
  const handleLogoUpload = useCallback(async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("El archivo no puede superar 2MB")
      return
    }
    const validTypes = ["image/png", "image/svg+xml", "image/webp"]
    if (!validTypes.includes(file.type)) {
      toast.error("Solo se permiten archivos PNG, SVG o WEBP")
      return
    }

    setUploading(true)
    try {
      // Upload to Supabase Storage via a simple approach:
      // Create a FormData and use the existing upload pattern
      const formData = new FormData()
      formData.append("file", file)

      // Try uploading via API — if no bucket route exists, use a data URL fallback
      try {
        const ext = file.name.split(".").pop() || "png"
        const fileName = `brand-logo-${Date.now()}.${ext}`

        // Use supabase client-side upload
        const { supabase } = await import("@/lib/supabase/client")

        const { data, error } = await supabase.storage
          .from("documents")
          .upload(`logos/${fileName}`, file, {
            cacheControl: "3600",
            upsert: true,
          })

        if (error) throw error

        const { data: urlData } = supabase.storage
          .from("documents")
          .getPublicUrl(`logos/${fileName}`)

        const publicUrl = urlData.publicUrl
        setLogoUrl(publicUrl)
        await saveSetting("brand_logo", publicUrl)
        toast.success("Logo actualizado correctamente")
      } catch (storageError) {
        // Fallback: convert to data URL and store in localStorage
        console.warn("Storage upload failed, using data URL fallback:", storageError)
        const reader = new FileReader()
        reader.onload = async (e) => {
          const dataUrl = e.target?.result as string
          setLogoUrl(dataUrl)
          await saveSetting("brand_logo", dataUrl)
          toast.success("Logo guardado localmente")
        }
        reader.readAsDataURL(file)
      }
    } catch (err) {
      toast.error("Error al subir el logo")
      console.error(err)
    } finally {
      setUploading(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) handleLogoUpload(file)
    },
    [handleLogoUpload]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleLogoUpload(file)
    },
    [handleLogoUpload]
  )

  // --- Company data handler ---
  const handleSaveCompanyData = useCallback(async () => {
    setSavingCompany(true)
    try {
      const entries = Object.entries(companyData)
      await Promise.all(entries.map(([key, value]) => saveSetting(key, value)))
      toast.success("Datos de la empresa guardados")
    } catch {
      toast.error("Error al guardar los datos")
    } finally {
      setSavingCompany(false)
    }
  }, [companyData])

  return (
    <div className="space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* Sub-card 1: Color Principal */}
      {/* ----------------------------------------------------------------- */}
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
            <Palette className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">
            Color Principal
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          {COLOR_OPTIONS.map((color) => (
            <button
              key={color.name}
              type="button"
              title={color.name}
              onClick={() => handleColorSelect(color.hsl, color.hex)}
              className={`h-10 w-10 rounded-full transition-all ${
                selectedColor === color.hsl
                  ? "ring-2 ring-offset-2 ring-offset-background ring-primary"
                  : "hover:scale-110"
              }`}
              style={{ backgroundColor: color.hex }}
            />
          ))}
        </div>

        {/* Preview */}
        <div className="flex items-center gap-3 pt-2">
          <span className="text-xs text-muted-foreground">Vista previa:</span>
          <button
            type="button"
            className="rounded-md px-4 py-1.5 text-xs font-medium text-primary-foreground"
            style={{
              backgroundColor: selectedColor
                ? `hsl(${selectedColor})`
                : "hsl(var(--primary))",
            }}
          >
            Botón de ejemplo
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Sub-card 2: Logo de la Empresa */}
      {/* ----------------------------------------------------------------- */}
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10">
            <Image className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">
            Logo de la Empresa
          </span>
        </div>

        {/* Current logo preview */}
        {logoUrl && (
          <div className="relative inline-block rounded-lg bg-zinc-900 p-4">
            <img
              src={logoUrl}
              alt="Logo de la empresa"
              className="h-12 w-auto object-contain"
            />
            <button
              type="button"
              onClick={async () => {
                setLogoUrl(null)
                await saveSetting("brand_logo", "")
                toast.success("Logo eliminado")
              }}
              className="absolute -right-2 -top-2 rounded-full bg-destructive p-0.5 text-destructive-foreground hover:bg-destructive/80"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Upload area */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/60 bg-background/50 p-8 transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <Upload className="h-8 w-8 text-muted-foreground/60" />
          <span className="text-sm text-muted-foreground">
            {uploading
              ? "Subiendo..."
              : "Arrastrá o hacé click para subir tu logo"}
          </span>
          <span className="text-[11px] text-muted-foreground/60">
            PNG, SVG o WEBP — Max 2MB
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.svg,.webp,image/png,image/svg+xml,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <p className="text-xs text-muted-foreground/70">
          Recomendamos un logo con fondo transparente en formato PNG o SVG
        </p>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Sub-card 3: Datos de la Empresa */}
      {/* ----------------------------------------------------------------- */}
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/10">
            <Building2 className="h-3.5 w-3.5 text-violet-500" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">
            Datos de la Empresa
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="company_name" className="text-xs">
              Nombre de la Empresa
            </Label>
            <Input
              id="company_name"
              value={companyData.company_name}
              onChange={(e) =>
                setCompanyData((d) => ({ ...d, company_name: e.target.value }))
              }
              placeholder="Mi Empresa S.A."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tax_id" className="text-xs">
              CUIT
            </Label>
            <Input
              id="tax_id"
              value={companyData.tax_id}
              onChange={(e) =>
                setCompanyData((d) => ({ ...d, tax_id: e.target.value }))
              }
              placeholder="30-12345678-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address" className="text-xs">
              Direccion
            </Label>
            <Input
              id="address"
              value={companyData.address}
              onChange={(e) =>
                setCompanyData((d) => ({ ...d, address: e.target.value }))
              }
              placeholder="Calle 123, Ciudad"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-xs">
              Telefono
            </Label>
            <Input
              id="phone"
              value={companyData.phone}
              onChange={(e) =>
                setCompanyData((d) => ({ ...d, phone: e.target.value }))
              }
              placeholder="+54 341 1234567"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comp_email" className="text-xs">
              Email
            </Label>
            <Input
              id="comp_email"
              type="email"
              value={companyData.email}
              onChange={(e) =>
                setCompanyData((d) => ({ ...d, email: e.target.value }))
              }
              placeholder="info@miempresa.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="website" className="text-xs">
              Sitio Web
            </Label>
            <Input
              id="website"
              value={companyData.website}
              onChange={(e) =>
                setCompanyData((d) => ({ ...d, website: e.target.value }))
              }
              placeholder="https://miempresa.com"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSaveCompanyData} disabled={savingCompany}>
            {savingCompany ? "Guardando..." : "Guardar Datos"}
          </Button>
        </div>
      </div>
    </div>
  )
}
