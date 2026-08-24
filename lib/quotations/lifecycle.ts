export const EDITABLE_QUOTATION_STATUSES = [
  "DRAFT",
  "SENT",
  "PENDING_APPROVAL",
] as const

const EDITABLE_QUOTATION_STATUS_SET = new Set<string>(EDITABLE_QUOTATION_STATUSES)

/**
 * A quotation may only change commercial content while it is still open.
 * CONVERTING is deliberately excluded: conversion acquires that state as a
 * lock and no concurrent writer may invalidate the accepted document.
 */
export function isQuotationContentEditable(status: string | null | undefined): boolean {
  return EDITABLE_QUOTATION_STATUS_SET.has(String(status || ""))
}
