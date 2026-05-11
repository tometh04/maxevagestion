"""
Migracion automatizada de colores Tailwind crudos a tokens Vibook.

Mapea (shade-aware) todas las clases tipo `(bg|text|border|...)-(slate|gray|...)-NNN(/M)?`
a tokens semanticos del nuevo design system:

  blue|indigo                       -> primary
  violet|purple                     -> accent-violet
  emerald|green|lime                -> success
  red|rose                          -> destructive
  yellow|amber|orange               -> accent-coral
  teal|cyan|sky                     -> accent-teal
  fuchsia|pink                      -> accent-coral
  slate|gray|zinc|neutral|stone     -> muted/foreground/secondary segun prefijo+shade

Reglas de shade -> opacity:
  shade <= 100        -> /10
  shade in 200/300    -> /15..20
  shade in 400        -> /30
  shade >= 500        -> sin opacidad (full token)

Si la clase ya tenia /opacity (ej: bg-blue-500/15), se preserva la opacidad.

Uso:
  python scripts/migrate-tailwind-colors.py [--dry-run]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

COLOR_TOKEN = {
    "blue": "primary",
    "indigo": "primary",
    "violet": "accent-violet",
    "purple": "accent-violet",
    "emerald": "success",
    "green": "success",
    "lime": "success",
    "red": "destructive",
    "rose": "destructive",
    "yellow": "accent-coral",
    "amber": "accent-coral",
    "orange": "accent-coral",
    "teal": "accent-teal",
    "cyan": "accent-teal",
    "sky": "accent-teal",
    "fuchsia": "accent-coral",
    "pink": "accent-coral",
}

GRAYS = {"slate", "gray", "zinc", "neutral", "stone"}

SHADE_TO_OPACITY = {
    "50": "/5",
    "100": "/10",
    "200": "/15",
    "300": "/20",
    "400": "/30",
}

PREFIXES = (
    r"bg|text|border(?:-[ltrbxy])?|ring|from|to|via|fill|stroke|decoration|"
    r"outline|placeholder|caret|divide"
)
COLORS = "|".join(list(COLOR_TOKEN.keys()) + list(GRAYS))
PATTERN = re.compile(
    rf"\b(?P<prefix>{PREFIXES})-(?P<color>{COLORS})-(?P<shade>\d{{2,3}})(?P<opacity>/\d+)?\b"
)


def map_gray(prefix: str, shade: str) -> tuple[str, str | None]:
    s = int(shade)
    is_text = prefix == "text"
    is_border = prefix.startswith("border")
    is_ring = prefix == "ring"
    is_divide = prefix == "divide"

    if is_text:
        if s <= 400:
            return ("muted-foreground", None)
        if s <= 600:
            return ("muted-foreground", None)
        return ("foreground", None)

    if is_border or is_ring or is_divide:
        if s <= 200:
            return ("border", None)
        if s <= 400:
            return ("border", None)
        return ("muted-foreground", None)

    if s <= 100:
        return ("muted", None)
    if s <= 200:
        return ("secondary", None)
    if s <= 400:
        return ("muted-foreground", "/30")
    if s <= 600:
        return ("muted-foreground", None)
    return ("foreground", None)


def map_color(prefix: str, color: str, shade: str) -> tuple[str, str | None]:
    if color in GRAYS:
        return map_gray(prefix, shade)

    token = COLOR_TOKEN[color]
    s = int(shade)
    is_text = prefix == "text"

    if is_text:
        return (token, None)

    if s <= 400:
        return (token, SHADE_TO_OPACITY.get(shade))
    return (token, None)


def replace(match: re.Match) -> str:
    prefix = match.group("prefix")
    color = match.group("color")
    shade = match.group("shade")
    explicit_opacity = match.group("opacity")

    token, derived_opacity = map_color(prefix, color, shade)
    opacity = explicit_opacity or derived_opacity or ""
    return f"{prefix}-{token}{opacity}"


def process_file(path: Path, dry_run: bool) -> int:
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return 0

    new_content, n = PATTERN.subn(replace, content)
    if n == 0 or new_content == content:
        return 0
    if not dry_run:
        path.write_text(new_content, encoding="utf-8")
    return n


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    targets: list[Path] = []
    for sub in ("app", "components"):
        base = ROOT / sub
        targets.extend(base.rglob("*.ts"))
        targets.extend(base.rglob("*.tsx"))

    total = 0
    files_changed = 0
    for t in targets:
        n = process_file(t, dry_run)
        if n:
            files_changed += 1
            total += n

    action = "would change" if dry_run else "changed"
    print(f"{action} {total} class instances across {files_changed} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
