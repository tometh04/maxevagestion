import { z } from "zod"
import {
  QUOTATION_BLOCK_KINDS,
  QUOTATION_DOCUMENT_SCHEMA_VERSION,
  type QuotationModelManifestV1,
} from "@/lib/quotation-documents/types"

const optionalShortText = z.string().trim().max(500).optional()
const optionalLongText = z.string().trim().max(20_000).optional()
const safeList = z.array(z.string().trim().min(1).max(4_000)).max(100).default([])

export const quotationPresentationContentSchema = z.object({
  schemaVersion: z.literal(QUOTATION_DOCUMENT_SCHEMA_VERSION).default(QUOTATION_DOCUMENT_SCHEMA_VERSION),
  title: z.string().trim().max(240).optional(),
  customer: z.object({
    displayName: z.string().trim().max(160).optional(),
    email: z.string().trim().email().max(320).optional().or(z.literal("")),
    phone: z.string().trim().max(80).optional(),
  }).default({}),
  overview: optionalLongText,
  inclusions: safeList,
  exclusions: safeList,
  itinerary: z.array(z.object({
    day: z.coerce.number().int().min(1).max(365),
    date: z.string().trim().max(40).optional(),
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().min(1).max(20_000),
  })).max(365).default([]),
  recommendations: safeList,
  restrictions: safeList,
  depositAmount: z.coerce.number().finite().nonnegative().optional(),
  balanceDueDate: z.string().trim().max(40).optional(),
  paymentSchedule: z.array(z.object({
    label: z.string().trim().min(1).max(160),
    amount: z.coerce.number().finite().nonnegative().optional(),
    dueDate: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(1_000).optional(),
  })).max(24).default([]),
  advisorPhone: optionalShortText,
}).strict()

export type QuotationPresentationContent = z.infer<typeof quotationPresentationContentSchema>

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Debe ser un color hexadecimal")
const internalAssetPathSchema = z.string()
  .max(500)
  .regex(/^\/[A-Za-z0-9/_\-.]+$/, "El asset debe ser una ruta interna segura")

export const quotationModelManifestSchema = z.object({
  schemaVersion: z.literal(QUOTATION_DOCUMENT_SCHEMA_VERSION),
  documentKind: z.literal("quotation"),
  layoutKey: z.string().regex(/^[a-z0-9][a-z0-9-]{2,80}$/),
  layoutVersion: z.number().int().positive(),
  locale: z.literal("es-AR"),
  theme: z.object({
    primaryColor: hexColorSchema,
    secondaryColor: hexColorSchema,
    accentColor: hexColorSchema,
    paperColor: hexColorSchema,
    textColor: hexColorSchema,
    fontFamily: z.enum(["OPEN_SANS", "INTER", "SYSTEM"]),
  }).strict(),
  assets: z.object({
    backgroundPath: internalAssetPathSchema.optional(),
    logoPath: internalAssetPathSchema.optional(),
  }).strict(),
  branding: z.object({
    displayName: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(80).optional(),
    email: z.string().trim().email().max(320).optional().or(z.literal("")),
    website: z.string().trim().url().max(500).optional().or(z.literal("")),
    instagram: z.string().trim().max(160).optional(),
    address: z.string().trim().max(500).optional(),
    legalName: z.string().trim().max(240).optional(),
    taxId: z.string().trim().max(80).optional(),
    travelLicense: z.string().trim().max(80).optional(),
  }).strict(),
  copy: z.object({
    documentTitle: z.string().trim().min(1).max(160),
    availabilityNote: z.string().trim().min(1).max(1_000),
    priceDisclaimer: z.string().trim().max(1_000).optional(),
  }).strict(),
  blocks: z.array(z.object({
    kind: z.enum(QUOTATION_BLOCK_KINDS),
    visible: z.boolean(),
    emptyPolicy: z.enum(["hide", "placeholder", "reject"]),
    pageBreakBefore: z.boolean().optional(),
  }).strict()).min(1).max(40),
}).strict()

export function parseQuotationModelManifest(value: unknown): QuotationModelManifestV1 {
  return quotationModelManifestSchema.parse(value) as QuotationModelManifestV1
}

export function parseQuotationPresentationContent(value: unknown): QuotationPresentationContent {
  const candidate = value && typeof value === "object" ? value : {}
  return quotationPresentationContentSchema.parse(candidate)
}
