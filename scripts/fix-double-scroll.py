"""
Fix doble-scroll en dialogs.

Aplica reemplazos exactos en 12 archivos. Cada (file, before, after) es
una sustitucion literal idempotente.
"""
from __future__ import annotations
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

REPLACEMENTS = [
    # bulk-payment-dialog
    ("components/accounting/bulk-payment-dialog.tsx",
     '<DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">',
     '<DialogContent className="max-w-6xl">'),
    ("components/accounting/bulk-payment-dialog.tsx",
     '<div className="px-6 py-5 space-y-6 max-h-[75vh] overflow-y-auto">',
     '<div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-6">'),
    # financial-accounts-page-client
    ("components/accounting/financial-accounts-page-client.tsx",
     '<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">',
     '<DialogContent className="max-w-2xl">'),
    # ocr-results-dialog
    ("components/documents/ocr-results-dialog.tsx",
     '<DialogContent className="max-w-[95vw] sm:max-w-[600px] max-h-[95vh] overflow-y-auto">',
     '<DialogContent className="max-w-[95vw] sm:max-w-[600px] max-h-[95vh]">'),
    ("components/documents/ocr-results-dialog.tsx",
     '<form onSubmit={form.handleSubmit(handleConfirm)} className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">',
     '<form onSubmit={form.handleSubmit(handleConfirm)} className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-5">'),
    # edit-operation-dialog
    ("components/operations/edit-operation-dialog.tsx",
     '<DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-hidden">',
     '<DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh]">'),
    ("components/operations/edit-operation-dialog.tsx",
     '<form onSubmit={form.handleSubmit(onSubmit)} className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">',
     '<form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-5">'),
    # new-operation-dialog
    ("components/operations/new-operation-dialog.tsx",
     'className="max-w-[95vw] sm:max-w-4xl max-h-[95vh]"',
     'className="max-w-[95vw] sm:max-w-4xl max-h-[95vh]"'),  # no-op (no overflow to remove on this DialogContent)
    ("components/operations/new-operation-dialog.tsx",
     '<div className="px-6 py-6 space-y-7 max-h-[75vh] overflow-y-auto">',
     '<div className="flex-1 overflow-y-auto min-h-0 px-6 py-6 space-y-7">'),
    # operation-services-section
    ("components/operations/operation-services-section.tsx",
     '<DialogContent className="sm:max-w-[560px] max-h-[85vh] flex flex-col overflow-hidden">',
     '<DialogContent className="sm:max-w-[560px] max-h-[85vh]">'),
    # mark-paid-dialog
    ("components/payments/mark-paid-dialog.tsx",
     '<DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden">',
     '<DialogContent className="max-w-md">'),
    # new-payment-dialog
    ("components/payments/new-payment-dialog.tsx",
     '<DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[95vh] overflow-y-auto">',
     '<DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[95vh]">'),
    # lead-detail-dialog
    ("components/sales/lead-detail-dialog.tsx",
     '<DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">',
     '<DialogContent className="max-w-2xl p-0">'),
    # new-lead-dialog
    ("components/sales/new-lead-dialog.tsx",
     '<DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">',
     '<DialogContent className="max-w-2xl">'),
    # quotation-builder-dialog
    ("components/sales/quotation-builder-dialog.tsx",
     '<DialogContent className="max-w-4xl max-h-[95vh] flex flex-col p-0">',
     '<DialogContent className="max-w-4xl max-h-[95vh] p-0">'),
    # templates-page-client (2 instancias)
    ("components/templates/templates-page-client.tsx",
     '<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto px-6 py-5">',
     '<DialogContent className="max-w-4xl px-6 py-5">'),
    ("components/templates/templates-page-client.tsx",
     '<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">',
     '<DialogContent className="max-w-4xl">'),
]


def main() -> int:
    total_subs = 0
    files_changed: dict[str, int] = {}
    for rel, before, after in REPLACEMENTS:
        p = ROOT / rel
        try:
            content = p.read_text(encoding="utf-8")
        except FileNotFoundError:
            print(f"  MISS  {rel} (file not found)")
            continue
        if before == after:
            continue
        if before not in content:
            print(f"  MISS  {rel} (pattern not found)")
            continue
        new_content = content.replace(before, after, 1)
        p.write_text(new_content, encoding="utf-8")
        files_changed[rel] = files_changed.get(rel, 0) + 1
        total_subs += 1
        print(f"  OK    {rel}")
    print(f"\nApplied {total_subs} replacements across {len(files_changed)} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
