import "server-only"

import { createHash } from "node:crypto"
import { decryptSecret, encryptSecret } from "@/lib/integrations/secrets"

export interface AgencyEmiliaCredential {
  id: string
  orgId: string
  agencyId: string
  apiKey: string
  fingerprint: string
}

export class AgencyEmiliaCredentialError extends Error {
  constructor(
    public readonly code: "AGENCY_CREDENTIAL_MISSING" | "AGENCY_CREDENTIAL_INVALID",
    message: string
  ) {
    super(message)
    this.name = "AgencyEmiliaCredentialError"
  }
}

export function fingerprintEmiliaApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey.trim()).digest("hex")
}

export function encryptEmiliaApiKey(apiKey: string): {
  encrypted: string
  fingerprint: string
} {
  const normalized = apiKey.trim()
  if (!normalized) {
    throw new AgencyEmiliaCredentialError(
      "AGENCY_CREDENTIAL_INVALID",
      "La credencial de Emilia está vacía."
    )
  }
  return {
    encrypted: encryptSecret(normalized),
    fingerprint: fingerprintEmiliaApiKey(normalized),
  }
}

/**
 * Resuelve la única credencial permitida para la agencia. No existe fallback a
 * EMILIA_API_KEY: usar una key global atribuiría consumo y resultados al tenant
 * equivocado.
 */
export async function resolveAgencyEmiliaCredential(input: {
  admin: any
  orgId: string
  agencyId: string
}): Promise<AgencyEmiliaCredential> {
  const { data, error } = await input.admin
    .from("agency_emilia_credentials")
    .select("id, org_id, agency_id, api_key_encrypted, key_fingerprint, status")
    .eq("org_id", input.orgId)
    .eq("agency_id", input.agencyId)
    .eq("status", "ACTIVE")
    .maybeSingle()

  if (error) {
    throw new AgencyEmiliaCredentialError(
      "AGENCY_CREDENTIAL_INVALID",
      "No se pudo resolver la credencial de Emilia de la agencia."
    )
  }
  if (!data) {
    throw new AgencyEmiliaCredentialError(
      "AGENCY_CREDENTIAL_MISSING",
      "La agencia no tiene una credencial activa de Emilia."
    )
  }

  let apiKey: string
  try {
    apiKey = decryptSecret(String(data.api_key_encrypted || "")).trim()
  } catch {
    throw new AgencyEmiliaCredentialError(
      "AGENCY_CREDENTIAL_INVALID",
      "La credencial de Emilia de la agencia no se puede leer."
    )
  }

  if (!apiKey || fingerprintEmiliaApiKey(apiKey) !== data.key_fingerprint) {
    throw new AgencyEmiliaCredentialError(
      "AGENCY_CREDENTIAL_INVALID",
      "La credencial de Emilia de la agencia no es válida."
    )
  }

  return {
    id: data.id,
    orgId: data.org_id,
    agencyId: data.agency_id,
    apiKey,
    fingerprint: data.key_fingerprint,
  }
}

export async function setAgencyEmiliaCredential(input: {
  admin: any
  orgId: string
  agencyId: string
  actorId: string
  apiKey: string
}): Promise<{ id: string; fingerprint: string }> {
  const [{ data: agency }, { data: actor }] = await Promise.all([
    input.admin
      .from("agencies")
      .select("id")
      .eq("id", input.agencyId)
      .eq("org_id", input.orgId)
      .maybeSingle(),
    input.admin
      .from("users")
      .select("id")
      .eq("id", input.actorId)
      .eq("org_id", input.orgId)
      .eq("is_active", true)
      .maybeSingle(),
  ])
  if (!agency || !actor) {
    throw new AgencyEmiliaCredentialError(
      "AGENCY_CREDENTIAL_INVALID",
      "No se puede asignar la credencial fuera de la organización indicada."
    )
  }

  const secret = encryptEmiliaApiKey(input.apiKey)
  const { data, error } = await input.admin
    .from("agency_emilia_credentials")
    .upsert({
      org_id: input.orgId,
      agency_id: input.agencyId,
      api_key_encrypted: secret.encrypted,
      key_fingerprint: secret.fingerprint,
      status: "ACTIVE",
      created_by: input.actorId,
      rotated_by: input.actorId,
    }, { onConflict: "org_id,agency_id" })
    .select("id, key_fingerprint")
    .single()
  if (error || !data) {
    throw new AgencyEmiliaCredentialError(
      "AGENCY_CREDENTIAL_INVALID",
      "No se pudo asignar la credencial de Emilia a la agencia."
    )
  }
  return { id: data.id, fingerprint: data.key_fingerprint }
}
