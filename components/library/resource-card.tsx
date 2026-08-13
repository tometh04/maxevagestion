"use client"

import { FileText, ImageIcon, Video, LinkIcon, ExternalLink, Download } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { LibraryResource } from "@/lib/library/types"

function isVideo(r: LibraryResource) {
  return r.resource_type === "file" && (r.file_mime_type ?? "").startsWith("video/")
}
function isImage(r: LibraryResource) {
  return r.resource_type === "file" && (r.file_mime_type ?? "").startsWith("image/")
}
function isPdf(r: LibraryResource) {
  return r.resource_type === "file" && r.file_mime_type === "application/pdf"
}

/** Convierte una URL de YouTube a su forma embebible; null si no es YouTube. */
function youtubeEmbed(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname === "youtu.be") {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`
    }
    if (u.hostname.endsWith("youtube.com")) {
      const id = u.searchParams.get("v")
      if (id) return `https://www.youtube.com/embed/${id}`
      if (u.pathname.startsWith("/embed/")) return url
    }
  } catch {
    /* noop */
  }
  return null
}

function ResourceIcon({ resource }: { resource: LibraryResource }) {
  const cls = "h-5 w-5 text-primary"
  if (isVideo(resource)) return <Video className={cls} />
  if (isImage(resource)) return <ImageIcon className={cls} />
  if (isPdf(resource)) return <FileText className={cls} />
  if (resource.resource_type === "link") return <LinkIcon className={cls} />
  return <FileText className={cls} />
}

export function ResourceCard({ resource }: { resource: LibraryResource }) {
  const embed =
    resource.resource_type === "link" && resource.external_url
      ? youtubeEmbed(resource.external_url)
      : null
  const openUrl =
    resource.resource_type === "link" ? resource.external_url : resource.url

  return (
    <Card className="overflow-hidden">
      {/* Preview */}
      {isVideo(resource) && resource.url && (
        <video
          src={resource.url}
          controls
          preload="metadata"
          className="w-full aspect-video bg-black"
        />
      )}
      {embed && (
        <div className="aspect-video bg-black">
          <iframe
            src={embed}
            title={resource.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        </div>
      )}
      {isImage(resource) && resource.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resource.url}
          alt={resource.title}
          className="w-full aspect-video object-cover bg-muted"
        />
      )}

      <CardContent className="p-4 space-y-2">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ResourceIcon resource={resource} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{resource.title}</p>
            {resource.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {resource.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          {resource.category_name ? (
            <Badge variant="outline" className="text-[10px] shrink-0">
              {resource.category_name}
            </Badge>
          ) : (
            <span />
          )}

          {openUrl && !isVideo(resource) && !embed && (
            <Button
              size="sm"
              variant="secondary"
              className="gap-1.5"
              onClick={() => window.open(openUrl, "_blank", "noopener,noreferrer")}
            >
              {resource.resource_type === "link" ? (
                <>
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir enlace
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Abrir
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
