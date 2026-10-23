/**
 * 012 (T002) — Capacidades: qué puede hacer cada rol, dicho una sola vez.
 *
 * Hasta acá la autorización era **una** comparación repartida por el código:
 * `role === "soporte"`. Alcanzaba con una audiencia y dos niveles de acceso.
 * Con alumnos y profesores entrando (fases 014 y 015), "quién puede qué" pasa
 * a tener demasiadas combinaciones para resolverlo con comparaciones sueltas.
 *
 * La lista es CERRADA y tipada a propósito (DV-003): el compilador rechaza una
 * capacidad inventada. Los roles, en cambio, serán configurables en base
 * (fase 4) — lo que se prueba vive en código, lo que se edita vive en la base.
 */

export const CAPABILITIES = [
  // Académico
  "academico.ver",
  "academico.editar",
  "asistencia.ver",
  "asistencia.editar",
  "evaluacion.ver",
  "evaluacion.editar",
  /**
   * 031 (DV-006) — Publicar la corrección que mandó un profesor en una
   * evaluación que "requiere aprobación". Quien además tiene
   * `evaluacion.editar` publica directo sus propias correcciones. Soporte no
   * la recibe (ver `sinAprobarCorrecciones`): aprobar una nota es decidir
   * sobre la cursada de un alumno.
   */
  "correcciones.aprobar",
  "certificados.emitir",
  /**
   * 039 — Confirmar (y quitar la confirmación de) una cohorte: "esta cohorte
   * sale". Dispara el aviso por correo a Soporte y habilita los avisos de
   * facturación a Administración 7 y 2 días antes del inicio. La reciben
   * `direccion` y `coordinacion`; soporte y administración no (ver
   * `sinConfirmarCohortes`): son quienes RECIBEN los avisos, no quienes
   * deciden que la cohorte arranca.
   */
  "cohortes.confirmar",
  // Comercial y financiero
  "contactos.ver",
  "contactos.editar",
  "inscripciones.ver",
  /**
   * 040 (DV-001) — Las escrituras del SEGUIMIENTO de una inscripción: mover
   * un lead de etapa, el checklist, el correo de T&C o de bienvenida y el
   * envío a toda la cohorte. Hasta 040 colgaban de `inscripciones.ver` (la
   * "arruga del vocabulario" que 012 dejó anotada): con el rol Ventas en
   * `inscripciones.ver`, un vendedor podía mandarle correos a una cohorte
   * entera. La migración 0061 se la suma a todo rol que tenía
   * `inscripciones.ver`, así que nadie pierde nada; Ventas no la recibe.
   */
  "inscripciones.seguimiento",
  "inscripciones.editar",
  "cobranza.ver",
  "cobranza.editar",
  /**
   * 040 (DV-003) — Crear y editar empresas: razón social, RUT, dirección
   * fiscal, contacto de facturación y condición de pago. La reciben
   * dirección, coordinación, administración (completa los datos con los que
   * factura) y ventas; soporte no (ver `sinEmpresas`).
   */
  "empresas.editar",
  /**
   * 042 — Registrar los DOCUMENTOS de una venta y nada más: el número de
   * factura de la inscripción y el número de recibo de un pago (el recibo es
   * del PAGO, DV-006 de 008). No cambia montos, moneda, cuotas, pagos,
   * descuentos ni ningún otro dato: tiene sus propias rutas
   * (`/api/enrollments/[id]/invoice`, `/api/payments/[id]/receipt`), con
   * bodies estrictos. Es lo que le faltaba a Administración, que transcribe y
   * no cobra (026). La reciben dirección, coordinación y administración;
   * soporte y ventas no (ver `sinFacturacion`).
   *
   * NO está en FINANCIAL_CAPABILITIES: esa lista cambia el texto del 403 de
   * las rutas de plata, y esta capacidad no abre ninguna.
   */
  "facturacion.editar",
  // Conversaciones
  "inbox.ver",
  "inbox.responder",
  // Plataforma
  "configuracion.editar",
  "accesos.gestionar",
  /**
   * 2026-10-07 — La pestaña «Administración» del legajo: ingresos al portal
   * (fecha, IP, dispositivo), progreso en cursos offline, la línea de tiempo
   * de interacciones y el registro de actividad. Es AUDITORÍA sobre una
   * persona, no gestión de la cursada: por eso no la heredan coordinación ni
   * soporte (ver `sinAuditoria`).
   */
  "alumnos.auditoria",
  /**
   * 029 (DV-003) — Configurar las áreas de derivación del agente: a qué
   * casilla van las consultas de Ventas y Soporte, con qué copias y qué se le
   * dice al cliente. Es decisión de quien dirige, no de quien configura
   * WhatsApp: por eso es propia y no reusa `configuracion.editar`. Solo la
   * recibe `direccion` (ver `sinAreas`).
   */
  "areas.configurar",
  /**
   * 030 (DV-009) — Grabaciones de Zoom. `.ver`: la sección, la tabla, copiar
   * y abrir enlaces, ver el código de acceso. `.gestionar`: sincronizar y
   * adjudicar grabaciones a clases. Separadas para que soporte pueda pasarle
   * un enlace a un alumno sin mover adjudicaciones (ver `sinGestionarGrabaciones`).
   */
  "grabaciones.ver",
  "grabaciones.gestionar",
  /**
   * 045 (DV-014) — Campañas de marketing por correo (constitución 1.8.0).
   * `.ver`: la sección Marketing, audiencias, campañas, destinatarios y
   * métricas — lista nombre y correo de cientos de contactos, por eso no es de
   * soporte ni de administración. `.enviar`: crear y editar audiencias y
   * campañas, subir imágenes, la prueba, enviar y cancelar (P-02: sin
   * aprobación previa). `.configurar`: el buzón, el remitente y el pie, y
   * revertir una baja (deshace una oposición expresa): solo dirección.
   */
  "marketing.ver",
  "marketing.enviar",
  "marketing.configurar",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Capacidades que hoy están vedadas a `soporte`.
 *
 * Es EXACTAMENTE la superficie financiera: las 9 rutas de inscripciones,
 * cuotas, pagos, estado de cuenta, finanzas y morosidad. Ni una más — agregar
 * alguna acá le quitaría a soporte algo que hoy hace.
 *
 * Se exporta porque el 403 de esas rutas dice "Sin acceso a datos
 * financieros" y no el genérico (ver `requireCapability` en `lib/api.ts`):
 * ese texto es el que el usuario venía leyendo y la fase 2 no lo cambia.
 */
export const FINANCIAL_CAPABILITIES: readonly Capability[] = [
  "inscripciones.editar",
  "cobranza.ver",
  "cobranza.editar",
];

/**
 * 2026-10-07 — `alumnos.auditoria` solo se otorga a quien dirige.
 *
 * Muestra desde qué IP y qué dispositivo entra cada alumno. No hace falta
 * para dar clases ni para cobrar, así que entra solo en `direccion` (y en
 * `owner`/`member` del respaldo, que hoy pueden todo). Quien la necesite en
 * otro rol se la otorga el dueño desde `/settings/roles`.
 */
const sinAuditoria = (c: Capability) => c !== "alumnos.auditoria";

/**
 * 029 (DV-003) — `areas.configurar` también es solo de quien dirige: decide a
 * qué casilla van las consultas comerciales y quién va en copia. Coordinación,
 * soporte y administración no la reciben; el dueño la reparte si quiere.
 */
const sinAreas = (c: Capability) => c !== "areas.configurar";

/**
 * 030 (DV-009) — Soporte VE las grabaciones (le pasa el enlace a un alumno)
 * pero no las sincroniza ni las adjudica: mover una grabación de clase cambia
 * lo que ven los alumnos de una cohorte entera, y eso es de coordinación.
 */
const sinGestionarGrabaciones = (c: Capability) => c !== "grabaciones.gestionar";

/**
 * 031 (DV-006) — Soporte no aprueba correcciones: publicar una nota es de
 * quien coordina la cursada, igual que adjudicar grabaciones.
 */
const sinAprobarCorrecciones = (c: Capability) => c !== "correcciones.aprobar";

/**
 * 039 — Soporte no confirma cohortes: confirmar es decidir que la cohorte
 * sale, y el aviso de esa decisión le llega justamente a soporte.
 */
const sinConfirmarCohortes = (c: Capability) => c !== "cohortes.confirmar";

/**
 * 040 (DV-003) — Soporte no edita empresas: los datos de facturación los
 * cargan quien vende, quien coordina y quien factura.
 */
const sinEmpresas = (c: Capability) => c !== "empresas.editar";

/**
 * 042 — Soporte no registra facturas ni recibos: no ve la cobranza, y un
 * número de factura sin la venta que documenta no se puede verificar.
 */
const sinFacturacion = (c: Capability) => c !== "facturacion.editar";

/**
 * 045 (DV-014) — Coordinación ve y envía campañas pero no configura el buzón
 * ni revierte bajas: eso es de quien dirige.
 */
const sinConfigurarMarketing = (c: Capability) => c !== "marketing.configurar";

/**
 * 045 (DV-014) — Soporte no recibe nada de marketing: `marketing.ver` lista
 * nombre y correo de cientos de contactos. El dueño la reparte si quiere.
 */
const sinMarketing = (c: Capability) => !c.startsWith("marketing.");

/**
 * Mapeo rol → capacidades, FIEL al comportamiento actual.
 *
 * Cuidado con `member`: el data-model de la fase lo proyectaba como
 * "coordinación, todas menos configuración". Pero en el código de hoy la
 * ÚNICA comparación de rol es `role === "soporte"` — es decir, `owner` y
 * `member` son indistinguibles y los dos pueden todo. Aplicar la proyección
 * acá le quitaría configuración a un usuario existente sin que nadie lo
 * pidiera, y esta fase no puede cambiar comportamiento (plan.md).
 *
 * La distinción entre dirección y coordinación llega en la fase 4, cuando los
 * roles se editen desde la pantalla y sea el dueño quien decida.
 */
export const ROLE_CAPABILITIES: Record<string, readonly Capability[]> = {
  owner: CAPABILITIES,
  member: CAPABILITIES,
  soporte: CAPABILITIES.filter(
    (c) =>
      !FINANCIAL_CAPABILITIES.includes(c) &&
      sinAuditoria(c) &&
      sinAreas(c) &&
      sinGestionarGrabaciones(c) &&
      sinAprobarCorrecciones(c) &&
      sinConfirmarCohortes(c) &&
      sinEmpresas(c) &&
      sinFacturacion(c) &&
      sinMarketing(c)
  ),
};

/**
 * Un rol desconocido no recibe NADA (FR-008: fallar cerrado).
 *
 * Es deliberado: si mañana alguien agrega un rol en la base y se olvida de
 * mapearlo, la consecuencia es que no puede hacer nada —visible y molesta al
 * instante— en vez de poder todo, que no se nota hasta que es tarde.
 */
export function capabilitiesFor(role: string): readonly Capability[] {
  return ROLE_CAPABILITIES[role] ?? [];
}

/**
 * 012 (T018, DV-006) — Los roles de sistema que se siembran en la base.
 *
 * Estos son el punto de PARTIDA, no la verdad permanente: desde la fase 4 la
 * base manda y la pantalla de configuración los edita. El código queda como
 * respaldo para una organización sin sembrar.
 *
 * `soporte` es "todas menos las tres financieras" —lo mismo que hace hoy— y
 * no la proyección más restrictiva que traía el data-model. Ver la corrección
 * registrada ahí: la resolución de DV-006 dice "sin capacidades financieras,
 * como hoy", y aplicar la otra le sacaba siete capacidades a dos cuentas
 * reales sin que nadie lo pidiera.
 */
export const SYSTEM_ROLES: readonly {
  key: string;
  name: string;
  capabilities: readonly Capability[];
}[] = [
  { key: "direccion", name: "Dirección", capabilities: CAPABILITIES },
  {
    key: "coordinacion",
    name: "Coordinación",
    capabilities: CAPABILITIES.filter(
      (c) =>
        c !== "configuracion.editar" &&
        sinAuditoria(c) &&
        sinAreas(c) &&
        sinConfigurarMarketing(c)
    ),
  },
  {
    key: "soporte",
    name: "Soporte",
    capabilities: CAPABILITIES.filter(
      (c) =>
        !FINANCIAL_CAPABILITIES.includes(c) &&
        sinAuditoria(c) &&
        sinAreas(c) &&
        sinGestionarGrabaciones(c) &&
        sinAprobarCorrecciones(c) &&
        sinConfirmarCohortes(c) &&
        sinEmpresas(c) &&
        sinFacturacion(c) &&
        sinMarketing(c)
    ),
  },
  /**
   * 026 (FR-001) — Administración: 4 de las 17, y cada exclusión tiene motivo.
   *
   * La regla que las eligió es concreta: **entra la capacidad sin la cual la
   * fila no se puede leer, y ninguna más.**
   *
   * - `cobranza.ver` es el dato; sin ella no hay pantalla.
   * - `inscripciones.ver`: una cuota no significa nada sin la inscripción que
   *   la originó —monto pactado, moneda, plan—.
   * - `academico.ver` y `contactos.ver`: sin ellas la fila dice `ct_…` y un
   *   id de cohorte, que no se transcribe a ningún lado.
   *
   * Lo que queda AFUERA y por qué, porque es la parte que importa:
   * `cobranza.editar` —administración transcribe, no cobra: un rol que puede
   * editar la plata "por las dudas" es el que anula un pago para que un total
   * cuadre—; `inscripciones.editar` —cambiar el monto de una inscripción
   * reescribe el devengado del período que se está copiando—; `inbox.*` —las
   * conversaciones de 340 alumnos no aportan a ningún asiento—;
   * `accesos.gestionar` —le permitiría concederse a sí misma cualquier otra
   * capacidad, y un rol que reescribe su propio permiso no tiene un permiso:
   * los tiene todos—.
   *
   * El costo asumido de `academico.ver` y `contactos.ver` es que también
   * abren `/academico`, `/calendar`, `/contacts` y `/empresas` en lectura. La
   * alternativa —un DTO de finanzas que lleve los nombres sin exigir la
   * capacidad— ya se rechazó dos veces (014/FR-008, 015): un dato que se
   * muestra sin una capacidad que lo autorice es un dato que se filtró.
   */
  {
    key: "administracion",
    name: "Administración",
    capabilities: [
      "cobranza.ver",
      "inscripciones.ver",
      "academico.ver",
      "contactos.ver",
      // 040 (DV-003) — Completa los datos con los que factura a una empresa.
      "empresas.editar",
      // 040 (DV-001) — Lo que ya hacía con `inscripciones.ver`: nadie pierde nada.
      "inscripciones.seguimiento",
      // 042 — Registra el número de factura y de recibo; no toca montos ni pagos.
      "facturacion.editar",
    ],
  },
  /**
   * 040 (FR-001) — Ventas: ve TODO lo académico, en lectura, y nada de plata.
   *
   * - `academico.ver`, `asistencia.ver`, `evaluacion.ver`: la oferta, el
   *   cronograma, si una cohorte está confirmada y cómo va la cursada.
   * - `contactos.ver` e `inscripciones.ver`: quién está anotado en cada
   *   cohorte, el legajo y el Pipeline, en lectura. Ninguna de las dos arma
   *   montos: el roster, el legajo y los talleres preguntan por
   *   `cobranza.ver` antes de armar la plata (FR-016 de 005).
   * - `empresas.editar`: la única escritura — quien vende a una empresa es
   *   quien tiene sus datos.
   *
   * Lo que queda AFUERA es el requisito: toda capacidad financiera
   * (`cobranza.*`, `inscripciones.editar`), `inscripciones.seguimiento`
   * (correos y checklist), `cohortes.confirmar`, cualquier `.editar` de la
   * cursada, la Bandeja, la configuración y la auditoría.
   * `tests/unit/rol-ventas.test.ts` lo fija.
   */
  {
    key: "ventas",
    name: "Ventas",
    capabilities: [
      "academico.ver",
      "asistencia.ver",
      "evaluacion.ver",
      "contactos.ver",
      "inscripciones.ver",
      "empresas.editar",
      // 045 (P-02) — arma audiencias y campañas y las envía; no configura.
      "marketing.ver",
      "marketing.enviar",
    ],
  },
];

/**
 * 012 (T019) — Qué puede una sesión: la BASE si tiene el rol sembrado, el
 * código si no.
 *
 * Vive acá y no en `auth/session.ts` porque es lógica pura de capacidades: no
 * resuelve sesiones, decide entre dos fuentes. Cuando estaba allá, los tests
 * que mockean el módulo de sesión entero la dejaban `undefined` y el gate de
 * permisos respondía 500 — la función que decide quién entra no puede
 * depender de un módulo que se mockea por otros motivos.
 *
 * El parámetro se tipa por FORMA y no como `SessionContext` a propósito:
 * `session.ts` ya importa este archivo, y pedirle el tipo de vuelta cerraría
 * el círculo.
 */
export function sessionCapabilities(session: {
  role: string;
  capabilities?: readonly Capability[];
}): readonly Capability[] {
  return session.capabilities ?? capabilitiesFor(session.role);
}

/** Descarta capacidades que ya no existen en el código (lista cerrada, DV-003). */
export function sanitizeCapabilities(raw: unknown): Capability[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set<string>(CAPABILITIES);
  return raw.filter((c): c is Capability => typeof c === "string" && valid.has(c));
}

export function hasCapability(role: string, capability: Capability): boolean {
  return capabilitiesFor(role).includes(capability);
}
