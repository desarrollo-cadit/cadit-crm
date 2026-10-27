import { describe, expect, it } from "vitest";
import {
  REGLAS_DE_TAREAS,
  armarBandeja,
  reglasPermitidas,
  tareasDeAsistencia,
  tareasDeConfirmacion,
  tareasDeFacturacion,
  tareasDeLeads,
  tareasDeSugerenciasDeZoom,
  type ClaseParaTarea,
  type EnvioParaTarea,
  type GrupoParaConfirmar,
  type VentaParaFacturar,
} from "@/lib/tareas-del-dia";
import { SYSTEM_ROLES } from "@/lib/capabilities";

const TZ = "America/Montevideo"; // UTC-3, sin horario de verano
/** Lunes 26/10/2026, 10:00 en Montevideo. */
const AHORA = new Date("2026-10-26T13:00:00Z");
const reloj = { timeZone: TZ, now: AHORA };
/** `class_session.date` / `cohort.start_date`: medianoche UTC del día. */
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);
const HORA = 60 * 60 * 1000;

describe("reglasPermitidas — cada regla pide SU capacidad", () => {
  it("las capacidades son de la lista cerrada y cada regla declara las suyas", () => {
    expect(REGLAS_DE_TAREAS.map((r) => [r.id, r.capacidades])).toEqual([
      ["asistencia_zoom", ["asistencia.editar", "grabaciones.gestionar"]],
      ["asistencia", ["asistencia.editar", "grabaciones.gestionar"]],
      ["confirmar", ["cohortes.confirmar"]],
      ["facturar", ["cobranza.ver"]],
      ["leads", ["inscripciones.seguimiento"]],
    ]);
  });

  it("sin TODAS sus capacidades la regla no corre", () => {
    expect(reglasPermitidas(["academico.ver", "contactos.ver"])).toEqual([]);
    expect(reglasPermitidas(["academico.ver", "cobranza.ver"])).toEqual(["facturar"]);
    expect(
      reglasPermitidas([
        "asistencia.editar",
        "grabaciones.gestionar",
        "cohortes.confirmar",
        "inscripciones.seguimiento",
      ])
    ).toEqual(["asistencia_zoom", "asistencia", "confirmar", "leads"]);
  });

  it("Soporte pasa asistencia pero no la recibe como tarea; Coordinación sí", () => {
    const capacidadesDe = (key: string) => SYSTEM_ROLES.find((r) => r.key === key)!.capabilities;
    expect(capacidadesDe("soporte")).toContain("asistencia.editar");
    expect(reglasPermitidas(capacidadesDe("soporte"))).not.toContain("asistencia");
    expect(reglasPermitidas(capacidadesDe("coordinacion"))).toContain("asistencia");
  });
});

describe("tareasDeAsistencia — clases dictadas sin una sola marca, UNA tarea por grupo", () => {
  const base: ClaseParaTarea = {
    classSessionId: "cs_1",
    cohortId: "coh_1",
    cohortName: "Revit 12",
    courseName: "Revit",
    courseKind: "curso",
    cohortStartDate: dia("2026-09-01"),
    cohortEndDate: dia("2026-12-15"),
    date: dia("2026-10-22"),
    endTime: "21:00",
    canceled: false,
    inscriptosActivos: 8,
    marcas: 0,
  };

  it("una clase que ya terminó, con alumnos y sin marcas, es tarea y lleva a la planilla", () => {
    const [t, ...resto] = tareasDeAsistencia([base], reloj);
    expect(resto).toEqual([]);
    expect(t).toMatchObject({
      ruleId: "asistencia",
      href: "/cohorts/coh_1?tab=asistencia",
      fecha: "2026-10-22",
      detalle: "Clase de hace 4 días",
      cantidad: 1,
    });
    expect(t?.titulo).toBe("Revit — Revit 12");
  });

  it("varias clases del mismo grupo: UNA tarea con la cantidad y la más vieja", () => {
    const tareas = tareasDeAsistencia(
      [
        { ...base, classSessionId: "cs_a", date: dia("2026-10-25") },
        { ...base, classSessionId: "cs_b", date: dia("2026-10-21") },
        { ...base, classSessionId: "cs_c", date: dia("2026-10-23") },
      ],
      reloj
    );
    expect(tareas).toEqual([
      {
        ruleId: "asistencia",
        titulo: "Revit — Revit 12",
        detalle: "3 clases sin pasar · la más vieja de hace 5 días",
        href: "/cohorts/coh_1?tab=asistencia",
        urgencia: "alta",
        fecha: "2026-10-21",
        cantidad: 3,
      },
    ]);
  });

  it("la urgencia del grupo es la de su clase más vieja", () => {
    const [t] = tareasDeAsistencia(
      [
        { ...base, classSessionId: "cs_a", date: dia("2026-10-25") },
        { ...base, classSessionId: "cs_b", date: dia("2026-10-24") },
      ],
      reloj
    );
    expect(t).toMatchObject({ urgencia: "media", detalle: "2 clases sin pasar · la más vieja de hace 2 días" });
  });

  it("grupos distintos, tareas distintas", () => {
    const otra = { ...base, classSessionId: "cs_2", cohortId: "coh_2", cohortName: "Noche" };
    expect(tareasDeAsistencia([base, otra], reloj).map((t) => t.href)).toEqual([
      "/cohorts/coh_1?tab=asistencia",
      "/cohorts/coh_2?tab=asistencia",
    ]);
  });

  it("con una marca de cualquiera ya no es tarea: se pasó lista", () => {
    expect(tareasDeAsistencia([{ ...base, marcas: 1 }], reloj)).toEqual([]);
  });

  it("cancelada, sin alumnos activos o de un taller: no es tarea", () => {
    expect(tareasDeAsistencia([{ ...base, canceled: true }], reloj)).toEqual([]);
    expect(tareasDeAsistencia([{ ...base, inscriptosActivos: 0 }], reloj)).toEqual([]);
    expect(tareasDeAsistencia([{ ...base, courseKind: "taller" }], reloj)).toEqual([]);
  });

  it("de un grupo FINALIZADO (computeCohortStatus, la regla de Académico): no es tarea", () => {
    expect(tareasDeAsistencia([{ ...base, cohortEndDate: dia("2026-10-23") }], reloj)).toEqual([]);
    // Sin fecha de fin sigue en curso.
    expect(tareasDeAsistencia([{ ...base, cohortEndDate: null }], reloj)).toHaveLength(1);
  });

  it("una clase de hoy que todavía no terminó no es tarea (estadoDeClase la llama 'hoy')", () => {
    expect(tareasDeAsistencia([{ ...base, date: dia("2026-10-26"), endTime: "21:00" }], reloj)).toEqual([]);
  });

  it("la de ayer es urgencia media; la de hace más de 3 días, alta", () => {
    const [ayer] = tareasDeAsistencia([{ ...base, date: dia("2026-10-25") }], reloj);
    const [vieja] = tareasDeAsistencia([{ ...base, date: dia("2026-10-20") }], reloj);
    expect(ayer).toMatchObject({ urgencia: "media", detalle: "Clase de ayer" });
    expect(vieja?.urgencia).toBe("alta");
  });

  it("más de 14 días atrás no inunda la bandeja", () => {
    expect(tareasDeAsistencia([{ ...base, date: dia("2026-10-10") }], reloj)).toEqual([]);
    expect(tareasDeAsistencia([{ ...base, date: dia("2026-10-12") }], reloj)).toHaveLength(1);
  });

  it("con una sugerencia de Zoom lista no es «sin pasar»: va a la otra regla", () => {
    expect(tareasDeAsistencia([{ ...base, sugerenciaZoom: true }], reloj)).toEqual([]);
  });
});

describe("tareasDeSugerenciasDeZoom — asistencia sugerida para revisar, UNA tarea por grupo", () => {
  const base: ClaseParaTarea = {
    classSessionId: "cs_9",
    cohortId: "coh_1",
    cohortName: "Revit 12",
    courseName: "Revit",
    courseKind: "curso",
    cohortStartDate: dia("2026-02-01"),
    cohortEndDate: dia("2026-12-15"),
    date: dia("2026-10-22"),
    endTime: "21:00",
    canceled: false,
    inscriptosActivos: 8,
    marcas: 0,
    sugerenciaZoom: true,
  };

  it("lleva a la planilla con la clase elegida", () => {
    const [t, ...resto] = tareasDeSugerenciasDeZoom([base], reloj);
    expect(resto).toEqual([]);
    expect(t).toMatchObject({
      ruleId: "asistencia_zoom",
      href: "/cohorts/coh_1?tab=asistencia&clase=cs_9",
      fecha: "2026-10-22",
      detalle: "Clase de hace 4 días",
      urgencia: "alta",
      cantidad: 1,
    });
  });

  it("varias del mismo grupo: una tarea que abre en la MÁS VIEJA", () => {
    const tareas = tareasDeSugerenciasDeZoom(
      [
        { ...base, classSessionId: "cs_a", date: dia("2026-10-25") },
        { ...base, classSessionId: "cs_b", date: dia("2026-10-03") },
        { ...base, classSessionId: "cs_c", date: dia("2026-10-15") },
      ],
      reloj
    );
    expect(tareas).toEqual([
      {
        ruleId: "asistencia_zoom",
        titulo: "Revit — Revit 12",
        detalle: "3 clases para revisar · la más vieja de hace 23 días",
        href: "/cohorts/coh_1?tab=asistencia&clase=cs_b",
        urgencia: "alta",
        fecha: "2026-10-03",
        cantidad: 3,
      },
    ]);
  });

  it("también las clases viejas (el relleno hacia atrás): sin corte de 14 días", () => {
    expect(tareasDeSugerenciasDeZoom([{ ...base, date: dia("2026-03-02") }], reloj)).toHaveLength(1);
  });

  it("de un grupo FINALIZADO no cuenta (la sugerencia se sigue viendo en el grupo)", () => {
    expect(tareasDeSugerenciasDeZoom([{ ...base, cohortEndDate: dia("2026-10-23") }], reloj)).toEqual([]);
  });

  it("de ayer es media; sin sugerencia, con marcas, cancelada o de taller no es tarea", () => {
    expect(tareasDeSugerenciasDeZoom([{ ...base, date: dia("2026-10-25") }], reloj)[0]?.urgencia).toBe("media");
    expect(tareasDeSugerenciasDeZoom([{ ...base, sugerenciaZoom: false }], reloj)).toEqual([]);
    expect(tareasDeSugerenciasDeZoom([{ ...base, marcas: 2 }], reloj)).toEqual([]);
    expect(tareasDeSugerenciasDeZoom([{ ...base, canceled: true }], reloj)).toEqual([]);
    expect(tareasDeSugerenciasDeZoom([{ ...base, courseKind: "taller" }], reloj)).toEqual([]);
  });

  it("las dos reglas no cuentan dos veces la misma clase, aun en el mismo grupo", () => {
    const sinPasar = { ...base, classSessionId: "cs_a", sugerenciaZoom: false };
    const conSugerencia = { ...base, classSessionId: "cs_b" };
    const clases = [sinPasar, conSugerencia];
    const tareas = [...tareasDeAsistencia(clases, reloj), ...tareasDeSugerenciasDeZoom(clases, reloj)];
    expect(tareas.map((t) => [t.ruleId, t.href, t.cantidad])).toEqual([
      ["asistencia", "/cohorts/coh_1?tab=asistencia", 1],
      ["asistencia_zoom", "/cohorts/coh_1?tab=asistencia&clase=cs_b", 1],
    ]);
    const bandeja = armarBandeja(tareas);
    expect(bandeja.map((g) => [g.ruleId, g.resumen, g.cantidad])).toEqual([
      ["asistencia_zoom", "1 clase para revisar", 1],
      ["asistencia", "1 clase sin pasar", 1],
    ]);
    expect(bandeja[0]!.titulo).toBe("Asistencia sugerida para revisar");
  });
});

describe("tareasDeConfirmacion — la misma ventana que el aviso de grupo sin confirmar", () => {
  const base: GrupoParaConfirmar = {
    cohortId: "coh_2",
    cohortName: "BIM 4",
    courseName: "BIM",
    courseKind: "curso",
    parentCohortId: null,
    startDate: dia("2026-10-30"),
    confirmedAt: null,
    status: "planificada",
  };

  it("sin confirmar y a 4 días: tarea media, lleva al grupo", () => {
    const [t] = tareasDeConfirmacion([base], reloj);
    expect(t).toMatchObject({ ruleId: "confirmar", href: "/cohorts/coh_2", urgencia: "media" });
    expect(t?.detalle).toBe("Empieza en 4 días");
  });

  it("a 2 días o el mismo día: alta", () => {
    expect(tareasDeConfirmacion([{ ...base, startDate: dia("2026-10-28") }], reloj)[0]?.urgencia).toBe("alta");
    const [hoy] = tareasDeConfirmacion([{ ...base, startDate: dia("2026-10-26") }], reloj);
    expect(hoy?.detalle).toBe("Empieza hoy");
    expect(hoy?.urgencia).toBe("alta");
  });

  it("confirmado, más allá de 7 días, ya empezado, finalizado, módulo o taller: no", () => {
    const no: GrupoParaConfirmar[] = [
      { ...base, confirmedAt: dia("2026-10-20") },
      { ...base, startDate: dia("2026-11-03") },
      { ...base, startDate: dia("2026-10-25") },
      { ...base, status: "finalizada" },
      { ...base, parentCohortId: "coh_madre" },
      { ...base, courseKind: "taller" },
    ];
    expect(tareasDeConfirmacion(no, reloj)).toEqual([]);
  });
});

describe("tareasDeFacturacion — pendienteDeFacturar, agrupado por grupo y SIN montos", () => {
  const venta = (over: Partial<VentaParaFacturar> = {}): VentaParaFacturar => ({
    cohortId: "coh_3",
    cohortName: "Revit 13",
    courseName: "Revit",
    courseKind: "curso",
    parentEnrollmentId: null,
    deBaja: false,
    invoiceNumber: null,
    startDate: dia("2026-10-29"),
    ...over,
  });

  it("agrupa las pendientes por grupo y enlaza a Facturación filtrada", () => {
    const tareas = tareasDeFacturacion(
      [venta(), venta(), venta({ invoiceNumber: "A-1" }), venta({ invoiceNumber: "   " })],
      reloj
    );
    expect(tareas).toHaveLength(1);
    expect(tareas[0]).toMatchObject({
      ruleId: "facturar",
      href: "/facturacion?tab=pendientes&grupo=coh_3",
      detalle: "3 inscripciones sin factura · empieza en 3 días",
      urgencia: "media",
    });
  });

  it("no lleva ningún campo de plata", () => {
    const [t] = tareasDeFacturacion([venta()], reloj);
    expect(Object.keys(t ?? {}).sort()).toEqual(["detalle", "fecha", "href", "ruleId", "titulo", "urgencia"]);
  });

  it("hija, de baja, taller: la regla de la pantalla las deja afuera", () => {
    expect(
      tareasDeFacturacion(
        [venta({ parentEnrollmentId: "en_madre" }), venta({ deBaja: true }), venta({ courseKind: "taller" })],
        reloj
      )
    ).toEqual([]);
  });

  it("ventana: de 30 días después del inicio a 7 antes; empezado o a ≤2 días es alta", () => {
    expect(tareasDeFacturacion([venta({ startDate: dia("2026-11-03") })], reloj)).toEqual([]);
    expect(tareasDeFacturacion([venta({ startDate: dia("2026-09-20") })], reloj)).toEqual([]);
    const [empezado] = tareasDeFacturacion([venta({ startDate: dia("2026-10-01") })], reloj);
    expect(empezado?.urgencia).toBe("alta");
    expect(empezado?.detalle).toBe("1 inscripción sin factura · ya empezó");
  });
});

describe("tareasDeLeads — un formulario sin contacto posterior, pasadas 24 horas", () => {
  const envio = (over: Partial<EnvioParaTarea> = {}): EnvioParaTarea => ({
    contactId: "ct_1",
    nombre: "Ana Pérez",
    source: "formulario:Revit",
    interestName: "Revit",
    submittedAt: new Date(AHORA.getTime() - 30 * HORA),
    ultimaActividad: null,
    ...over,
  });

  it("sin actividad después del envío y con más de 24 h: tarea, al seguimiento del contacto", () => {
    const [t] = tareasDeLeads([envio()], AHORA);
    expect(t).toMatchObject({
      ruleId: "leads",
      titulo: "Ana Pérez",
      detalle: "Página del curso en el sitio · Revit",
      href: "/contacts/ct_1/legajo?tab=seguimiento",
      urgencia: "media",
    });
  });

  it("con menos de 24 h todavía no; con actividad posterior, ya no", () => {
    expect(tareasDeLeads([envio({ submittedAt: new Date(AHORA.getTime() - 10 * HORA) })], AHORA)).toEqual([]);
    expect(
      tareasDeLeads([envio({ ultimaActividad: new Date(AHORA.getTime() - 2 * HORA) })], AHORA)
    ).toEqual([]);
  });

  it("una actividad ANTERIOR al envío no lo cuenta como contactado", () => {
    expect(tareasDeLeads([envio({ ultimaActividad: new Date(AHORA.getTime() - 40 * HORA) })], AHORA)).toHaveLength(1);
  });

  it("más de 72 h es alta; más de 30 días queda afuera; una sola tarea por persona", () => {
    const [viejo] = tareasDeLeads([envio({ submittedAt: new Date(AHORA.getTime() - 80 * HORA) })], AHORA);
    expect(viejo?.urgencia).toBe("alta");
    expect(tareasDeLeads([envio({ submittedAt: new Date(AHORA.getTime() - 31 * 24 * HORA) })], AHORA)).toEqual([]);
    expect(
      tareasDeLeads([envio(), envio({ submittedAt: new Date(AHORA.getTime() - 80 * HORA) })], AHORA)
    ).toHaveLength(1);
  });
});

describe("armarBandeja — una entrada por regla, la más urgente primero", () => {
  it("agrupa por regla, resume con la cantidad y ordena por urgencia", () => {
    const bandeja = armarBandeja([
      { ruleId: "leads", titulo: "Ana", href: "/a", urgencia: "media" },
      { ruleId: "asistencia", titulo: "Revit 12", href: "/b", urgencia: "media", fecha: "2026-10-25" },
      { ruleId: "asistencia", titulo: "BIM 4", href: "/c", urgencia: "alta", fecha: "2026-10-20" },
    ]);
    expect(bandeja.map((g) => [g.ruleId, g.urgencia, g.resumen])).toEqual([
      ["asistencia", "alta", "2 clases sin pasar en 2 grupos"],
      ["leads", "media", "1 interesado sin contactar"],
    ]);
    expect(bandeja[0]?.items.map((i) => i.titulo)).toEqual(["BIM 4", "Revit 12"]);
  });

  it("las reglas de asistencia cuentan CLASES y dicen en cuántos grupos", () => {
    const bandeja = armarBandeja([
      { ruleId: "asistencia_zoom", titulo: "Revit — 12", href: "/a", urgencia: "media", fecha: "2026-10-24", cantidad: 2 },
      { ruleId: "asistencia_zoom", titulo: "BIM — 4", href: "/b", urgencia: "alta", fecha: "2026-10-03", cantidad: 7 },
      { ruleId: "asistencia_zoom", titulo: "AutoCAD — Noche", href: "/c", urgencia: "alta", fecha: "2026-10-10", cantidad: 1 },
      { ruleId: "asistencia_zoom", titulo: "Lumion — 2", href: "/d", urgencia: "alta", fecha: "2026-09-30", cantidad: 2 },
      { ruleId: "asistencia", titulo: "Revit — 13", href: "/e", urgencia: "media", fecha: "2026-10-25", cantidad: 3 },
      { ruleId: "facturar", titulo: "BIM — 5", href: "/f", urgencia: "media" },
    ]);
    expect(bandeja.map((g) => [g.ruleId, g.resumen, g.cantidad])).toEqual([
      ["asistencia_zoom", "12 clases para revisar en 4 grupos", 12],
      ["asistencia", "3 clases sin pasar", 3],
      ["facturar", "1 grupo con ventas sin factura", 1],
    ]);
    // Urgentes primero y, entre ellas, la más vieja primero.
    expect(bandeja[0]?.items.map((i) => i.titulo)).toEqual([
      "Lumion — 2",
      "BIM — 4",
      "AutoCAD — Noche",
      "Revit — 12",
    ]);
  });

  it("sin nada pendiente, la bandeja está vacía", () => {
    expect(armarBandeja([])).toEqual([]);
  });
});
