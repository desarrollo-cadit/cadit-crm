import { describe, expect, it } from "vitest";
import {
  contarPorEstado,
  cuotaDeTaller,
  decidirInscripcion,
  inicioDelTaller,
  lugaresDisponibles,
  ocupaLugar,
  ordenarEdiciones,
  seleccionarRecordatorios,
  textoConfirmacion,
  textoRecordatorio,
  toPublicWorkshop,
  validarCambioDeEstado,
  type EdicionPublicable,
} from "@/lib/workshops";

/**
 * 033 — Talleres. Todo lo que DECIDE se prueba sin base: cupo, elegibilidad,
 * transiciones de estado, la cuota, el DTO público y a quién se le recuerda.
 */

const TZ = "America/Montevideo";
// 2026-11-07 a las 10:00 en Montevideo (UTC-3) = 13:00 UTC.
const DIA = new Date("2026-11-07T00:00:00Z");

describe("033 (FR-010) — el cupo", () => {
  it("cuentan anotado, confirmado, asistió y no asistió; cancelado no", () => {
    expect(ocupaLugar("anotado")).toBe(true);
    expect(ocupaLugar("confirmado")).toBe(true);
    expect(ocupaLugar("asistio")).toBe(true);
    expect(ocupaLugar("no_asistio")).toBe(true);
    expect(ocupaLugar("cancelado")).toBe(false);
  });

  it("sin cupo definido los lugares son ilimitados (null)", () => {
    expect(lugaresDisponibles(null, 500)).toBeNull();
  });

  it("los lugares restantes nunca son negativos", () => {
    expect(lugaresDisponibles(10, 3)).toBe(7);
    expect(lugaresDisponibles(10, 10)).toBe(0);
    expect(lugaresDisponibles(10, 12)).toBe(0);
  });

  it("los contadores agrupan por estado", () => {
    expect(contarPorEstado(["anotado", "anotado", "confirmado", "cancelado"])).toEqual({
      anotado: 2,
      confirmado: 1,
      asistio: 0,
      no_asistio: 0,
      cancelado: 1,
    });
  });
});

describe("033 (FR-008/FR-009) — quién se puede anotar", () => {
  const abierta = {
    registrationStatus: "abierta" as const,
    empezo: false,
    capacity: 10,
    ocupados: 3,
    existente: null,
  };

  it("un taller abierto con lugar acepta y crea", () => {
    expect(decidirInscripcion(abierta)).toEqual({ ok: true, accion: "crear" });
  });

  it("un reenvío de quien ya está anotado es éxito sin duplicar", () => {
    expect(decidirInscripcion({ ...abierta, existente: "anotado" })).toEqual({
      ok: true,
      accion: "existente",
    });
  });

  it("el reenvío es éxito aunque el taller se haya llenado después", () => {
    expect(
      decidirInscripcion({ ...abierta, ocupados: 10, existente: "confirmado" })
    ).toEqual({ ok: true, accion: "existente" });
  });

  it("quien había cancelado vuelve a anotarse si hay lugar", () => {
    expect(decidirInscripcion({ ...abierta, existente: "cancelado" })).toEqual({
      ok: true,
      accion: "reactivar",
    });
  });

  it("rechaza cerrada, cancelada, ya empezado y lleno, con código y mensaje", () => {
    const cerrada = decidirInscripcion({ ...abierta, registrationStatus: "cerrada" });
    expect(cerrada).toMatchObject({ ok: false, code: "inscripciones_cerradas" });
    const cancelada = decidirInscripcion({ ...abierta, registrationStatus: "cancelada" });
    expect(cancelada).toMatchObject({ ok: false, code: "taller_cancelado" });
    const pasado = decidirInscripcion({ ...abierta, empezo: true });
    expect(pasado).toMatchObject({ ok: false, code: "taller_realizado" });
    const lleno = decidirInscripcion({ ...abierta, ocupados: 10 });
    expect(lleno).toMatchObject({ ok: false, code: "sin_lugares" });
    for (const r of [cerrada, cancelada, pasado, lleno]) {
      if (r.ok) throw new Error("debía rechazar");
      expect(r.message.length).toBeGreaterThan(10);
    }
  });

  it("quien había cancelado no vuelve si está lleno", () => {
    expect(
      decidirInscripcion({ ...abierta, ocupados: 10, existente: "cancelado" })
    ).toMatchObject({ ok: false, code: "sin_lugares" });
  });

  it("sin cupo no se llena nunca", () => {
    expect(decidirInscripcion({ ...abierta, capacity: null, ocupados: 9999 })).toEqual({
      ok: true,
      accion: "crear",
    });
  });

  it("una edición sin estado de inscripción (null) se trata como cerrada", () => {
    expect(
      decidirInscripcion({ ...abierta, registrationStatus: null })
    ).toMatchObject({ ok: false, code: "inscripciones_cerradas" });
  });
});

describe("033 (FR-012) — cambiar el estado de un inscripto", () => {
  const base = { empezo: true, capacity: 10, ocupados: 5 };

  it("se puede confirmar a un anotado", () => {
    expect(validarCambioDeEstado({ ...base, actual: "anotado", nuevo: "confirmado" })).toEqual({
      ok: true,
    });
  });

  it("asistió / no asistió solo cuando el taller ya empezó", () => {
    expect(
      validarCambioDeEstado({ ...base, empezo: false, actual: "confirmado", nuevo: "asistio" })
    ).toMatchObject({ ok: false, code: "taller_no_realizado" });
    expect(
      validarCambioDeEstado({ ...base, empezo: true, actual: "confirmado", nuevo: "no_asistio" })
    ).toEqual({ ok: true });
  });

  it("volver de cancelado necesita un lugar libre", () => {
    expect(
      validarCambioDeEstado({ ...base, ocupados: 10, actual: "cancelado", nuevo: "anotado" })
    ).toMatchObject({ ok: false, code: "sin_lugares" });
    expect(
      validarCambioDeEstado({ ...base, ocupados: 9, actual: "cancelado", nuevo: "anotado" })
    ).toEqual({ ok: true });
  });

  it("cancelar siempre se puede (libera el lugar)", () => {
    expect(
      validarCambioDeEstado({ ...base, ocupados: 10, actual: "confirmado", nuevo: "cancelado" })
    ).toEqual({ ok: true });
  });
});

describe("033 (FR-015/FR-017) — la cuota única", () => {
  it("gratuito (sin costo o costo 0) no genera cuota", () => {
    expect(cuotaDeTaller({ cost: null, currency: "UYU", signupAt: DIA, workshopDay: DIA })).toBeNull();
    expect(cuotaDeTaller({ cost: 0, currency: "UYU", signupAt: DIA, workshopDay: DIA })).toBeNull();
  });

  it("con costo: una cuota por el costo vigente, en la moneda del taller, que vence el día del taller", () => {
    const signup = new Date("2026-10-20T15:00:00Z");
    expect(
      cuotaDeTaller({ cost: 1500, currency: "UYU", signupAt: signup, workshopDay: DIA })
    ).toEqual({ amount: 1500, currency: "UYU", dueDate: DIA });
  });

  it("si se anota después del día del taller (carga manual tardía), vence al anotarse", () => {
    const tarde = new Date("2026-11-09T12:00:00Z");
    expect(
      cuotaDeTaller({ cost: 900, currency: "USD", signupAt: tarde, workshopDay: DIA })
    ).toEqual({ amount: 900, currency: "USD", dueDate: tarde });
  });
});

describe("033 — cuándo empieza un taller", () => {
  it("con hora: el instante en la zona de la academia", () => {
    expect(inicioDelTaller({ startDate: DIA, startTime: "10:00" }, TZ).toISOString()).toBe(
      "2026-11-07T13:00:00.000Z"
    );
  });

  it("sin hora: el fin de ese día (todavía se puede anotar en el día)", () => {
    expect(inicioDelTaller({ startDate: DIA, startTime: null }, TZ).toISOString()).toBe(
      "2026-11-08T03:00:00.000Z"
    );
  });
});

const edicion: EdicionPublicable = {
  id: "coh_1",
  courseId: "crs_1",
  slug: "intro-revit",
  courseName: "Introducción a Revit",
  cohortName: null,
  description: "Un taller práctico",
  tagline: null,
  imageUrl: null,
  startDate: DIA,
  endDate: null,
  startTime: "10:00",
  endTime: "12:00",
  modality: "online",
  classroom: "Sede Centro",
  meetingUrl: "https://zoom.us/j/123456789?pwd=secreto",
  cost: 1500,
  currency: "UYU",
  capacity: 20,
  registrationStatus: "abierta",
  ocupados: 4,
};

describe("033 (FR-005) — lo que ve la web", () => {
  it("NUNCA lleva el enlace de la reunión", () => {
    const dto = toPublicWorkshop(edicion, TZ);
    expect(JSON.stringify(dto)).not.toContain("zoom.us");
    expect(JSON.stringify(dto)).not.toContain("secreto");
    expect(Object.keys(dto)).not.toContain("meetingUrl");
  });

  it("lleva nombre, fecha, modalidad, costo y si quedan lugares", () => {
    const dto = toPublicWorkshop(edicion, TZ);
    expect(dto).toMatchObject({
      id: "coh_1",
      name: "Introducción a Revit",
      description: "Un taller práctico",
      startsAt: "2026-11-07T13:00:00.000Z",
      modality: "online",
      location: null,
      isFree: false,
      price: 1500,
      currency: "UYU",
      seatsLeft: 16,
      hasSeats: true,
    });
  });

  it("un taller presencial muestra el lugar; uno gratuito no muestra precio", () => {
    const dto = toPublicWorkshop(
      { ...edicion, modality: "presencial", cost: null, capacity: null },
      TZ
    );
    expect(dto.location).toBe("Sede Centro");
    expect(dto.isFree).toBe(true);
    expect(dto.price).toBeNull();
    expect(dto.seatsLeft).toBeNull();
    expect(dto.hasSeats).toBe(true);
  });
});

describe("033 (US5) — el orden del listado", () => {
  it("los próximos primero (por fecha), después los realizados (más reciente primero)", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const mk = (id: string, iso: string) => ({ id, startsAt: new Date(iso) });
    const ordenadas = ordenarEdiciones(
      [
        mk("pasado-viejo", "2026-03-01T13:00:00Z"),
        mk("prox-lejos", "2026-12-01T13:00:00Z"),
        mk("pasado-reciente", "2026-09-01T13:00:00Z"),
        mk("prox-cerca", "2026-10-20T13:00:00Z"),
      ],
      now
    );
    expect(ordenadas.map((e) => e.id)).toEqual([
      "prox-cerca",
      "prox-lejos",
      "pasado-reciente",
      "pasado-viejo",
    ]);
  });
});

describe("033 (FR-020) — a quién se le recuerda", () => {
  const reg = (id: string, status: Parameters<typeof ocupaLugar>[0], extra = {}) => ({
    id,
    status,
    reminderSentAt: null as Date | null,
    hasPhone: true,
    ...extra,
  });
  const ed = { startDate: DIA, registrationStatus: "abierta" as const };
  // 2026-11-06 11:00 en Montevideo: el día anterior, después de la hora del recordatorio.
  const diaAnterior = new Date("2026-11-06T14:00:00Z");

  it("solo a los confirmados, sin recordatorio previo y con teléfono", () => {
    const elegidos = seleccionarRecordatorios(
      ed,
      [
        reg("a", "confirmado"),
        reg("b", "anotado"),
        reg("c", "cancelado"),
        reg("d", "confirmado", { reminderSentAt: new Date() }),
        reg("e", "confirmado", { hasPhone: false }),
      ],
      diaAnterior,
      TZ
    );
    expect(elegidos).toEqual(["a"]);
  });

  it("nada fuera del día anterior", () => {
    const dosDiasAntes = new Date("2026-11-05T14:00:00Z");
    expect(seleccionarRecordatorios(ed, [reg("a", "confirmado")], dosDiasAntes, TZ)).toEqual([]);
    const elMismoDia = new Date("2026-11-07T11:00:00Z");
    expect(seleccionarRecordatorios(ed, [reg("a", "confirmado")], elMismoDia, TZ)).toEqual([]);
  });

  it("nada antes de la hora del recordatorio del día anterior", () => {
    // 2026-11-06 07:00 en Montevideo.
    const temprano = new Date("2026-11-06T10:00:00Z");
    expect(seleccionarRecordatorios(ed, [reg("a", "confirmado")], temprano, TZ)).toEqual([]);
  });

  it("nada para un taller cancelado", () => {
    expect(
      seleccionarRecordatorios(
        { ...ed, registrationStatus: "cancelada" },
        [reg("a", "confirmado")],
        diaAnterior,
        TZ
      )
    ).toEqual([]);
  });
});

describe("033 (US4) — el texto de los avisos", () => {
  it("la confirmación lleva el nombre, la fecha y la modalidad, pero no el enlace", () => {
    const texto = textoConfirmacion({ nombre: "Ana", edicion }, TZ);
    expect(texto).toContain("Ana");
    expect(texto).toContain("Introducción a Revit");
    expect(texto).toContain("10:00");
    expect(texto.toLowerCase()).toContain("online");
    expect(texto).not.toContain("zoom.us");
  });

  it("el recordatorio de un taller online lleva el enlace", () => {
    expect(textoRecordatorio({ nombre: "Ana", edicion }, TZ)).toContain(
      "https://zoom.us/j/123456789?pwd=secreto"
    );
  });

  it("el recordatorio de uno presencial lleva el lugar", () => {
    const texto = textoRecordatorio(
      { nombre: "Ana", edicion: { ...edicion, modality: "presencial" } },
      TZ
    );
    expect(texto).toContain("Sede Centro");
    expect(texto).not.toContain("zoom.us");
  });
});

describe("033 (FR-004) — un taller no exige vendedor", () => {
  it("una inscripción a una cohorte de taller no es una venta con comisión", async () => {
    const { exigeVendedor } = await import("@/server/sellers");
    expect(exigeVendedor({ cohortId: "coh_1", parentEnrollmentId: null, courseKind: "taller" })).toBe(
      false
    );
    expect(exigeVendedor({ cohortId: "coh_1", parentEnrollmentId: null, courseKind: "curso" })).toBe(
      true
    );
    // Sin tipo declarado, la regla de siempre.
    expect(exigeVendedor({ cohortId: "coh_1", parentEnrollmentId: null })).toBe(true);
  });
});

describe("033 (FR-011/FR-018) — si pagó, y qué pasa al cancelar", () => {
  it("gratuito: no hay nada que pagar", async () => {
    const { estadoDePago } = await import("@/lib/workshops");
    expect(estadoDePago({ pactado: null, adeudado: 0, pagado: 0 })).toBe("gratuito");
  });

  it("con costo: pagado cuando lo pagado cubre lo adeudado, pendiente si no", async () => {
    const { estadoDePago } = await import("@/lib/workshops");
    expect(estadoDePago({ pactado: 1500, adeudado: 1500, pagado: 1500 })).toBe("pagado");
    expect(estadoDePago({ pactado: 1500, adeudado: 1500, pagado: 500 })).toBe("pendiente");
    // La cuota se anuló al cancelar sin pagos: no queda nada pendiente.
    expect(estadoDePago({ pactado: 1500, adeudado: 0, pagado: 0 })).toBe("sin_saldo");
  });

  it("al cancelar se anula la cuota solo si no tiene pagos: un pago nunca se borra", async () => {
    const { cuotaSeAnulaAlCancelar } = await import("@/lib/workshops");
    expect(cuotaSeAnulaAlCancelar({ pagado: 0 })).toBe(true);
    expect(cuotaSeAnulaAlCancelar({ pagado: 100 })).toBe(false);
  });
});

describe("033 (FR-019, US4) — por dónde sale un aviso", () => {
  const base = { hasPhone: true, connected: true, windowOpen: false, templateApproved: true };

  it("con la ventana de 24 h abierta, texto libre", async () => {
    const { canalDelAviso } = await import("@/lib/workshops");
    expect(canalDelAviso({ ...base, windowOpen: true, templateApproved: false })).toEqual({
      via: "texto",
    });
  });

  it("con la ventana cerrada, solo con plantilla aprobada", async () => {
    const { canalDelAviso } = await import("@/lib/workshops");
    expect(canalDelAviso(base)).toEqual({ via: "plantilla" });
    expect(canalDelAviso({ ...base, templateApproved: false })).toEqual({
      via: "ninguno",
      motivo: "No enviado: sin plantilla aprobada para este aviso.",
    });
  });

  it("sin teléfono o sin WhatsApp no se intenta (y no bloquea nada)", async () => {
    const { canalDelAviso } = await import("@/lib/workshops");
    expect(canalDelAviso({ ...base, hasPhone: false })).toMatchObject({ via: "ninguno" });
    expect(canalDelAviso({ ...base, connected: false })).toMatchObject({ via: "ninguno" });
  });

  it("la variable de la plantilla va en UNA línea (WhatsApp no admite saltos en {{1}})", async () => {
    const { variableDelAviso } = await import("@/lib/workshops");
    const v = variableDelAviso("recordatorio", edicion);
    expect(v).not.toMatch(/\n/);
    expect(v).toContain("Introducción a Revit");
    expect(v).toContain("https://zoom.us/j/123456789?pwd=secreto");
    expect(variableDelAviso("confirmacion", edicion)).not.toContain("zoom.us");
  });
});
