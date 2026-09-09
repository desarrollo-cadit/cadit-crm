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
  "certificados.emitir",
  // Comercial y financiero
  "contactos.ver",
  "contactos.editar",
  "inscripciones.ver",
  "inscripciones.editar",
  "cobranza.ver",
  "cobranza.editar",
  // Conversaciones
  "inbox.ver",
  "inbox.responder",
  // Plataforma
  "configuracion.editar",
  "accesos.gestionar",
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
  soporte: CAPABILITIES.filter((c) => !FINANCIAL_CAPABILITIES.includes(c)),
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
    capabilities: CAPABILITIES.filter((c) => c !== "configuracion.editar"),
  },
  {
    key: "soporte",
    name: "Soporte",
    capabilities: CAPABILITIES.filter((c) => !FINANCIAL_CAPABILITIES.includes(c)),
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
    capabilities: ["cobranza.ver", "inscripciones.ver", "academico.ver", "contactos.ver"],
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
