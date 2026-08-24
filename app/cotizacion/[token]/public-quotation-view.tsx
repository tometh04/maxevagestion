"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { type QuotationPresentationData } from "@/lib/quotations/presentation"
import {
  downloadQuotationDocumentHtml,
  fetchQuotationDocumentForPublic,
  type QuotationDocumentPayload,
} from "@/lib/quotation-documents/client"
import { waitForQuotationDocumentFonts } from "@/lib/quotation-documents/fonts-client"
import {
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
  const [documentData, setDocumentData] = useState<QuotationDocumentPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const didTriggerPrintRef = useRef(false)

  useEffect(() => {
    async function load() {
      try {
        const document = await fetchQuotationDocumentForPublic(token)

        if (!document.presentation) throw new Error("El documento no contiene su presentación pública")
        setData(document.presentation)
        setDocumentData(document)
        setBranding(document.branding || {})
      } catch {
        setError("Error al cargar la cotizacion")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [token])

  useEffect(() => {
    if (!data || !documentData || typeof document === "undefined") {
      return
    }

    document.title = mode === "print"
      ? documentData.filename
      : `${data.quotation_number} - Cotizacion`
  }, [data, documentData, mode])

  useEffect(() => {
    if (mode !== "print" || !data || !documentData || error || didTriggerPrintRef.current) {
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
      await waitForQuotationDocumentFonts(
        document,
        document.querySelector(".quote-doc-print") || document.documentElement
      )
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })

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
  }, [data, documentData, error, mode])

  async function handleAccept(optionId: string) {
    setAccepting(true)
    try {
      const res = await fetch(`/api/public/quotations/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          option_id: optionId,
          issued_document_id: documentData?.issuedDocumentId,
          content_hash: documentData?.contentHash,
        }),
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
      if (!documentData) throw new Error("Documento no disponible")
      await downloadQuotationDocumentHtml(documentData)
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

  if (error || !data || !documentData) {
    return <PublicQuotationError mode={mode} message={error || "No se encontro la cotizacion solicitada."} />
  }

  return (
    <PublicQuotationHtmlDocument
      mode={mode}
      data={data}
      branding={branding}
      html={documentData.html}
      acceptanceEnabled={documentData.acceptanceEnabled !== false && Boolean(documentData.issuedDocumentId)}
      accepting={accepting}
      downloading={downloading}
      onAccept={handleAccept}
      onDownload={handleDownload}
    />
  )
}
