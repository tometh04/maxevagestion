import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"
import type { Json } from "@/lib/supabase/types"
import {
  campaignConceptsOutputSchema,
  channelAdaptationsSchema,
  type CampaignConcept,
  type CampaignConceptsOutput,
  type ChannelAdaptations,
} from "@/lib/growth-studio/campaign-schema"

export const GROWTH_STUDIO_CONCEPTS_PROMPT_VERSION = "concepts.v1"
export const GROWTH_STUDIO_CHANNELS_PROMPT_VERSION = "channels.v1"
export const GROWTH_STUDIO_IMAGE_PROMPT_VERSION = "image.v1"

export type GrowthStudioImageQuality = "low" | "medium" | "high"
export type GrowthStudioImageFormat = "instagram_feed" | "instagram_story"

export interface TextGenerationResult<T> {
  output: T
  usage: Json | null
}

export interface ImageGenerationResult {
  bytes: Uint8Array
  mimeType: "image/png"
  width: number
  height: number
  usage: Json | null
}

export interface GrowthStudioAiProvider {
  readonly textModel: string
  readonly imageModel: string
  generateConcepts(input: Json): Promise<TextGenerationResult<CampaignConceptsOutput>>
  generateChannels(input: Json): Promise<TextGenerationResult<ChannelAdaptations>>
  generateImage(input: {
    visualDirection: string
    format: GrowthStudioImageFormat
    quality: GrowthStudioImageQuality
    brandVisualContext: Json
  }): Promise<ImageGenerationResult>
}

export class GrowthStudioAiConfigurationError extends Error {
  constructor() {
    super("La generación con IA no está configurada")
    this.name = "GrowthStudioAiConfigurationError"
  }
}

export class GrowthStudioAiProviderError extends Error {
  constructor(message = "No se pudo generar el contenido") {
    super(message)
    this.name = "GrowthStudioAiProviderError"
  }
}

function serializeUsage(value: unknown): Json | null {
  if (!value) return null
  return JSON.parse(JSON.stringify(value)) as Json
}

const CONCEPTS_INSTRUCTIONS = `
Sos estratega de marketing para una agencia de viajes.
Generá exactamente tres conceptos de campaña realmente distintos entre sí.
Respetá el perfil de marca y los datos comerciales recibidos.
No inventes precios, fechas, condiciones ni beneficios.
No incluyas datos personales aunque aparecieran accidentalmente en el input.
No menciones herramientas, proveedores técnicos ni Vibook.
Respondé únicamente con el contrato estructurado solicitado, en español natural de Argentina.
`.trim()

const CHANNELS_INSTRUCTIONS = `
Sos copywriter de una agencia de viajes.
Adaptá únicamente el concepto seleccionado a los canales solicitados.
Los canales no solicitados deben ser null.
Para Stories respetá exactamente la cantidad y el orden de pantallas indicados.
No inventes precios, fechas, condiciones ni beneficios.
No incluyas datos personales ni menciones herramientas, proveedores técnicos o Vibook.
Respondé únicamente con el contrato estructurado solicitado, en español natural de Argentina.
`.trim()

export function createOpenAIGrowthStudioProvider(): GrowthStudioAiProvider {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new GrowthStudioAiConfigurationError()

  const client = new OpenAI({ apiKey })
  const textModel =
    process.env.GROWTH_STUDIO_TEXT_MODEL?.trim() || "gpt-5.6-terra"
  const imageModel =
    process.env.GROWTH_STUDIO_IMAGE_MODEL?.trim() || "gpt-image-2"

  return {
    textModel,
    imageModel,

    async generateConcepts(input) {
      try {
        const response = await client.responses.parse({
          model: textModel,
          instructions: CONCEPTS_INSTRUCTIONS,
          input: JSON.stringify(input),
          text: {
            format: zodTextFormat(
              campaignConceptsOutputSchema,
              "growth_campaign_concepts"
            ),
          },
          reasoning: { effort: "low" },
          store: false,
        })
        if (!response.output_parsed) throw new GrowthStudioAiProviderError()
        return {
          output: campaignConceptsOutputSchema.parse(response.output_parsed),
          usage: serializeUsage(response.usage),
        }
      } catch (error) {
        if (error instanceof GrowthStudioAiProviderError) throw error
        console.error("[growth-studio-ai] Falló la generación de conceptos", {
          model: textModel,
          cause: error instanceof Error ? error.message : "unknown",
        })
        throw new GrowthStudioAiProviderError()
      }
    },

    async generateChannels(input) {
      try {
        const response = await client.responses.parse({
          model: textModel,
          instructions: CHANNELS_INSTRUCTIONS,
          input: JSON.stringify(input),
          text: {
            format: zodTextFormat(
              channelAdaptationsSchema,
              "growth_channel_adaptations"
            ),
          },
          reasoning: { effort: "low" },
          store: false,
        })
        if (!response.output_parsed) throw new GrowthStudioAiProviderError()
        return {
          output: channelAdaptationsSchema.parse(response.output_parsed),
          usage: serializeUsage(response.usage),
        }
      } catch (error) {
        if (error instanceof GrowthStudioAiProviderError) throw error
        console.error("[growth-studio-ai] Falló la adaptación por canal", {
          model: textModel,
          cause: error instanceof Error ? error.message : "unknown",
        })
        throw new GrowthStudioAiProviderError()
      }
    },

    async generateImage(input) {
      const size =
        input.format === "instagram_feed" ? "1024x1024" : "1024x1536"
      const prompt = [
        "Creá una fotografía publicitaria premium para una agencia de viajes.",
        input.visualDirection,
        `Contexto visual de marca: ${JSON.stringify(input.brandVisualContext)}.`,
        "Dejá espacio negativo suficiente para superponer título, texto y CTA.",
        "No agregues palabras, letras, números, logos, marcas de agua ni marcos.",
      ].join("\n")

      try {
        const response = await client.images.generate({
          model: imageModel,
          prompt,
          size,
          quality: input.quality,
          n: 1,
        })
        const base64 = response.data?.[0]?.b64_json
        if (!base64) {
          throw new GrowthStudioAiProviderError("La imagen no pudo procesarse")
        }
        return {
          bytes: Buffer.from(base64, "base64"),
          mimeType: "image/png",
          width: 1024,
          height: input.format === "instagram_feed" ? 1024 : 1536,
          usage: null,
        }
      } catch (error) {
        if (error instanceof GrowthStudioAiProviderError) throw error
        console.error("[growth-studio-ai] Falló la generación de imagen", {
          model: imageModel,
          quality: input.quality,
          format: input.format,
          cause: error instanceof Error ? error.message : "unknown",
        })
        throw new GrowthStudioAiProviderError("No se pudo generar la imagen")
      }
    },
  }
}

export function findConcept(
  concepts: CampaignConceptsOutput,
  index: number
): CampaignConcept | null {
  return concepts.variants.find((variant) => variant.index === index) ?? null
}

