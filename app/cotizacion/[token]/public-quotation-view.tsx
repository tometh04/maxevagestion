"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { type QuotationPresentationData } from "@/lib/quotations/presentation"
import { getPublicQuotationPdfPath } from "@/lib/quotations/public-links"
import {
  downloadQuotationHtmlPDF,
  isHtmlQuotePdfEligible,
  type OrganizationBrandingSettings,
} from "@/lib/pdf/quotation-pdf-html"
import {
  PublicQuotationDocument,
  PublicQuotationError,
  PublicQuotationLoading,
  type PublicQuotationBranding,
  type PublicQuotationViewMode,
} from "./public-quotation-document"
import { PublicQuotationHtmlDocument } from "./public-quotation-html-document"
import { toast } from "sonner"

export function PublicQuotationView({
  mode = "interactive",
}: {
  mode?: PublicQuotationViewMode
}) {
  const params = useParams()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<QuotationPresentationData | null>(null)
  const [branding, setBranding] = useState<PublicQuotationBranding>({})
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const didTriggerPrintRef = useRef(false)

  useEffect(() => {
    async function load() {
      try {
        const [quotRes, brandRes] = await Promise.all([
          fetch(`/api/public/quotations/${token}`, { cache: "no-store" }),
          fetch(`/api/public/branding?token=${token}`, { cache: "no-store" }),
        ])

        if (!quotRes.ok) {
          setError("Cotizacion no encontrada")
          return
        }

        const quotationJson = await quotRes.json()
        setData(quotationJson.data)

        if (brandRes.ok) {
          const brandJson = await brandRes.json()
          setBranding(brandJson.data || {})
        }
      } catch {
        setError("Error al cargar la cotizacion")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [token])

  useEffect(() => {
    if (!data || typeof document === "undefined") {
      return
    }

    document.title = mode === "print"
      ? `${data.quotation_number}.pdf`
      : `${data.quotation_number} - Cotizacion`
  }, [data, mode])

  useEffect(() => {
    if (mode !== "print" || !data || error || didTriggerPrintRef.current) {
      return
    }

    let cancelled = false

    const printWhenReady = async () => {
      const images = Array.from(document.images)
      await Promise.all(images.map((img) => {
        if (img.complete) {
          return Promise.resolve()
        }

        return new Promise<void>((resolve) => {
          const done = () => resolve()
          img.addEventListener("load", done, { once: true })
          img.addEventListener("error", done, { once: true })
        })
      }))

      if (cancelled) {
        return
      }

      didTriggerPrintRef.current = true
      window.print()
    }

    const timeoutId = window.setTimeout(() => {
      void printWhenReady()
    }, 150)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [data, error, mode])

  async function handleAccept(optionId: string) {
    setAccepting(true)
    try {
      const res = await fetch(`/api/public/quotations/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option_id: optionId }),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || "Error al aceptar")
        return
      }

      setData((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          status: "APPROVED",
          options: current.options.map((option) => ({
            ...option,
            is_selected: option.id === optionId,
          })),
        }
      })
    } catch {
      toast.error("Error de conexion")
    } finally {
      setAccepting(false)
    }
  }

  async function handleDownload() {
    if (!token || typeof window === "undefined") {
      return
    }

    setDownloading(true)
    try {
      // Vuelos/hoteles: PDF con el diseño nuevo y el branding de la agencia
      // (el branding ya viene de /api/public/branding, sin auth).
      if (data && isHtmlQuotePdfEligible(data)) {
        await downloadQuotationHtmlPDF(data, branding as OrganizationBrandingSettings)
        return
      }

      // Resto de cotizaciones: vista print preexistente.
      const pdfPath = getPublicQuotationPdfPath(token)
      const openedWindow = window.open(pdfPath, "_blank", "noopener,noreferrer")
      if (!openedWindow) {
        window.location.assign(pdfPath)
      }
    } catch (err) {
      console.error("Error descargando PDF:", err)
      toast.error("Error al descargar PDF")
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return <PublicQuotationLoading mode={mode} />
  }

  if (error || !data) {
    return <PublicQuotationError mode={mode} message={error || "No se encontro la cotizacion solicitada."} />
  }

  // Vuelos/hoteles: mismo diseño que el PDF nuevo, embebido en la página.
  // El resto (paquetes, excursiones, etc.) sigue con el documento clásico.
  if (isHtmlQuotePdfEligible(data)) {
    return (
      <PublicQuotationHtmlDocument
        mode={mode}
        data={data}
        branding={branding}
        accepting={accepting}
        downloading={downloading}
        onAccept={handleAccept}
        onDownload={handleDownload}
      />
    )
  }

  return (
    <PublicQuotationDocument
      mode={mode}
      data={data}
      branding={branding}
      accepting={accepting}
      downloading={downloading}
      onAccept={handleAccept}
      onDownload={handleDownload}
    />
  )
}
