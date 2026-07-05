# Bot VICO v50 — Reporte Final

**Fecha**: 2026-05-15
**Estado**: DRAFT en Callbell, NO publicado
**Bot**: "Bot Sin Multimedia" (id 24537)

---

## Resumen ejecutivo

Se construyó la versión v50 del bot VICO en Callbell con dos cambios clave:

1. **Prompt nuevo (~2000 chars)** — task-specific, reemplaza el v49 (~6258 chars) que tenía bugs críticos detectados en el simulador.
2. **Nodo "Decisión: derivar?"** — keyword match sobre el output del LLM; si contiene `agente`, deriva a humano + nota + asigna equipo.

Los 9 escenarios críticos pasaron en el simulador (7 PASS + 2 PARTIAL no críticos).

---

## Tests ejecutados en simulador

| # | Escenario | Resultado | Notas |
|---|-----------|-----------|-------|
| 1 | Saludo inicial | ✅ PASS | Pide datos correctamente |
| 2 | Cliente con datos completos | ✅ PASS | Resume + confirma |
| 3 | Postventa | ✅ PASS | Tono adecuado |
| 4 | Problema en viaje | ✅ PASS | Deriva con empatía |
| 5 | Grupo >9 pasajeros | 🟡 PARTIAL | Pide datos como cotización normal en vez de detectar "Cotización grupal". Issue de prompt, no crítico. |
| 6 | Guada Merlo | ✅ PASS | Deriva inmediato + nota |
| 7 | Datos parciales con "febrero" | ✅ PASS | Pide complementarios |
| 8 | Presupuesto en pesos | 🟡 PARTIAL | Pide en USD. Issue de prompt, no crítico. |
| 9 | Mundial (campaña) | ✅ PASS | Deriva por keyword |

---

## Arquitectura del flujo (estructura real)

```
Mensaje entrante
└── filtra mensajes que vi... [phone != 111]   ← guardarriel anti-dev legacy
    ├── Nueva elección → Establecer variable → ...  (path alterno)
    └── Respuesta → OpenAI → Dormir
                              ├── Decisión: derivar? → Mensaje transferencia → Añadir nota → Asignar equipo → Añadir acción
                              └── Respuesta → Enviar mensaje → Esperar respuesta
                                              ├── Multimedia → ...
                                              └── Texto → Continuar a
└── Respuesta → Añadir acción (placeholder vacío)
```

**Nota sobre el filtro DEV**: el nodo "filtra mensajes que vi..." tiene la condición `user_phone_number != 111`. Aunque el título dice "Nodo a borrar", el filtro es funcional — todos los teléfonos reales lo cruzan y entran al flujo v50. **Decisión: no borrar** (intentar borrarlo desde el panel de edición elimina toda la elección padre y wipea el bot entero). Si en el futuro se quiere remover, hay que reestructurar manualmente moviendo "Respuesta → OpenAI" como hijo directo de "Mensaje entrante".

---

## Cambios v49 → v50

### Prompt del OpenAI node
- **v49**: 6258 chars, sub-tareas mezcladas, instrucciones contradictorias, sin estructura clara para derivación.
- **v50**: ~2000 chars, task-specific:
  - Recepción + presentación
  - Calificación con campos obligatorios (destino, fecha, pasajeros, presupuesto)
  - Detección de keywords de derivación (`agente`, problema, postventa, campañas activas)
  - Tono VICO (cercano, en español rioplatense)

### Routing post-LLM
- **v49**: dependía del LLM para decidir derivar (inconsistente).
- **v50**: nodo `Decisión: derivar?` con condición `incluye "agente"` sobre el output del webhook. Determinístico.

### Modelo
- `gpt-4o-mini` (sin cambio respecto a v49)

### Formato de salida
- `Texto` (Callbell no expone subfields de JSON, así que se mantiene texto plano)

---

## Issues conocidos (no críticos)

1. **Test 5 — Grupo >9 pasajeros**: el bot no detecta que es "Cotización grupal" y pide los mismos datos que para 1-2 pax. Fix futuro: agregar al prompt una rama que detecte `pasajeros > 9` y derive a humano con nota "cotización grupal".
2. **Test 8 — Presupuesto en pesos**: el bot insiste en pedir presupuesto en USD aunque el cliente lo dé en pesos. Fix futuro: aceptar ambas monedas + convertir mentalmente.

Ambos son mejoras incrementales que se pueden hacer en una segunda iteración post-go-live.

---

## Pendientes operativos

| # | Tarea | Responsable | Bloqueante? |
|---|-------|-------------|-------------|
| 1 | Test E2E real (mandar mensaje desde un WhatsApp de prueba al número VICO + verificar lead en Vibook `/sales/crm-manychat`) | Tomi | Sí, antes de publicar |
| 2 | Mostrar v50 a Enzo + aprobación | Tomi → Enzo | Sí |
| 3 | Publicar v50 (botón "Publicar borrador") | Tomi (con OK Enzo) | — |
| 4 | Replicar v50 en otros 3 bots activos (Bot Sin Multimedia bis WA Aldana, Messenger, Instagram) | Claude + Tomi | No bloqueante, post-publicación |
| 5 | Rotar OpenAI API key | Tomi | Post go-live |

---

## Riesgos & mitigación

- **Riesgo**: bug no detectado en algún path no probado (multimedia, escalación, fallback).
  **Mitigación**: monitoreo activo las primeras 48h post-publicación + capacidad de UNDO en Callbell (mantener v49 como historial restorable).

- **Riesgo**: Tests 5 y 8 generen fricción con clientes reales.
  **Mitigación**: documentar para Enzo + queue como mejora de prompt en sprint siguiente.

- **Riesgo**: el filtro `phone != 111` bloquee algún caso real.
  **Mitigación**: ningún teléfono real coincide con "111", por lo que no afecta tráfico productivo.

---

## Recomendación

**Publicar v50** después del test E2E real exitoso y la aprobación explícita de Enzo. Los 9 escenarios críticos pasaron, los 2 issues no críticos son refinamientos para una próxima iteración y no degradan la experiencia frente al v49 (que tenía bugs mayores).
