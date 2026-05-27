export async function register() {
  if (
    process.env.DISABLE_AUTH === 'true' &&
    process.env.NODE_ENV !== 'development'
  ) {
    throw new Error(
      `[SECURITY] DISABLE_AUTH=true is set but NODE_ENV is "${process.env.NODE_ENV}". ` +
      `This variable must NEVER be enabled outside of local development. ` +
      `Remove DISABLE_AUTH from your environment variables and restart the server.`
    )
  }
}
