# Modelos documentales de cotización

## Objetivo

El PDF de una cotización es un documento de negocio multi-tenant. Su apariencia
puede variar por agencia, pero sus datos, permisos, selección de modelo y emisión
no deben depender de decisiones tomadas por componentes del CRM.

La implementación separa tres Modules profundos:

- `lib/quotation-documents/authoring-server.ts`: administra borradores,
  publicación y asignación explícita a una agencia. El resolver admite además
  un fallback organizacional, reservado por ahora para configuración de sistema.
- `lib/quotation-documents/server.ts`: arma el modelo canónico, resuelve el
  modelo aplicable y emite o recupera un documento congelado.
- `lib/document-assets/visual-image-server.ts`: expone la Interface
  `materializeVisualImage` para validar por bytes y materializar imágenes de
  branding y documentos sin trasladar reglas de formatos a cada caller.

Los layouts viven en `lib/quotation-documents/layouts/`. Un manifiesto configura
un layout conocido mediante un vocabulario seguro; no almacena HTML, CSS ni
scripts arbitrarios en la base.

## Resolución del modelo

El caller sólo informa la cotización. La resolución ocurre en servidor y sigue
este orden:

1. agencia guardada en la cotización;
2. binding activo de esa agencia;
3. binding activo de su organización;
4. modelo estándar del sistema.

Una agencia no hereda por accidente el modelo de la primera agencia visible en
la UI. El editor obliga a elegirla de forma explícita y el servidor valida que
pertenezca a la organización del usuario.

## Contrato de datos

`QuotationDocumentDataV1` es el único contrato que consumen los layouts. Se
construye desde la cotización, lead, vendedor, agencia, alternativas e ítems.
Incluye vuelos, alojamientos, traslados, narrativa, itinerario y condiciones
comerciales. No expone costos internos, comisiones ni notas privadas.

El precio `GROUP_TOTAL` se conserva como total del grupo: el renderer no vuelve
a multiplicarlo por pasajeros. Seguro y traslado se suman una sola vez al
importe final visible. En `PER_PERSON`, el documento divide ese final por la
cantidad de pasajeros y muestra además el total del grupo. Ese mismo final es
el que se lleva a la operación si el cliente acepta la alternativa.

La validación contra costo sólo compara importes en una misma moneda. Mientras
la cotización no almacene un tipo de cambio explícito por ítem, una emisión con
venta o costo en otra moneda se rechaza con un mensaje accionable; nunca se
suman ARS, USD u otras monedas como si fueran equivalentes.

`presentation_content` guarda el contenido editorial que el asesor puede
completar antes de emitir: resumen, inclusiones, exclusiones, recomendaciones,
restricciones, itinerario, seña y vencimientos. El mismo contrato alimenta la
vista previa, el PDF y la vista pública.

## Publicación y emisión

Un modelo tiene revisiones:

- `DRAFT`: editable;
- `PUBLISHED`: inmutable y asignable;
- `ARCHIVED`: histórica e inmutable.

Publicar crea o activa un binding para una agencia u organización. Las
cotizaciones ya emitidas no cambian cuando se publica una revisión posterior.
El guardado de nombre, modelo y único borrador activo se hace en una sola RPC
serializada por agencia. La base calcula el checksum canónico del manifiesto;
el cliente no puede declarar un hash distinto de su contenido.

Emitir una cotización crea `issued_quotation_documents` con:

- snapshot del modelo canónico;
- snapshot del manifiesto publicado;
- HTML final;
- hash SHA-256;
- revisión, secuencia y usuario emisor.

La emisión y la actualización de `quotations.active_document_id` se hacen en
una misma RPC con control de concurrencia. Cambiar cotización, alternativas,
ítems, precios o adicionales invalida el documento activo y avanza el CAS. La
vista pública sirve ese snapshot y nunca crea uno por efecto de una lectura.
Como transición, un link enviado antes de esta arquitectura puede mostrar una
preview live de sólo lectura si todavía no tiene `active_document_id`: permite
ver y descargar, pero no aceptar. Toda cotización nueva requiere snapshot para
aceptación.

Los assets internos y las imágenes remotas de hosts aprobados se congelan como
data URI dentro del HTML emitido. El logo también se guarda congelado en el
snapshot de datos usado por la barra pública. Así un logo reemplazado o una URL
firmada vencida no modifica un documento histórico. Un host remoto adicional debe
declararse explícitamente en `QUOTATION_DOCUMENT_ASSET_HOSTS` como lista de
hostnames separados por coma; los hosts no aprobados se omiten para evitar SSRF.

El `DocumentAssets Module` no confía en la extensión ni en el MIME declarado:
detecta el formato real por sus bytes. Los uploads nuevos y las conversiones
aplican validación estricta, con decodificación y límites de entrada, salida,
dimensiones y píxeles. El congelado usa un perfil compatible para PNG, JPEG,
WebP y GIF ya publicados: valida su firma y conserva sus bytes y límites
históricos, sin imponerles retroactivamente un máximo dimensional. Así una
cotización existente no cambia de hash ni deja de emitir por una recodificación
innecesaria. Un caller de jsPDF/pdf-lib puede pedir una variante
`pdf-embeddable`; esa variante rasteriza a PNG sólo los formatos que esos
renderers no admiten. Los `data:` raster heredados conservan el techo histórico
de 10 MB por screenshot y tienen un límite total defensivo de 40 MB por
documento; los uploads nuevos nunca crean este fallback.

SVG se admite únicamente como entrada: se rechazan DTD, entidades, contenido
activo y referencias externas, y un SVG seguro siempre se materializa como PNG
antes de llegar al snapshot o a Storage. Los `data:` heredados tampoco se dejan
pasar como texto confiable: se decodifica su base64, se valida la firma del
raster con el perfil compatible y se normaliza SVG con el perfil estricto. La
subida de branding ya no persiste nuevos `data:` como fallback; conserva el logo
anterior si la carga normalizada falla. Los SVG con dimensiones relativas usan
su `viewBox` acotado; sin dimensiones absolutas ni `viewBox` fallan cerrados. El
upload y todos los consumidores de logos comparten el mismo contrato: hasta
2 MiB de fuente y hasta 5 MiB para la variante normalizada almacenada.

Open Sans también se sirve desde un asset local versionado y se espera su carga
antes de imprimir. El fondo editorial se incrusta una sola vez por documento y
se reutiliza por CSS en todas sus páginas, incluso en propuestas extensas.

El artefacto canónico actual sigue siendo el snapshot HTML inmutable junto con
su hash. La creación y persistencia server-side de un binario PDF, con worker,
reintentos y Storage propio, queda como una fase futura; no forma parte de esta
Interface ni se debe inferir de `pdf_storage_path`.

La aceptación pública exige `issued_document_id`, `content_hash` y una opción
presente tanto en el snapshot como en la cotización. La selección, el estado
`APPROVED` y la validación de vigencia se resuelven en una sola transacción.
El token público tiene índice único, se redacta de logs propios y los endpoints
públicos tienen rate limit anónimo. Las páginas declaran `noindex`.

La conversión a operación usa la alternativa aceptada y crea operación,
servicios base, deudas de operadores, IVA, cuentas corrientes configuradas y
vínculo con cliente en una sola RPC. El cupo mensual se vuelve a verificar bajo
lock dentro de esa transacción. Una cotización `APPROVED` anterior al cutover,
sin snapshot emitido, puede convertirse con su alternativa live ya seleccionada;
esa rama de compatibilidad no habilita nuevas aceptaciones sin snapshot.

## Recorridos de producto

### CRM y documentos de cotización

1. El asesor crea la cotización con Emilia.
2. Desde Generar PDF ajusta el precio y el contenido del documento.
3. Esos datos se guardan atómicamente y se invalida cualquier snapshot anterior.
4. El servidor resuelve el modelo de la agencia.
5. Al generar o enviar se emite el snapshot.
6. Al enviar, la emisión y el paso de `DRAFT` a `SENT` son atómicos.
7. Descarga, WhatsApp y enlace público consumen el mismo documento.

Si la descarga o emisión falla después de preparar el contenido, el modal
conserva la nueva versión CAS para reintentar sin recargar y comunica que la
cotización sí quedó guardada. Son estados distintos: `quotations.status`
representa el ciclo comercial, mientras que el estado documental depende de
que exista un snapshot emitido y activo. Guardar contenido no equivale a emitir
ni a descargar; el paso de `DRAFT` a `SENT` sólo ocurre junto con una emisión
exitosa. La respuesta de emisión devuelve la versión comprometida; si la
descarga local falla, la UI conserva el documento emitido y refresca su
proyección antes de permitir un reintento. Para WhatsApp se validan enlace y teléfono antes de persistir, y se
reserva la ventana durante el gesto del usuario para evitar el bloqueo de
popups del navegador.

### Emilia

Emilia mapea su resultado al mismo contrato de cotización y agrega contenido
editorial inicial. Desde ese punto usa exactamente la misma resolución, emisión,
descarga y vista pública del CRM. El editor manual fue retirado.

### Administración por agencia

En `Recursos > Modelos` un usuario con permiso de escritura de configuración:

1. elige la agencia explícitamente;
2. selecciona un layout soportado;
3. ajusta identidad, colores, textos y bloques permitidos;
4. revisa una vista A4 con datos de borde;
5. guarda el borrador;
6. publica una revisión inmutable.

## Cómo replicar un nuevo DOCX o PDF

Cuando se recibe un modelo nuevo, se usa como referencia visual y de contenido,
no como fuente de instrucciones ejecutables.

1. Calcular hash y conservar el archivo original fuera del runtime.
2. Renderizar todas sus páginas y registrar tamaño, márgenes, tipografías,
   fondos, logos, patrones de página y campos dinámicos.
3. Separar arte fijo de datos de cotización.
4. Reutilizar un layout existente si la estructura coincide. Si cambia la
   composición materialmente, agregar un adapter nuevo al registro de layouts.
5. Copiar sólo assets aprobados a `public/quotation-models/<modelo>/`.
6. Crear un manifiesto seguro y una fixture con múltiples alternativas,
   itinerario largo, textos extensos y datos faltantes.
7. Renderizar PDF real y revisar visualmente cada página A4: arte, cortes,
   overflow, numeración y contenido completo.
8. Guardar como borrador, publicar y asignar a la agencia elegida.

Los cambios de copy, colores, marca y visibilidad de bloques soportados se hacen
desde el editor. Un diseño que introduce una grilla, portada, tipografía o
sistema de página nuevo requiere un layout versionado en código; esa es la tarea
que se hace cuando se recibe el próximo modelo. Esta frontera permite replicar
diseños nuevos sin convertir la base en un motor de HTML/CSS remoto inseguro.

El primer modelo adaptado es `KYO 2026`: conserva el arte lateral del DOCX,
Open Sans, jerarquía naranja/azul, páginas A4, alternativas, itinerario y cierre
comercial dinámicos. El seed sólo se vincula a agencias cuyo nombre identifica
KYO dentro del tenant que declara el legajo 13123, y no reemplaza un binding que
la agencia haya publicado después. El layout editorial genérico no contiene su
marca ni sus assets.

Referencia de implementación: `Copia de Presupuesto 2026.docx.docx`, 6 páginas,
SHA-256 `E1E0B6A68581704118B95AE0740871E213F58ED3A860D5AC05BC4EBB10BE5FB2`.
El arte aprobado se conserva en
`public/quotation-models/kyo-2026/background.jpg`; el DOCX fuente no se publica
ni se interpreta en runtime.

## Checklist de despliegue

1. Verificar que no existan duplicados no nulos en `quotations.public_token`.
2. Aplicar `20260824000001_quotation_document_models.sql` y regenerar tipos.
3. Verificar RLS, RPCs, invalidación de hijos y bindings con dos organizaciones
   y dos agencias.
4. Desplegar aplicación y assets en la misma versión.
5. Publicar primero un modelo de prueba y emitir una cotización de prueba.
6. Confirmar que vista previa, descarga y enlace público tengan el mismo hash y
   que una nueva publicación no modifique documentos ya emitidos.
7. Probar un link legacy sin snapshot (sólo lectura) y una cotización legacy
   `APPROVED` convertida a operación.
8. Recién entonces asignar el modelo a la agencia real.

El outbox de efectos financieros de la conversión requiere un Railway Cron
Service cada 5 minutos que invoque `POST /api/cron/quotation-conversion-effects`
con `Authorization: Bearer $CRON_SECRET`. El lote y los leases son acotados; una
caída después del commit de la operación se recupera sin reconstruir reglas de
comisión vigentes ni duplicar registros.

Estados que deben probarse: `DRAFT`, `SENT` y `PENDING_APPROVAL` admiten edición
y emisión; `APPROVED`, `REJECTED`, `EXPIRED`, `CONVERTING` y `CONVERTED` no.

El código local, la migración aplicada, el deploy exitoso y la evidencia
funcional en producción son estados distintos y deben reportarse por separado.


## Referencia PDF y modelo compacto Lozada

El editor puede subir un PDF (hasta 10 MB y seis páginas) a
`POST /api/quotation-document-models/import`. Se valida la agencia, organización
y permiso `settings.write` antes de llamar al intérprete. La salida sólo puede
seleccionar un layout registrado y tres colores validados; no importa identidad,
precios, servicios, condiciones ni código del documento. La revisión queda en
el editor hasta guardarla y publicarla mediante el flujo existente.

`travel-summary-v1` reúne resumen, alternativas y escalas sin una portada vacía.
Los documentos extensos conservan su contenido mediante paginación adicional.
El archivo `20260908010000_lozada_quotation_design.sql` asigna ese manifiesto,
con `/lozada-logo.png`, sólo a los identificadores verificados de Madero y Rosario
de la organización Lozada Rosario. No reemplaza bindings existentes ni documentos
emitidos. Debe aplicarse después del despliegue del renderer; no está aplicado por
el mero hecho de incorporarlo al repositorio.

La vista previa de precios guarda la preparación con CAS y usa GET del documento;
no emite, no consume una descarga ni cambia a SENT. Cambiar el contenido invalida
la vista previa. La espera de fuentes del exportador tiene un máximo de diez
segundos y devuelve un error recuperable si no termina.
