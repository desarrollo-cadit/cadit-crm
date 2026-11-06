import { CURRENCIES, type Currency } from "@/lib/db/schema";
import { minorToCsv } from "@/lib/money";
import type { CourseKind } from "@/lib/course-kind";
import { esVentaParaAviso } from "@/lib/billing-notices";
import { csvField } from "@/lib/csv";
import { coincideConBusqueda } from "@/lib/contact-search";
import { estaFacturada, normalizarNumero, pendienteDeFacturar } from "@/lib/facturacion-regla";

/**
 * 042 — Facturación: las reglas puras.
 *
 * Administración recibe desde 039 la lista de quienes no tienen factura 7 y 2
 * días antes del inicio, y desde 041 cada venta nueva. Lo que no podía era
 * ANOTAR el número: eso colgaba de `inscripciones.editar`, que también cambia
 * montos. Esta fase le da `facturacion.editar` (solo documentos) y una
 * pantalla con lo que falta facturar.
 *
 * La regla central de este archivo es `pendienteDeFacturar`, y la usan los
 * DOS lados: el correo de T-7/T-2 (`sinFacturar` en `staff-notices.ts`) y la
 * pestaña Pendientes de la pantalla (`enLaVista`). Si cada lado tuviera la
 * suya, el correo diría "faltan 3" y la pantalla mostraría 2, y nadie sabría
 * cuál creer. `tests/unit/facturacion.test.ts` lo fija.
 */

/** Largo máximo del número (igual que la ruta comercial). */
export const MAX_NUMERO = 120;

export { estaFacturada, normalizarNumero, pendienteDeFacturar };

export type EstadoFacturacion = "pendientes" | "facturadas";

/**
 * ¿Esta inscripción va en la pantalla, en esta pestaña?
 *
 * Primero, que sea una VENTA (`esVentaParaAviso`, la misma regla que 041 y
 * que `exigeVendedor`): madre con cohorte y no de un taller. Un lead no se
 * factura todavía, una hija tiene la plata en su madre y un taller tiene su
 * propio circuito (033). Después, la pestaña:
 *
 * - Pendientes = `pendienteDeFacturar`, la regla del correo.
 * - Facturadas = las mismas ventas activas, con número: están para corregir.
 */
export function enLaVista(
  f: {
    cohortId: string | null;
    parentEnrollmentId: string | null;
    courseKind: CourseKind | null;
    deBaja: boolean;
    invoiceNumber: string | null;
  },
  estado: EstadoFacturacion
): boolean {
  if (!esVentaParaAviso(f)) return false;
  const pendiente = pendienteDeFacturar({
    deBaja: f.deBaja,
    esHija: f.parentEnrollmentId !== null,
    invoiceNumber: f.invoiceNumber,
  });
  if (estado === "pendientes") return pendiente;
  return !f.deBaja && estaFacturada(f.invoiceNumber);
}

/* ============================================================
 * La fila de la pantalla
 * ============================================================ */

export type EmpresaParaFacturar = {
  id: string;
  razonSocial: string;
  rut: string | null;
  billingEmail: string | null;
  /** "Contado", "Crédito a 30 días"… ya en castellano (`condicionDePago`). */
  condicion: string | null;
};

/**
 * 2026-11-06 — El cobro de una venta, para el seguimiento desde Facturación.
 * Se DERIVA de las cuotas y los pagos de siempre (`installment` / `payment`):
 * no hay un segundo registro. Sin `cobranza.ver` no viaja (la ruta ya lo exige).
 */
export type ResumenDeCobro = {
  /** Cuotas vigentes del plan (0 = todavía no hay plan). */
  cuotas: number;
  cuotasPagadas: number;
  /** Cuotas vencidas con saldo. */
  cuotasVencidas: number;
  /** Todo lo cobrado y no anulado, con o sin cuota asignada (una seña cuenta). */
  pagado: number;
  /** Lo pactado menos lo pagado; `null` si la venta no tiene monto. */
  saldo: number | null;
  estado: "sin_plan" | "al_dia" | "vencida" | "pagada";
};

/**
 * Resume el cobro de UNA venta. El saldo es pactado − pagado, sin mirar a qué
 * cuota se imputó cada pago: una seña cargada antes de armar el plan no baja
 * ninguna cuota, pero sí es plata que entró. `ahora` se inyecta para probar el
 * vencimiento sin el reloj de la máquina.
 */
export function resumenDeCobro(
  input: {
    pactado: number | null;
    cuotas: readonly { id: string; amount: number; dueDate: Date; canceledAt: Date | null }[];
    pagos: readonly { installmentId: string | null; amount: number; voidedAt: Date | null }[];
  },
  ahora: Date
): ResumenDeCobro {
  const vigentes = input.cuotas.filter((c) => !c.canceledAt);
  const validos = input.pagos.filter((p) => !p.voidedAt);
  const pagado = validos.reduce((s, p) => s + p.amount, 0);
  const saldo = input.pactado === null ? null : Math.max(0, input.pactado - pagado);

  const pagadoPorCuota = new Map<string, number>();
  for (const p of validos) {
    if (p.installmentId) {
      pagadoPorCuota.set(p.installmentId, (pagadoPorCuota.get(p.installmentId) ?? 0) + p.amount);
    }
  }
  const conSaldo = vigentes.filter((c) => (pagadoPorCuota.get(c.id) ?? 0) < c.amount);
  const cuotasVencidas = conSaldo.filter((c) => c.dueDate < ahora).length;

  const saldada = saldo !== null ? saldo === 0 && input.pactado! > 0 : false;
  const estado: ResumenDeCobro["estado"] = saldada
    ? "pagada"
    : vigentes.length === 0
      ? "sin_plan"
      : cuotasVencidas > 0
        ? "vencida"
        : "al_dia";

  return {
    cuotas: vigentes.length,
    cuotasPagadas: vigentes.length - conSaldo.length,
    cuotasVencidas,
    pagado,
    saldo,
    estado,
  };
}

/**
 * 2026-11-06 — La VENTA DE EMPRESA a la que pertenece una inscripción: una
 * titular lleva el total, las cuotas y los pagos de toda la empresa en el grupo
 * y las demás quedan cubiertas (`src/lib/venta-empresa.ts`). Viaja en la fila
 * de la titular Y en las de sus cubiertas, con el cobro de la venta.
 */
export type VentaDeEmpresaDeFila = {
  titularId: string;
  /** Esta fila ES la titular. */
  esTitular: boolean;
  /** Lo pactado con la empresa por todo el grupo. */
  amount: number | null;
  currency: Currency;
  cobro: ResumenDeCobro;
};

export type FilaFacturacion = {
  enrollmentId: string;
  contactId: string;
  alumno: string;
  /**
   * 2026-11-06 — Cédula y celular del alumno, para el CSV de facturación.
   * Son datos de contacto: solo viajan con `contactos.ver`, si no `null`.
   */
  cedula: string | null;
  celular: string | null;
  curso: string;
  cohorte: string | null;
  cohortId: string;
  /** Día de inicio `AAAA-MM-DD` (`cohort.start_date` se guarda a medianoche UTC). */
  inicio: string;
  /** 039 — la cohorte está confirmada ("sale"). */
  confirmada: boolean;
  vendedor: string | null;
  amount: number | null;
  currency: Currency;
  invoiceNumber: string | null;
  /** 042 — cuándo se anotó (o corrigió) el número, ISO. */
  invoiceRecordedAt: string | null;
  empresa: EmpresaParaFacturar | null;
  /** 2026-11-06 — Cuánto va cobrado y cómo viene el plan. */
  cobro: ResumenDeCobro;
  /** `null` = se cobra por sí misma (el caso de siempre). */
  venta: VentaDeEmpresaDeFila | null;
};

export type FiltrosFacturacion = {
  cohortId: string | null;
  /** Inicio desde / hasta, `AAAA-MM-DD`, inclusive. */
  desde: string | null;
  hasta: string | null;
  soloConfirmadas: boolean;
  empresa: "todas" | "con" | "sin";
  /**
   * 2026-10-30 — Texto libre (la regla de contactos): alumno, curso, grupo,
   * vendedor, empresa, RUT y número de factura. Opcional: sin él, no filtra.
   */
  busqueda?: string;
};

/** Lo que la fila muestra y se busca. */
export function textosDeFacturacion(r: FilaFacturacion): (string | null)[] {
  return [
    r.alumno,
    r.curso,
    r.cohorte,
    r.vendedor,
    r.invoiceNumber,
    r.empresa?.razonSocial ?? null,
    r.empresa?.rut ?? null,
  ];
}

const pasaBusqueda = (r: FilaFacturacion, q: string | undefined) =>
  !q || coincideConBusqueda(q, { texto: textosDeFacturacion(r) });

/**
 * Filtra y ORDENA (inicio, alumno, id): una pantalla que se transcribe tiene
 * que devolver siempre las filas en el mismo orden, para reencontrar la fila
 * donde se dejó (026).
 */
export function filtrarFacturacion(
  filas: readonly FilaFacturacion[],
  f: FiltrosFacturacion
): FilaFacturacion[] {
  return filas
    .filter((r) => pasaBusqueda(r, f.busqueda))
    .filter((r) => !f.cohortId || r.cohortId === f.cohortId)
    .filter((r) => !f.desde || r.inicio >= f.desde)
    .filter((r) => !f.hasta || r.inicio <= f.hasta)
    .filter((r) => !f.soloConfirmadas || r.confirmada)
    .filter((r) => f.empresa === "todas" || (f.empresa === "con") === (r.empresa !== null))
    .sort(
      (a, b) =>
        a.inicio.localeCompare(b.inicio) ||
        a.alumno.localeCompare(b.alumno, "es") ||
        a.enrollmentId.localeCompare(b.enrollmentId)
    );
}

/**
 * 2026-11-06 — Unifica el registro de facturación: los alumnos de UNA misma
 * empresa en UN mismo grupo se muestran juntos, porque a la empresa se le
 * emite una sola factura. Una empresa con un solo alumno en el grupo, o un
 * particular, queda como fila suelta. Respeta el orden de `filas` (la lista ya
 * viene ordenada por `filtrarFacturacion`): cada bloque aparece donde estaba su
 * primera fila.
 */
export type BloqueDeFacturacion =
  | { tipo: "fila"; fila: FilaFacturacion }
  | {
      tipo: "empresa";
      clave: string;
      empresa: EmpresaParaFacturar;
      filas: FilaFacturacion[];
      /** La venta única de la empresa en el grupo, si ya se pasó a una. */
      venta: VentaDeEmpresaDeFila | null;
    };

export function agruparPorEmpresa(filas: readonly FilaFacturacion[]): BloqueDeFacturacion[] {
  const claveDe = (f: FilaFacturacion) => (f.empresa ? `${f.cohortId}|${f.empresa.id}` : null);
  const porClave = new Map<string, FilaFacturacion[]>();
  for (const f of filas) {
    const k = claveDe(f);
    if (k) porClave.set(k, [...(porClave.get(k) ?? []), f]);
  }
  const out: BloqueDeFacturacion[] = [];
  const hechos = new Set<string>();
  for (const f of filas) {
    const k = claveDe(f);
    const miembros = k ? porClave.get(k)! : null;
    if (!k || !miembros || miembros.length < 2) {
      out.push({ tipo: "fila", fila: f });
    } else if (!hechos.has(k)) {
      hechos.add(k);
      out.push({
        tipo: "empresa",
        clave: k,
        empresa: f.empresa!,
        filas: miembros,
        venta: miembros.find((x) => x.venta)?.venta ?? null,
      });
    }
  }
  return out;
}

/**
 * El número de factura que comparten todos los miembros de un bloque, o `null`
 * si hay más de uno distinto (o ninguno). Sirve para precargar el campo único.
 */
export function facturaComun(filas: readonly FilaFacturacion[]): string | null {
  const numeros = new Set(filas.map((f) => f.invoiceNumber));
  return numeros.size === 1 ? ([...numeros][0] ?? null) : null;
}

/**
 * 2026-10-30 — Las cantidades de los desplegables: cada filtro cuenta con
 * TODOS los demás puestos y sin el suyo (dice qué pasaría al elegirlo), como
 * en Académico.
 */
export function contadoresDeFacturacion(
  filas: readonly FilaFacturacion[],
  f: FiltrosFacturacion
): {
  grupos: Map<string, number>;
  todosLosGrupos: number;
  empresa: Record<FiltrosFacturacion["empresa"], number>;
  confirmacion: { todas: number; soloConfirmadas: number };
} {
  const sinGrupo = filtrarFacturacion(filas, { ...f, cohortId: null });
  const grupos = new Map<string, number>();
  for (const r of sinGrupo) grupos.set(r.cohortId, (grupos.get(r.cohortId) ?? 0) + 1);
  const sinEmpresa = filtrarFacturacion(filas, { ...f, empresa: "todas" });
  const sinConfirmacion = filtrarFacturacion(filas, { ...f, soloConfirmadas: false });
  return {
    grupos,
    todosLosGrupos: sinGrupo.length,
    empresa: {
      todas: sinEmpresa.length,
      con: sinEmpresa.filter((r) => r.empresa !== null).length,
      sin: sinEmpresa.filter((r) => r.empresa === null).length,
    },
    confirmacion: {
      todas: sinConfirmacion.length,
      soloConfirmadas: sinConfirmacion.filter((r) => r.confirmada).length,
    },
  };
}

/**
 * Un total por moneda, en el orden de `CURRENCIES`. **No existe un total
 * general**: sumar pesos con guaraníes no es un número (026). Las ventas sin
 * monto pactado se cuentan aparte: no son cero.
 */
export function totalesPorMoneda(filas: readonly FilaFacturacion[]): {
  totales: { currency: Currency; total: number; cantidad: number }[];
  sinMonto: number;
} {
  const totales = CURRENCIES.map((currency) => {
    const suyas = filas.filter((r) => r.currency === currency && r.amount !== null);
    return {
      currency,
      total: suyas.reduce((s, r) => s + (r.amount ?? 0), 0),
      cantidad: suyas.length,
    };
  }).filter((t) => t.cantidad > 0);
  // Una inscripción cubierta por la venta de su empresa no tiene monto propio:
  // no es una venta "sin monto pactado".
  return {
    totales,
    sinMonto: filas.filter((r) => r.amount === null && !(r.venta && !r.venta.esTitular)).length,
  };
}

/** 040 — La condición de pago de la empresa, en castellano. */
export function condicionDePago(
  terms: string | null,
  days: number | null
): string | null {
  if (terms === "contado") return "Contado";
  if (terms === "credito") return days ? `Crédito a ${days} días` : "Crédito";
  return null;
}

/**
 * ¿El mismo número ya está en otra venta? **Avisa, no bloquea.**
 *
 * Una factura de empresa puede cubrir a varios empleados, y una persona puede
 * pagar dos cursadas con una sola factura: en esos dos casos el número
 * repetido es correcto y no se dice nada. Lo sospechoso es el mismo número en
 * personas distintas que no comparten empresa: casi siempre es un error de
 * tipeo. Bloquearlo dejaría sin salida el caso legítimo que el sistema no
 * sabe distinguir; avisarlo deja la decisión en quien tiene la factura en la
 * mano.
 */
export function avisoDeFacturaRepetida(
  propia: { contactId: string; companyId: string | null },
  otras: readonly { contactId: string; companyId: string | null; alumno: string }[]
): string | null {
  const sospechosas = otras.filter(
    (o) =>
      o.contactId !== propia.contactId &&
      !(propia.companyId !== null && o.companyId === propia.companyId)
  );
  if (sospechosas.length === 0) return null;
  const nombres = [...new Set(sospechosas.map((o) => o.alumno))];
  const lista = nombres.slice(0, 3).join(", ") + (nombres.length > 3 ? ` y ${nombres.length - 3} más` : "");
  return `Ese número de factura ya está en la venta de ${lista}. Se guardó igual: revisá que no sea un error de tipeo.`;
}

/* ============================================================
 * CSV
 * ============================================================ */

const ENCABEZADO = [
  "Alumno",
  "Cédula",
  "Celular",
  "Curso",
  "Grupo",
  "Inicio",
  "Grupo confirmado",
  "Vendedor",
  "Monto",
  "Moneda",
  "Factura",
  "Razón social",
  "RUT",
  "Correo de facturación",
  "Condición de pago",
];

/**
 * El CSV de la lista FILTRADA, tal como se ve. Monto y moneda en columnas
 * separadas y sin fila de totales: un total mezclaría monedas.
 *
 * El separador de columnas es la COMA, así que el monto sale en unidades
 * MAYORES con PUNTO decimal y sin separador de miles ("5245.32"): una coma
 * decimal partiría el campo. Pesos y dólares con dos decimales; guaraníes sin
 * decimales (`minorToCsv`, `src/lib/money.ts`).
 *
 * Se arma en el navegador con los datos que ya viajaron con `cobranza.ver`:
 * no hay una ruta `text/csv` nueva que pueda traer más que la pantalla.
 */
export function facturacionCsv(filas: readonly FilaFacturacion[]): string {
  const lineas = filas.map((r) =>
    [
      r.alumno,
      r.cedula,
      r.celular,
      r.curso,
      r.cohorte,
      r.inicio,
      r.confirmada ? "Sí" : "No",
      r.vendedor,
      r.amount === null ? null : minorToCsv(r.amount, r.currency),
      r.currency,
      r.invoiceNumber,
      r.empresa?.razonSocial ?? null,
      r.empresa?.rut ?? null,
      r.empresa?.billingEmail ?? null,
      r.empresa?.condicion ?? null,
    ]
      .map(csvField)
      .join(",")
  );
  return [ENCABEZADO.join(","), ...lineas].join("\r\n");
}
