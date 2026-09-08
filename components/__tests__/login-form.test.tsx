import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { LoginForm } from "../login-form"

const mockSignIn = jest.fn()
const mockProfile = jest.fn()
const mockSignOut = jest.fn()
jest.mock("@/lib/supabase/client", () => ({ supabase: {
  auth: { signInWithPassword: (...args: unknown[]) => mockSignIn(...args), signOut: (...args: unknown[]) => mockSignOut(...args) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockProfile }) }) }),
} }))
jest.mock("@/lib/analytics/track", () => ({ trackEvent: jest.fn() }))

function submit(email = "persona@example.com", password = "secreto123") {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } })
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: password } })
  fireEvent.submit(screen.getByRole("button", { name: "Iniciar Sesión" }).closest("form")!)
}

beforeEach(() => { jest.clearAllMocks(); mockSignOut.mockResolvedValue({ error: null }) })

it("traduce credenciales inválidas sin mostrar el error del proveedor", async () => {
  mockSignIn.mockResolvedValue({ data: {}, error: Object.assign(new Error("Invalid login credentials"), { code: "invalid_credentials" }) })
  render(<LoginForm />)
  submit()
  expect(await screen.findByRole("alert")).toHaveTextContent("El email o la contraseña son incorrectos.")
})

it("valida campos vacíos y enfoca el primero sin llamar a Supabase", async () => {
  render(<LoginForm />)
  submit("", "")
  expect(await screen.findByText("Ingresá tu email.")).toBeInTheDocument()
  expect(screen.getByText("Ingresá tu contraseña.")).toBeInTheDocument()
  expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true")
  expect(mockSignIn).not.toHaveBeenCalled()
})

it("normaliza espacios del email y conserva la contraseña literal", async () => {
  mockSignIn.mockResolvedValue({ data: {}, error: { code: "invalid_credentials" } })
  render(<LoginForm />)
  submit(" persona@example.com ", " a ")
  await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith({ email: "persona@example.com", password: " a " }))
})

it.each([
  [{ code: "email_not_confirmed" }, "Confirmá tu email"],
  [{ status: 429 }, "Demasiados intentos"],
  [new TypeError("Failed to fetch"), "conexión"],
  [new Error("SQL secret internal error"), "No pudimos iniciar sesión"],
])("presenta un mensaje seguro y permite reintentar: %p", async (error, message) => {
  mockSignIn.mockRejectedValue(error)
  render(<LoginForm />)
  submit()
  expect(await screen.findByRole("alert")).toHaveTextContent(message)
  expect(screen.getByRole("button", { name: "Iniciar Sesión" })).toBeEnabled()
})

it("recupera una respuesta sin usuario", async () => {
  mockSignIn.mockResolvedValue({ data: { user: null }, error: null })
  render(<LoginForm />)
  submit()
  expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos iniciar sesión")
  expect(screen.getByRole("button", { name: "Iniciar Sesión" })).toBeEnabled()
})

it.each([
  [{ data: null, error: { code: "PGRST205", message: "Could not find the table users" } }, "No pudimos verificar tu cuenta"],
  [{ data: null, error: null }, "No pudimos encontrar tu perfil"],
  [{ data: { is_active: false }, error: null }, "Tu cuenta está desactivada"],
])("cierra la sesión local cuando falla el perfil: %p", async (profile, message) => {
  mockSignIn.mockResolvedValue({ data: { user: { id: "auth-id" } }, error: null })
  mockProfile.mockResolvedValue(profile)
  render(<LoginForm />)
  submit()
  expect(await screen.findByRole("alert")).toHaveTextContent(message)
  expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" })
})

it("bloquea envíos duplicados mientras espera", async () => {
  mockSignIn.mockReturnValue(new Promise(() => {}))
  render(<LoginForm />)
  submit()
  await screen.findByRole("button", { name: "Iniciando sesión..." })
  fireEvent.submit(screen.getByLabelText("Email").closest("form")!)
  await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1))
  expect(screen.getByLabelText("Email")).toBeDisabled()
})

it("borra el error anterior al corregir los datos", async () => {
  mockSignIn.mockResolvedValue({ data: {}, error: { code: "invalid_credentials" } })
  render(<LoginForm />)
  submit()
  const alert = await screen.findByRole("alert")
  expect(alert).toHaveFocus()
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "corregida" } })
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
})

it("rechaza un email mal formado antes de autenticar", async () => {
  render(<LoginForm />)
  submit("email-invalido")
  expect(await screen.findByText(/Ingresá un email válido/)).toBeInTheDocument()
  expect(mockSignIn).not.toHaveBeenCalled()
})
