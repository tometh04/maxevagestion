# Resultados progresivos de Emilia en el CRM

El runtime de Emilia es dueño de la búsqueda y del snapshot parcial persistido
en el job. El gateway valida el contrato público; el BFF del CRM conserva sus
gates de usuario, organización, agencia y conversación antes de normalizarlo.
El browser nunca consulta tablas de Emilia ni recibe credenciales de proveedores.

Cada producto se publica cuando termina su agregación de proveedores, ranking y
filtros. Una restricción de presupuesto combinado requiere ambos productos: en
ese caso se espera a aplicar la restricción antes de publicar opciones.

`progress` usa versión creciente por intento y contiene los productos pedidos y
sus result sets canónicos. Un worker vencido no puede publicar. En un reintento
el gateway descarta snapshots de intentos anteriores. El resultado terminal sigue
siendo la fuente definitiva y el único que confirma contexto y artefactos.

El texto de espera refleja el stage real del job: contexto, interpretación,
búsqueda, organización, guardado y finalización. Los cambios de stage se entregan
aunque no cambie la versión de las tarjetas; no se simulan avances por tiempo.

El CRM recupera progress usando el polling autenticado existente. Mantiene una
respuesta por job y actualiza sus bloques en el mismo lugar. Se pueden seleccionar
opciones parciales, pero generar la cotización espera al cierre del job, cuando
los artefactos y la procedencia de precios están persistidos. La llegada de hoteles
conserva filtros, selección y estado local de las tarjetas de vuelos. Los errores
de un producto no ocultan las opciones del otro. La reconexión vuelve a leer el
snapshot persistido; no inicia una búsqueda nueva.

Orden de publicación: migración de Emilia, Edge `emilia-turn`, gateway Emilia API,
y CRM. Los clientes anteriores siguen esperando `result`; los clientes nuevos
siguen funcionando sin progress. La novedad se publica cuando las tres capas
estén desplegadas y se verifique una búsqueda progresiva completa.

## Validación local

- CRM: tests del polling, normalización, identidad del mensaje, recuperación y
  gates del BFF. La prueba de componente conserva el mismo nodo de vuelo, su
  detalle abierto, selección y filtro al incorporar hoteles y cerrar el turno.
- Emilia: búsqueda combinada real con proveedores simulados; publicación de vuelos
  antes de resolver hoteles; exclusión de previews para presupuesto combinado.
  Contratos del gateway y finalización existentes también verificados.
- SQL: migración ejecutada en PostgreSQL embebido aislado (PGlite), verificando
  versión, intento, tenant, token, lease, cierre del job y permisos de ejecución.
- Chromium: componentes reales con respuestas simuladas, escritorio, móvil y dark
  mode; sin overflow horizontal ni errores JavaScript. No es una prueba contra
  proveedores ni una medición de latencia de producción.
- Builds de CRM y gateway aprobados. El check global de admin-client falla por
  29 entradas que ya existen en HEAD fuera del allowlist; las dos rutas de Emilia
  están permitidas y este cambio no agrega usos del admin client.

El 5 de septiembre de 2026 se aplicó en producción la migración
`20260905160000_emilia_job_progress` y se desplegó Edge `emilia-turn`.
El gateway se publicó como `abb93e47`; la validación funcional de producción
se realiza después de que Railway active gateway y CRM.
