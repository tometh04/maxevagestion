export function getPublicQuotationPath(token: string) {
  return `/cotizacion/${token}`
}

export function getPublicQuotationPdfPath(token: string) {
  return `${getPublicQuotationPath(token)}/pdf`
}
