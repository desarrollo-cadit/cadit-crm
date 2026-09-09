import { asc, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { CURRENCIES, type Currency } from "@/lib/db/schema";
import { scoped } from "@/lib/db/tenant";
import { classInstant, monthInZone } from "@/lib/schedule-time";
import { installmentStatus, type InstallmentStatus } from "@/server/billing";

/**
 * 026 — El cierre de un período: lo que hay que transcribir a la contabilidad.
 *
 * **Esto no es un panel: es una planilla que una persona copia a mano.** La
 * academia lleva la contabilidad en Bit, un sistema que no controlamos, y la
 * decisión del dueño es que la salida sea una pantalla y no un archivo con
 * formato. Un export es un contrato con un importador ajeno: el día que
 * cambie, el código se rompe en cierre de mes, que es el peor momento posible.
 *
 * Tres reglas gobiernan todo el módulo y ninguna es negociable:
 *
 * 1. **Caja y devengado no se mezclan.** Caja mira `payment.paid_at` —la
 *    plata que ENTRÓ—; devengado mira `installment.due_date` —lo que se
 *    EMITIÓ, cobrado o no—. Una cuota de agosto cobrada en septiembre está en
 *    el devengado de agosto Y en la caja de septiembre: no es una
 *    inconsistencia, es la definición. Por eso no hay ninguna operación que
 *    las combine: ni suma, ni resta, ni "diferencia".
 * 2. **Nunca se mezclan monedas.** Cada total se declara con su moneda, los
 *    bloques van en el orden fijo de `CURRENCIES`, y **no existe un total
 *    general** — no es que se muestre en cero: no es representable. Ya hubo un
 *    bug real de totales cruzados (corregido en `17e4844`), y acá pesa más que
 *    en el dashboard: un contador que transcribe un total de tres monedas
 *    carga basura en Bit y nadie se entera hasta el cierre del ejercicio.
 * 3. **El orden es parte del contrato.** Toda ordenación desempata por `id`.
 *    Sin eso, dos filas del mismo instante pueden salir en distinto orden
 *    entre dos cargas, y quien volvió a la pantalla saltea una o copia otra
 *    dos veces.
 *
 * DV-001 — **No se persiste ninguna marca de "transcrito".** La propuesta era
 * guardar qué fila se marcó, quién y cuándo; se resolvió por la alternativa
 * barata: el contador acota por rango de fechas (del 1 al 15, después del 16
 * al 31). Cuesta cero código y resuelve la mayor parte del problema. Si algún
 * día se pide la marca, va acá: una tabla de dominio con `organization_id`,
 * su política `tenant_isolation` escrita a mano en la migración, y endpoints
 * de marcar/desmarcar con su capacidad y su 403. No es una casilla: es media
 * fase, y por eso quedó deliberadamente postergada.
 */

/* ============================================================
 * El período (FR-018, DV-002)
 * ============================================================ */

export type Periodo = {
  /** `"2026-08"`, la etiqueta con la que se pide y se comparte. */
  mes: string;
  /** Primer instante del mes en la zona de la organización. */
  desde: Date;
  /** Primer instante del mes SIGUIENTE: el fin es exclusivo. */
  hasta: Date;
  /** `"Agosto 2026"`, para el encabezado. */
  etiqueta: string;
  /**
   * La zona en la que se resolvieron los límites. Viaja hasta la pantalla
   * porque las fechas de cada fila se muestran en la zona de la academia: un
   * cobro del 31 de agosto a las 23:00 en Montevideo es 1° de septiembre en
   * UTC, y mostrarlo así lo pondría en el mes equivocado a los ojos de quien
   * transcribe, aunque el total esté bien.
   */
  timezone: string;
};

/**
 * Los nombres se escriben acá y no se piden a `Intl` a propósito: el resultado
 * de `toLocaleDateString` depende de los datos de locale del runtime, y una
 * pantalla contable no puede decir "August" porque el contenedor se quedó sin
 * ICU completo.
 */
const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const MES_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** El mes anterior a `"2026-01"` es `"2025-12"`. */
function mesAnterior(mes: string): string {
  const m = MES_RE.exec(mes);
  if (!m) return mes;
  const año = Number(m[1]);
  const numero = Number(m[2]);
  return numero === 1
    ? `${año - 1}-12`
    : `${año}-${String(numero - 1).padStart(2, "0")}`;
}

/**
 * 026 (FR-018) — Los límites del período, resueltos en la zona horaria de la
 * organización.
 *
 * "Agosto" en UTC empieza el 31 de julio a las 21:00 en Montevideo. La
 * diferencia son los pagos de la última noche del mes, que es cuando más se
 * paga: con los límites en UTC esos cobros se caen de un mes y aparecen en el
 * otro, y el descuadre se descubre transcribiendo.
 *
 * La composición la hace `classInstant` (013/FR-010b), que es **el único lugar
 * del sistema que arma un instante a partir de un día y una hora de pared**.
 * No se escribe una segunda resolución de zona horaria acá.
 *
 * DV-002 — Sin mes elegido abre en el mes ANTERIOR, que es el que se cierra.
 * Abrir en el mes en curso invita a transcribir un período que todavía se
 * está moviendo.
 */
export function resolverPeriodo(
  mes: string | null | undefined,
  timezone: string,
  ahora: Date = new Date()
): Periodo {
  const enCurso = monthInZone(ahora, timezone) ?? monthInZone(ahora, "UTC")!;
  const elegido = mes && MES_RE.test(mes) ? mes : mesAnterior(enCurso);

  const m = MES_RE.exec(elegido)!;
  const año = Number(m[1]);
  const numero = Number(m[2]);

  const primerDia = new Date(Date.UTC(año, numero - 1, 1));
  const primerDiaSiguiente = new Date(Date.UTC(año, numero, 1));

  /**
   * Si la zona de la organización estuviera mal cargada, `classInstant`
   * devuelve `null`. Se cae a UTC en vez de tirar la pantalla: un cierre
   * corrido tres horas es un problema; una pantalla en 500 el día del cierre
   * es otro peor.
   */
  const desde = classInstant(primerDia, "00:00", timezone) ?? primerDia;
  const hasta = classInstant(primerDiaSiguiente, "00:00", timezone) ?? primerDiaSiguiente;

  return {
    mes: elegido,
    desde,
    hasta,
    etiqueta: `${MESES[numero - 1]} ${año}`,
    timezone,
  };
}

/* ============================================================
 * La forma de las filas
 * ============================================================ */

export type MetodoPago = "efectivo" | "transferencia" | "tarjeta" | "otro";

/** Un pago tal como sale de la base, antes de decidir dónde va. */
export type PagoDelPeriodo = {
  id: string;
  paidAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
  amount: number;
  currency: Currency;
  method: MetodoPago;
  receiptNumber: string | null;
  alumno: string;
  cohorte: string;
  curso: string;
};

/** Una cuota tal como sale de la base, con sus pagos ya imputados. */
export type CuotaDelPeriodo = {
  id: string;
  numero: number;
  dueDate: Date;
  canceledAt: Date | null;
  amount: number;
  pagado: number;
  currency: Currency;
  alumno: string;
  cohorte: string;
  curso: string;
};

/** FR-011 — Lo que el contador copia de un cobro. */
export type FilaCaja = {
  id: string;
  fecha: string;
  alumno: string;
  cohorte: string;
  curso: string;
  metodo: MetodoPago;
  importe: number;
  currency: Currency;
  recibo: string | null;
};

/** FR-015 — Lo que el contador copia de una cuota emitida. */
export type FilaDevengado = {
  id: string;
  vencimiento: string;
  numero: number;
  alumno: string;
  cohorte: string;
  curso: string;
  importe: number;
  pagado: number;
  saldo: number;
  estado: InstallmentStatus;
  currency: Currency;
};

/** DV-004 — La anulación, con su motivo, en su propia lista. */
export type FilaAnulada = {
  id: string;
  fecha: string;
  anuladoEl: string;
  alumno: string;
  cohorte: string;
  curso: string;
  importe: number;
  currency: Currency;
  motivo: string | null;
};

export type BloqueCaja = {
  currency: Currency;
  filas: FilaCaja[];
  /** El total de ESTA moneda. No existe ningún otro. */
  total: number;
};

export type BloqueDevengado = {
  currency: Currency;
  filas: FilaDevengado[];
  totalEmitido: number;
  totalPagado: number;
  totalSaldo: number;
};

export type Cierre = {
  periodo: Periodo;
  caja: BloqueCaja[];
  devengado: BloqueDevengado[];
  anulados: FilaAnulada[];
};

/* ============================================================
 * El criterio, sin base de datos
 * ============================================================ */

/**
 * Agrupa por moneda en el orden FIJO de `CURRENCIES` y **descarta los bloques
 * vacíos**.
 *
 * El orden fijo evita que la pantalla se reordene mes a mes según qué moneda
 * vendió: quien transcribe todos los meses aprende dónde mirar. Y una tabla
 * vacía con un total en cero se transcribe igual de mal que un número errado,
 * así que la moneda sin movimiento no dibuja nada.
 */
function porMoneda<F extends { currency: Currency }, B>(
  filas: F[],
  armar: (currency: Currency, deEsaMoneda: F[]) => B
): B[] {
  const bloques: B[] = [];
  for (const currency of CURRENCIES) {
    const deEsaMoneda = filas.filter((f) => f.currency === currency);
    if (deEsaMoneda.length === 0) continue;
    bloques.push(armar(currency, deEsaMoneda));
  }
  return bloques;
}

/**
 * FR-010/FR-012 — Los cobros del período, por moneda.
 *
 * Un pago anulado no aparece: no entró. Y el orden es `paid_at` ascendente
 * **con desempate explícito por `id`**: sin él, dos pagos del mismo instante
 * pueden salir distinto entre dos cargas.
 */
export function armarCaja(pagos: readonly PagoDelPeriodo[]): BloqueCaja[] {
  const filas = pagos
    .filter((p) => p.voidedAt === null)
    .map(
      (p): FilaCaja => ({
        id: p.id,
        fecha: p.paidAt.toISOString(),
        alumno: p.alumno,
        cohorte: p.cohorte,
        curso: p.curso,
        metodo: p.method,
        importe: p.amount,
        currency: p.currency,
        recibo: p.receiptNumber,
      })
    )
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));

  return porMoneda(filas, (currency, deEsaMoneda) => ({
    currency,
    filas: deEsaMoneda,
    // El total sale de las filas de ESTE bloque y de ninguna otra (FR-022).
    total: deEsaMoneda.reduce((s, f) => s + f.importe, 0),
  }));
}

/**
 * FR-013/FR-014/FR-015 (DV-003) — Las cuotas emitidas para el período.
 *
 * Una cuota anulada no figura: no se devengó. El estado es el que ya calcula
 * `installmentStatus` —`pagada`, `parcial`, `vencida`, `pendiente`—: **no se
 * inventa un vocabulario paralelo**, porque un modelo de tres valores pierde
 * `parcial`, que es justamente el caso donde caja y devengado divergen.
 *
 * DV-003 — Orden por vencimiento (la transcripción es cronológica), desempate
 * por alumno y, a igual alumno, por `id`.
 */
export function armarDevengado(
  cuotas: readonly CuotaDelPeriodo[],
  ahora: Date = new Date()
): BloqueDevengado[] {
  const filas = cuotas
    .filter((c) => c.canceledAt === null)
    .map(
      (c): FilaDevengado => ({
        id: c.id,
        vencimiento: c.dueDate.toISOString(),
        numero: c.numero,
        alumno: c.alumno,
        cohorte: c.cohorte,
        curso: c.curso,
        importe: c.amount,
        pagado: c.pagado,
        saldo: Math.max(0, c.amount - c.pagado),
        estado: installmentStatus(c.amount, c.pagado, c.dueDate, ahora),
        currency: c.currency,
      })
    )
    .sort(
      (a, b) =>
        a.vencimiento.localeCompare(b.vencimiento) ||
        a.alumno.localeCompare(b.alumno, "es") ||
        a.id.localeCompare(b.id)
    );

  return porMoneda(filas, (currency, deEsaMoneda) => ({
    currency,
    filas: deEsaMoneda,
    totalEmitido: deEsaMoneda.reduce((s, f) => s + f.importe, 0),
    totalPagado: deEsaMoneda.reduce((s, f) => s + f.pagado, 0),
    totalSaldo: deEsaMoneda.reduce((s, f) => s + f.saldo, 0),
  }));
}

/**
 * DV-004 — Las anulaciones del período, en un tercer listado, chico y
 * explícitamente aparte. **Nunca mezcladas con Caja.**
 *
 * Existe porque un pago que se transcribió y después se anuló hay que poder
 * encontrarlo: no va en Caja (FR-010, no entró), pero desaparecer del todo
 * deja al contador sin explicación para un asiento que ya cargó.
 */
export function armarAnulados(pagos: readonly PagoDelPeriodo[]): FilaAnulada[] {
  return pagos
    .filter((p) => p.voidedAt !== null)
    .map(
      (p): FilaAnulada => ({
        id: p.id,
        fecha: p.paidAt.toISOString(),
        anuladoEl: p.voidedAt!.toISOString(),
        alumno: p.alumno,
        cohorte: p.cohorte,
        curso: p.curso,
        importe: p.amount,
        currency: p.currency,
        motivo: p.voidReason,
      })
    )
    .sort((a, b) => a.anuladoEl.localeCompare(b.anuladoEl) || a.id.localeCompare(b.id));
}

/** Un período sin movimiento. Tres listas vacías, y ningún total inventado. */
export function cierreVacio(periodo: Periodo): Cierre {
  return { periodo, caja: [], devengado: [], anulados: [] };
}

/* ============================================================
 * La lectura
 * ============================================================ */

/** La zona horaria de la organización, o Montevideo si la fila no está. */
export async function organizationTimezone(organizationId: string): Promise<string> {
  const rows = await getDb()
    .select({ timezone: schema.organization.timezone })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  return rows[0]?.timezone ?? "America/Montevideo";
}

const nombre = (first: string | null, last: string | null) =>
  [first, last].filter(Boolean).join(" ").trim();

/**
 * 026 — El cierre completo de un período: Caja, Devengado y las anulaciones.
 *
 * Las tres listas salen de la MISMA resolución de período: pedirlas por
 * separado abriría la puerta a que una se arme con agosto y la otra con
 * septiembre si el usuario cambia el filtro entre dos pedidos.
 *
 * DV-005 — El filtro por cohorte es opcional y se aplica encima del período.
 * El cierre es por período, pero cuando algo no cuadra la pregunta siguiente
 * siempre es "¿de qué camada era?".
 */
export async function cierreDePeriodo(
  organizationId: string,
  opciones: { mes?: string | null; cohortId?: string | null } = {},
  ahora: Date = new Date()
): Promise<Cierre> {
  const db = getDb();
  const timezone = await organizationTimezone(organizationId);
  const periodo = resolverPeriodo(opciones.mes, timezone, ahora);
  const cohortId = opciones.cohortId ?? null;

  /**
   * Los pagos del período, anulados incluidos: la separación la hace
   * `armarCaja` / `armarAnulados` sobre las mismas filas, así que una fila no
   * puede caer en las dos listas ni desaparecer de ambas.
   *
   * `paid_at` y no `created_at` (FR-010): la caja de agosto es la plata que
   * entró en agosto, aunque se haya cargado en septiembre.
   */
  const pagos = await db
    .select({
      id: schema.payment.id,
      paidAt: schema.payment.paidAt,
      voidedAt: schema.payment.voidedAt,
      voidReason: schema.payment.voidReason,
      amount: schema.payment.amount,
      currency: schema.payment.currency,
      method: schema.payment.method,
      receiptNumber: schema.payment.receiptNumber,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      cohorte: schema.cohort.name,
      curso: schema.course.name,
    })
    .from(schema.payment)
    .innerJoin(schema.enrollment, eq(schema.payment.enrollmentId, schema.enrollment.id))
    .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .where(
      scoped(
        schema.payment.organizationId,
        organizationId,
        gte(schema.payment.paidAt, periodo.desde),
        lt(schema.payment.paidAt, periodo.hasta),
        cohortId ? eq(schema.cohort.id, cohortId) : undefined
      )
    )
    .orderBy(asc(schema.payment.paidAt), asc(schema.payment.id));

  /**
   * Las cuotas del período por `due_date`, sin las anuladas (FR-013).
   *
   * Se piden las vigentes en la consulta y `armarDevengado` vuelve a filtrar:
   * la regla vive en la función pura, que es la que está probada, y el
   * `where` sólo evita traer filas que se van a descartar.
   */
  const cuotas = await db
    .select({
      id: schema.installment.id,
      numero: schema.installment.number,
      dueDate: schema.installment.dueDate,
      canceledAt: schema.installment.canceledAt,
      amount: schema.installment.amount,
      currency: schema.installment.currency,
      enrollmentId: schema.installment.enrollmentId,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      cohorte: schema.cohort.name,
      curso: schema.course.name,
    })
    .from(schema.installment)
    .innerJoin(schema.enrollment, eq(schema.installment.enrollmentId, schema.enrollment.id))
    .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .where(
      scoped(
        schema.installment.organizationId,
        organizationId,
        isNull(schema.installment.canceledAt),
        gte(schema.installment.dueDate, periodo.desde),
        lt(schema.installment.dueDate, periodo.hasta),
        cohortId ? eq(schema.cohort.id, cohortId) : undefined
      )
    )
    .orderBy(asc(schema.installment.dueDate), asc(schema.installment.id));

  /**
   * Lo pagado de cada cuota sale de TODOS sus pagos no anulados, no sólo de
   * los del período: una cuota de agosto cobrada en septiembre figura como
   * `pagada` en el devengado de agosto. Ese es el caso que hace que caja y
   * devengado no coincidan, y esconderlo obliga a reconstruirlo a mano.
   */
  const pagosImputados =
    cuotas.length === 0
      ? []
      : await db
          .select({
            installmentId: schema.payment.installmentId,
            amount: schema.payment.amount,
          })
          .from(schema.payment)
          .where(
            scoped(
              schema.payment.organizationId,
              organizationId,
              isNull(schema.payment.voidedAt),
              isNotNull(schema.payment.installmentId)
            )
          );

  const pagadoPorCuota = new Map<string, number>();
  for (const p of pagosImputados) {
    if (!p.installmentId) continue;
    pagadoPorCuota.set(
      p.installmentId,
      (pagadoPorCuota.get(p.installmentId) ?? 0) + p.amount
    );
  }

  const pagosDelPeriodo: PagoDelPeriodo[] = pagos.map((p) => ({
    id: p.id,
    paidAt: p.paidAt,
    voidedAt: p.voidedAt,
    voidReason: p.voidReason,
    amount: p.amount,
    currency: p.currency,
    method: p.method,
    receiptNumber: p.receiptNumber,
    alumno: nombre(p.firstName, p.lastName),
    cohorte: p.cohorte ?? p.curso,
    curso: p.curso,
  }));

  const cuotasDelPeriodo: CuotaDelPeriodo[] = cuotas.map((c) => ({
    id: c.id,
    numero: c.numero,
    dueDate: c.dueDate,
    canceledAt: c.canceledAt,
    amount: c.amount,
    pagado: pagadoPorCuota.get(c.id) ?? 0,
    currency: c.currency,
    alumno: nombre(c.firstName, c.lastName),
    cohorte: c.cohorte ?? c.curso,
    curso: c.curso,
  }));

  return {
    periodo,
    caja: armarCaja(pagosDelPeriodo),
    devengado: armarDevengado(cuotasDelPeriodo, ahora),
    anulados: armarAnulados(pagosDelPeriodo),
  };
}
