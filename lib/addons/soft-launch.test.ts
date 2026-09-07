import {
  ADDONS_SOFT_LAUNCH_EMAILS,
  isAddonsSoftLaunchUser,
} from "@/lib/addons/soft-launch"

describe("isAddonsSoftLaunchUser", () => {
  it("deja pasar a la cuenta de prueba", () => {
    expect(isAddonsSoftLaunchUser("mypupybox@gmail.com")).toBe(true)
  })

  it("no le importa cómo esté escrito el mail", () => {
    expect(isAddonsSoftLaunchUser("  MyPupyBox@Gmail.com  ")).toBe(true)
  })

  it("corta a cualquier otra cuenta", () => {
    expect(isAddonsSoftLaunchUser("yamil@lozadaviajes.com")).toBe(false)
    expect(isAddonsSoftLaunchUser("mypupybox@gmail.com.ar")).toBe(false)
  })

  it("sin mail no pasa: ante la duda, la sección no existe", () => {
    expect(isAddonsSoftLaunchUser(null)).toBe(false)
    expect(isAddonsSoftLaunchUser(undefined)).toBe(false)
    expect(isAddonsSoftLaunchUser("")).toBe(false)
  })

  it("la lista está en minúscula, que es lo que asume la comparación", () => {
    for (const email of ADDONS_SOFT_LAUNCH_EMAILS) {
      expect(email).toBe(email.toLowerCase().trim())
    }
  })
})
