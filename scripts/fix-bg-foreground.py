"""
Fix del bug de Fase 4: `bg-gray-900` se mapeo a `bg-foreground` (que invierte
con el theme: dark en light mode, white en dark mode). El intento original era
"superficie oscura siempre".

Reglas:
  - app/admin/* y components/admin/*  -> bg-foreground -> bg-ink (siempre dark)
  - Otros archivos                    -> dark:bg-foreground[/N] -> dark:bg-card[/N]
                                         (mantener bg-* en light mode tal cual; solo arreglar el variant dark)
  - components/ui/tooltip.tsx          -> dejar como esta (inversion intencional)
"""
from __future__ import annotations
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Pattern para bg-foreground / dark:bg-foreground / hover:bg-foreground / dark:hover:bg-foreground
# con opacidad opcional /N
PATTERN = re.compile(
    r"\b(?P<prefix>(?:dark:)?(?:hover:|focus:|group-hover:)?(?:dark:)?)"
    r"bg-foreground(?P<opacity>/\d+)?\b"
)

def is_admin_file(p: Path) -> bool:
    s = str(p).replace("\\", "/")
    return "/app/admin/" in s or "/components/admin/" in s

def is_tooltip(p: Path) -> bool:
    return str(p).replace("\\", "/").endswith("/components/ui/tooltip.tsx")

def replace_admin(match: re.Match) -> str:
    prefix = match.group("prefix")
    opacity = match.group("opacity") or ""
    # En admin: queremos siempre superficie oscura -> bg-ink
    return f"{prefix}bg-ink{opacity}"

def replace_general(match: re.Match) -> str:
    prefix = match.group("prefix")
    opacity = match.group("opacity") or ""
    # Solo arreglar la variante dark; no tocar bg-foreground sin "dark:" prefix
    if "dark:" in prefix:
        return f"{prefix}bg-card{opacity}"
    return match.group(0)  # sin cambios

def process(path: Path) -> int:
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return 0
    if is_tooltip(path):
        return 0
    if is_admin_file(path):
        new_content, n = PATTERN.subn(replace_admin, content)
    else:
        new_content, n = PATTERN.subn(replace_general, content)
    if new_content == content:
        return 0
    path.write_text(new_content, encoding="utf-8")
    return n

def main() -> int:
    targets: list[Path] = []
    for sub in ("app", "components"):
        base = ROOT / sub
        targets.extend(base.rglob("*.ts"))
        targets.extend(base.rglob("*.tsx"))
    total = 0
    files_changed = 0
    for t in targets:
        n = process(t)
        if n:
            files_changed += 1
            total += n
            print(f"  {n:3d}  {t.relative_to(ROOT)}")
    print(f"\nchanged {total} instances across {files_changed} files")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
