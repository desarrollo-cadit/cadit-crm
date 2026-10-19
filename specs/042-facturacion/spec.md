# Feature Specification: Facturación (Administración registra la factura)

**Feature Branch**: `042-facturacion`

**Created**: 2026-10-19

**Status**: Implementada (primera entrega)

**Depende de**: 005 (inscripciones, empresas, `invoice_number`), 008 (pagos; DV-006: el recibo es del PAGO), 012 (capacidades, RLS), 026 (rol Administración: "transcribe, no cobra"; Finanzas), 033 (talleres no son cursadas), 2026-10-06 (vendedores, `exigeVendedor`), 039 (confirmación y avisos T-7/T-2 de facturación, `sinFacturar`), 040 (rol Ventas sin plata, datos de facturación de la empresa), 041 (`esVentaParaAviso`)

**Input**: Decisión del dueño (2026-10-19), no se reabre:

1. Capacidad nueva `facturacion.editar`: registrar SOLO datos de documento
   (número de factura de la inscripción, número de recibo del pago). No
   permite cambiar montos, moneda, cuotas, pagos, descuentos ni nada más.
   Rutas propias con bodies Zod estrictos. La ruta comercial
   (`PATCH /api/enrollments/[id]`, `inscripciones.editar`) no cambia.
   Se otorga a administración, dirección, coordinación (+ owner/member del
   respaldo); no a soporte ni a ventas.
2. Pantalla "Pendiente de facturar" en el panel, con la misma regla que los
   avisos T-7/T-2 de 039, filtros, totales por moneda, acción en línea,
   pestaña "Facturadas" y export CSV.
3. Ventas (040) sigue sin ver números de factura ni montos.

## Por qué esta fase existe

Administración recibe desde 039 la lista de quienes no tienen factura 7 y 2
días antes del inicio, y desde 041 cada venta nueva. Pero no podía ANOTAR el
número: la factura se escribía por `PATCH /api/enrollments/[id]`, que exige
`inscripciones.editar`, y esa capacidad también cambia montos — exactamente lo
que 026 le negó a Administración. El resultado: el aviso le decía "faltan 3",
alguien de coordinación tenía que cargar los números, y el aviso del día
siguiente seguía diciendo "faltan 3" hasta que esa persona tuviera un rato.

## User Scenarios & Testing

### US1 — Administración anota el número de factura (P1)

Lucía (Administración) recibe el aviso T-7 de Revit Octubre. Abre
Facturación, ve las tres ventas pendientes, emite las facturas en el sistema
contable y anota cada número en su fila. La fila sale de la lista al
instante.

1. **Given** una venta pendiente, **When** Lucía anota `F-0819` y toca
   «Registrar factura», **Then** la fila desaparece de Pendientes, el número
   queda guardado recortado y `invoice_recorded_at/_by` registran cuándo y
   quién.
2. **Given** el servidor rechaza el guardado (red, 4xx), **Then** la fila
   vuelve a su lugar y se muestra el error.
3. **Given** Lucía, **When** intenta `PATCH /api/enrollments/[id]` (montos),
   **Then** 403: sigue sin `inscripciones.editar`.
4. **Given** un body con cualquier clave además de `invoiceNumber` (p. ej.
   `amount`), **Then** 422 y no se escribe nada.

### US2 — Corregir o borrar una factura (P1)

1. **Given** la pestaña Facturadas, **When** Lucía cambia el número y toca
   «Corregir», **Then** se guarda y se re-estampa el autor.
2. **Given** un número cargado en la venta equivocada, **When** vacía el
   campo y toca «Corregir», **Then** el número queda NULL, el autor registra
   quién lo borró y la venta vuelve a Pendientes.
3. **Given** el mismo número que ya tenía, **Then** no se escribe nada (no se
   re-estampa un autor de algo que no cambió).

### US3 — Número repetido (P2)

1. **Given** `F-9` ya está en la venta de otra persona sin empresa en común,
   **When** Lucía lo anota, **Then** se guarda igual y se muestra el aviso
   «Ese número de factura ya está en la venta de Bruno Gómez…».
2. **Given** una factura de empresa que cubre a dos empleados de ACME,
   **Then** no hay aviso.
3. **Given** la misma persona con dos cursadas en una sola factura, **Then**
   no hay aviso.

### US4 — Recibo de un pago (P2)

1. **Given** un pago registrado sin recibo, **When** alguien con
   `facturacion.editar` toca «anotar recibo» en Cuotas y pagos (roster de la
   cohorte) y escribe `R-77`, **Then** se guarda en `payment.receipt_number`
   con autor.
2. **Given** un pago anulado, **Then** 409 `pago_anulado` y no se toca.

### US5 — La pantalla y el correo no discrepan (P1)

**Given** cualquier conjunto de inscripciones de una cohorte, la pestaña
Pendientes (filtrada por esa cohorte) y el aviso T-7/T-2 listan las mismas
ventas: las dos usan `pendienteDeFacturar`.

### US6 — Ventas sigue sin plata (P1)

Ventas no tiene `cobranza.ver` ni `facturacion.editar`: no ve el ítem
Facturación, `GET /api/facturacion` le responde 403 y ninguna de sus rutas
importa `@/server/facturacion`.

## Reglas

### Quién está en la pantalla

- **Venta** = `esVentaParaAviso` (041, igual que `exigeVendedor`): inscripción
  MADRE (`parent_enrollment_id` NULL) con cohorte, y el curso no es un taller.
  Un lead no se factura todavía; una hija tiene la plata en su madre; un
  taller tiene su circuito (033).
- **Pendientes** = venta ∧ `pendienteDeFacturar`: contacto activo
  (`contact.archived_at` NULL), no hija, sin número (vacío o solo espacios
  cuenta como sin número). Es la regla de `sinFacturar` del aviso de 039, que
  ahora es literalmente `filas.filter(pendienteDeFacturar)`.
- **Facturadas** = venta ∧ contacto activo ∧ con número.
- No se acota por fecha: una venta vieja sin factura sigue pendiente hasta que
  alguien la factura. Los filtros sirven para acotar.

### Número

- Se guarda recortado (`trim`). Vacío o solo espacios = borrar (permitido:
  es una corrección). Máx. 120 caracteres (igual que la ruta comercial).
- El autor (`invoice_recorded_at/_by`) se estampa SOLO cuando el número
  cambia. También lo estampa la ruta comercial (`inscripciones.editar`) si el
  número cambia por ahí: el formulario comercial manda todos los campos en
  cada guardado, así que se resuelve con un `case` en el `UPDATE` que compara
  contra la fila vieja.
- No hay fecha de factura propia: la fecha del documento vive en el sistema
  contable, y `invoice_recorded_at` responde "cuándo se anotó acá", que es lo
  que sirve para revisar una corrección.
- Una inscripción hija responde 422 `factura_en_la_madre`.

### Número repetido — avisa, no bloquea

Se busca el mismo número (sin mayúsculas ni espacios de borde) en otras
inscripciones de la organización. Es sospechoso si es de **otra persona** y
**no comparten empresa**. Se guarda igual y la respuesta trae `aviso`.
Bloquear dejaría sin salida el caso legítimo (factura de empresa por varios
empleados) que el sistema no sabe distinguir de un error.

### Recibo

Es del PAGO (`payment.receipt_number`, DV-006 de 008). `enrollment.receipt_number`
queda como legado de 005, editable solo por la ruta comercial; 042 no lo toca
ni lo muestra en la pantalla nueva. Un pago anulado no se modifica (409).

### Visibilidad

- Pantalla, ítem del menú y `GET /api/facturacion`: **`cobranza.ver`**. Cada
  fila lleva el monto pactado, que es el dato que esa capacidad gobierna
  (igual que Finanzas). Un rol armado a mano con `facturacion.editar` sin
  `cobranza.ver` puede anotar números por la API, pero no ve la lista (ni el
  bloque de Cuotas y pagos, que también es de `cobranza.ver`): un monto
  que se muestra sin la capacidad que lo autoriza es un dato que se filtró.
  Todos los roles de sistema que tienen una tienen la otra.
- La acción en línea (campo + botón) solo aparece con `facturacion.editar`.

### Totales y CSV

- Un total por moneda (orden de `CURRENCIES`) y la cantidad de ventas sin
  monto pactado aparte. Nunca un total general.
- El CSV es la lista filtrada que se ve, armado en el navegador (no hay ruta
  `text/csv` nueva que pueda traer más que la pantalla), con la misma
  protección anti-fórmulas de los otros exports (`csvField`, ahora en
  `src/lib/csv.ts`). Monto y moneda en columnas separadas, sin fila de total.

## Requisitos funcionales

- **FR-001** Capacidad `facturacion.editar` en la lista cerrada; en
  `SYSTEM_ROLES` para dirección, coordinación y administración; fuera de
  soporte (semilla y respaldo) y de ventas; owner/member la tienen.
- **FR-002** `PATCH /api/enrollments/[id]/invoice` (`facturacion.editar`),
  body `{ invoiceNumber: string | null }` estricto.
- **FR-003** `PATCH /api/payments/[id]/receipt` (`facturacion.editar`), body
  `{ receiptNumber: string | null }` estricto.
- **FR-004** `GET /api/facturacion?estado=pendientes|facturadas` (`cobranza.ver`).
- **FR-005** Pantalla `/facturacion` con filtros (cohorte, rango de inicio,
  solo confirmadas, con/sin empresa), pestañas Pendientes/Facturadas, acción
  optimista con vuelta atrás, totales por moneda y CSV.
- **FR-006** Migración 0063: `invoice_recorded_at/_by` en `enrollment`,
  `receipt_recorded_at/_by` en `payment`, y `facturacion.editar` a los roles
  de sistema existentes (por llave).
- **FR-007** Etiqueta en Ajustes → Roles y entrada en la guía.

## Fuera de alcance

- Emitir la factura (la academia factura en su sistema contable).
- Fecha de emisión, serie o importe de la factura.
- Darle `facturacion.editar` a los roles creados a mano (se la suma el dueño
  desde Ajustes → Roles; nadie pierde nada: quien tenía `inscripciones.editar`
  sigue pudiendo cargarla por la ruta comercial).
- Recibos de pagos de talleres desde la pantalla del taller (el panel de
  Cuotas y pagos del taller no recibe el permiso todavía).
- Prueba E2E (decisión del dueño).
