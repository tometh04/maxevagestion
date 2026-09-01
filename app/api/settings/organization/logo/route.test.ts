/** @jest-environment node */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}))

import { createClient } from "@supabase/supabase-js"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { POST } from "./route"

jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }))
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }))

const ORG_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"
const SAFE_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40" fill="#0f766e"/></svg>'
)

function requestWith(bytes: Buffer, type: string, name = "logo.svg") {
  const file = {
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }
  return {
    formData: async () => ({ get: (key: string) => key === "file" ? file : null }),
  } as unknown as Request
}

function setup(options: {
  uploadError?: { message: string } | null
  settingError?: { message: string } | null
} = {}) {
  const upload = jest.fn().mockResolvedValue({ error: options.uploadError ?? null })
  const remove = jest.fn().mockResolvedValue({ error: null })
  const getPublicUrl = jest.fn().mockReturnValue({
    data: { publicUrl: "https://tenant.supabase.co/storage/v1/object/public/documents/logos/logo.png" },
  })
  const bucket = { upload, remove, getPublicUrl }
  ;(createClient as jest.Mock).mockReturnValue({
    storage: { from: jest.fn().mockReturnValue(bucket) },
  })

  const upsert = jest.fn().mockResolvedValue({ error: options.settingError ?? null })
  ;(createServerClient as jest.Mock).mockResolvedValue({
    from: jest.fn().mockReturnValue({ upsert }),
  })
  return { getPublicUrl, remove, upload, upsert }
}

describe("POST /api/settings/organization/logo", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://tenant.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key"
    ;(getCurrentUser as jest.Mock).mockResolvedValue({
      user: { id: USER_ID, org_id: ORG_ID },
    })
  })

  it("normalizes an SVG before storing it under the authenticated organization", async () => {
    const { upload, upsert } = setup()

    const response = await POST(requestWith(SAFE_SVG, "image/svg+xml"))

    expect(response.status).toBe(200)
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^logos/${ORG_ID}-\\d+\\.png$`)),
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/png", upsert: false })
    )
    const uploaded = upload.mock.calls[0][1] as Buffer
    expect(uploaded.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    expect(upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ org_id: ORG_ID, key: "brand_logo" })],
      { onConflict: "org_id,key" }
    )
  })

  it("accepts valid bytes with generic upload metadata and stores the detected MIME", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    )
    const { upload } = setup()

    const response = await POST(requestWith(png, "application/octet-stream", "logo"))

    expect(response.status).toBe(200)
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^logos/${ORG_ID}-\\d+\\.png$`)),
      png,
      expect.objectContaining({ contentType: "image/png" })
    )
  })

  it("rejects GIF bytes even when upload metadata claims PNG", async () => {
    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64")

    const response = await POST(requestWith(gif, "image/png", "logo.png"))

    expect(response.status).toBe(400)
    expect(createClient).not.toHaveBeenCalled()
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it("rejects spoofed image content before creating a privileged storage client", async () => {
    const response = await POST(requestWith(Buffer.from("<html>payload</html>"), "image/png", "logo.png"))

    expect(response.status).toBe(400)
    expect(createClient).not.toHaveBeenCalled()
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it("does not change the setting when Storage fails", async () => {
    const { upsert } = setup({ uploadError: { message: "storage unavailable" } })

    const response = await POST(requestWith(SAFE_SVG, "image/svg+xml"))

    expect(response.status).toBe(500)
    expect(upsert).not.toHaveBeenCalled()
  })

  it("removes the uploaded object when persisting the tenant setting fails", async () => {
    const { remove } = setup({ settingError: { message: "write failed" } })

    const response = await POST(requestWith(SAFE_SVG, "image/svg+xml"))

    expect(response.status).toBe(500)
    expect(remove).toHaveBeenCalledWith([
      expect.stringMatching(new RegExp(`^logos/${ORG_ID}-\\d+\\.png$`)),
    ])
  })
})
