# Documentacion del proyecto

Este directorio concentra la documentacion operativa, tecnica e historica del
repo. La raiz queda reservada para archivos que herramientas y agentes esperan
en esa ubicacion:

- `README.md`
- `AGENTS.md`
- `CLAUDE.md`

## Mapa de carpetas

- `architecture/`: arquitectura actual, auditorias tecnicas y system design.
- `ai/`: AI Companion, Cerebro, OCR y flujos con modelos.
- `audits/`: auditorias de codigo, finanzas, logica y deuda tecnica.
- `archive/`: documentos historicos, pendientes viejos, resumenes y duplicados.
- `changelog/`: resumenes de cambios por ventana de trabajo.
- `finance/`: caja, contabilidad, balances, tipo de cambio y reestructuraciones.
- `guides/`: guias generales de uso o replicacion.
- `integrations/`: integraciones externas agrupadas por proveedor o flujo.
- `migration/`: migraciones de datos, deployment y cambios de plataforma.
- `performance/`: optimizaciones y mediciones de rendimiento.
- `plans/`: planes de accion e implementacion.
- `product/`: propuestas de producto, sidebar, competencia y UX funcional.
- `roadmap/`: roadmaps generales y SaaS.
- `runbooks/`: handover, incidentes, go-live y debugging operacional.
- `setup/`: configuracion inicial del proyecto y servicios base.
- `testing/`: QA, reportes, checklists y guias de testing.
- `trello/`: documentacion Trello legacy/residual.
- `tutoriales-import/`: tutoriales de importacion.
- `superpowers/`: specs, plans y artefactos generados por superpowers.

## Documentos clave

- Arquitectura viva: `architecture/AUDITORIA_ARQUITECTURA_AGENTS.md`
- Handover operativo: `runbooks/HANDOVER.md`
- Bugs y riesgos conocidos: `runbooks/BUGS-TRIAGE.md`
- Testing manual: `testing/GUIA_TESTING.md`
- QA Railway: `testing/testing-railway-migration.md`
- Setup Supabase: `setup/CONFIGURACION_SUPABASE.md`
- Roadmap general: `roadmap/ROADMAP.md`
- Roadmap SaaS: `roadmap/ROADMAP-SAAS.md`

## Agentes y reglas

- `../AGENTS.md` es el contrato principal para Codex, Claude y otros agentes:
  arquitectura, patrones, comandos, tenancy, permisos, APIs, UI, testing y docs.
- `../CLAUDE.md` es un adaptador para Claude Code e importa `@AGENTS.md`; no
  debe duplicar reglas generales del proyecto.
- `../.claude/rules/` contiene reglas contextuales de Claude Code para areas
  sensibles como finanzas, integraciones, UI y AI/Cerebro.
- `../.agents/skills/` y `../.claude/skills/` contienen workflows reutilizables;
  hoy la skill activa del repo es `impeccable` para UI/frontend.

## Reglas para nuevos `.md`

1. No agregar Markdown suelto en la raiz salvo que una herramienta lo requiera.
2. Si el documento define una decision cross-cutting, usar `architecture/` o
   crear una ADR dentro de esa carpeta.
3. Si el documento es un procedimiento repetible de operacion, usar `runbooks/`.
4. Si el documento es historico o ya fue reemplazado, usar `archive/`.
5. Si hay enlaces a documentos movidos, actualizarlos en el mismo cambio.
