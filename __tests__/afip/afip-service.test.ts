/**
 * @jest-environment node
 */
import { getAfipServiceForOrg } from "@/lib/afip/afip-service"

// Mock @afipsdk/afip.js para evitar hitear AFIP real
jest.mock("@afipsdk/afip.js", () => {
  return jest.fn().mockImplementation(() => ({
    ElectronicBilling: {
      createNextVoucher: jest.fn(),
      getLastVoucher: jest.fn(),
      getVoucherInfo: jest.fn(),
      getSalesPoints: jest.fn(),
      getExchangeRate: jest.fn(),
    },
    GetServiceTA: jest.fn(),
  }))
})

describe("getAfipServiceForOrg", () => {
  it("returns null when no AFIP config exists for org", async () => {
    const supabase = makeMockSupabase({ integrations: [] })
    const svc = await getAfipServiceForOrg(supabase as any, "org-aaa")
    expect(svc).toBeNull()
  })

  it("returns AfipService instance when config exists", async () => {
    const supabase = makeMockSupabase({
      integrations: [
        {
          org_id: "org-aaa",
          integration_type: "afip",
          status: "active",
          config: {
            api_key: "TEST_KEY",
            cuit: "20123456789",
            point_of_sale: 1,
            environment: "sandbox",
            cert: "-----BEGIN CERT-----",
            key: "-----BEGIN KEY-----",
          },
        },
      ],
    })
    const svc = await getAfipServiceForOrg(supabase as any, "org-aaa")
    expect(svc).not.toBeNull()
    expect(svc?.orgId).toBe("org-aaa")
  })
})

function makeMockSupabase(data: { integrations: any[] }) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          eq: (c2: string, v2: string) => ({
            eq: (c3: string, v3: string) => ({
              maybeSingle: async () => {
                const match = data.integrations.find(
                  (i) =>
                    i.org_id === val &&
                    i.integration_type === v2 &&
                    i.status === v3
                )
                return { data: match || null, error: null }
              },
            }),
          }),
        }),
      }),
    }),
  }
}
