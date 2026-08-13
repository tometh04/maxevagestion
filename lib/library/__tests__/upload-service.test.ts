/** @jest-environment node */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { LibraryContext } from "@/lib/library/types"
import { createUploadTarget } from "@/lib/library/upload-service"
import { LibraryValidationError } from "@/lib/library/access"

const orgId = "11111111-1111-4111-8111-111111111111"
const userId = "33333333-3333-4333-8333-333333333333"

function ctx(storageFrom: jest.Mock): LibraryContext {
  const supabase = {
    from: jest.fn(),
    storage: { from: storageFrom },
  } as unknown as SupabaseClient<Database>
  return { supabase, orgId, userId, userRoles: ["ADMIN"] }
}

describe("library upload-service", () => {
  beforeEach(() => jest.clearAllMocks())

  it("rechaza MIME no permitido antes de tocar storage", async () => {
    const storageFrom = jest.fn()
    await expect(
      createUploadTarget(ctx(storageFrom), {
        fileName: "x.svg",
        mimeType: "image/svg+xml",
      })
    ).rejects.toBeInstanceOf(LibraryValidationError)
    expect(storageFrom).not.toHaveBeenCalled()
  })

  it("rechaza archivos que superan el límite de tamaño", async () => {
    const storageFrom = jest.fn()
    await expect(
      createUploadTarget(ctx(storageFrom), {
        fileName: "video.mp4",
        mimeType: "video/mp4",
        size: 600 * 1024 * 1024, // 600MB > 500MB
      })
    ).rejects.toBeInstanceOf(LibraryValidationError)
    expect(storageFrom).not.toHaveBeenCalled()
  })

  it("genera una signed upload URL con path scopeado por org", async () => {
    const createSignedUploadUrl = jest.fn().mockResolvedValue({
      data: { signedUrl: "https://signed", token: "tok", path: null },
      error: null,
    })
    const storageFrom = jest.fn(() => ({ createSignedUploadUrl }))

    const target = await createUploadTarget(ctx(storageFrom), {
      fileName: "manual.pdf",
      mimeType: "application/pdf",
      size: 1024,
    })

    expect(storageFrom).toHaveBeenCalledWith("library-assets")
    const pathArg = createSignedUploadUrl.mock.calls[0][0] as string
    expect(pathArg.startsWith(`${orgId}/`)).toBe(true)
    expect(pathArg.endsWith(".pdf")).toBe(true)
    expect(target.token).toBe("tok")
    expect(target.path.startsWith(`${orgId}/`)).toBe(true)
  })
})
