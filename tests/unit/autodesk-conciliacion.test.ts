import { describe, expect, it } from "vitest";
import {
  accionesSeguras,
  claveDeCaso,
  contarAjenos,
  contarCasos,
  estadoDelCurso,
  planDeConciliacion,
  resumenDeAsientos,
  subjectDeCorreo,
  tareasQueSeCierran,
  type EntradaDeConciliacion,
  type LicenciaDeTitular,
  type PersonaDelDirectorio,
  type TareaAbierta,
  type TitularDeLicencias,
} from "@/lib/autodesk-import/conciliacion";
import { csvDeExternos, csvDePendientes } from "@/lib/autodesk-import/csv";
import { claveDeStock } from "@/lib/license-team";

/**
 * 0091 — La conciliación con Autodesk, caso por caso. Datos SINTÉTICOS.
 *
 * Los equipos son `uy` (el que se concilia) y `py`; el programa es `revit`.
 */

const UY = "uy";
const PY = "py";

const alumno = (id: string, nombre: string, correos: string[], extra: Partial<PersonaDelDirectorio> = {}): PersonaDelDirectorio => ({
  ref: { tipo: "alumno", contactId: id },
  nombre,
  correos,
  archivada: false,
  ...extra,
});

const profesor = (id: string, nombre: string, correos: string[]): PersonaDelDirectorio => ({
  ref: { tipo: "profesor", teacherId: id },
  nombre,
  correos,
  archivada: false,
});

const licencia = (id: string, extra: Partial<LicenciaDeTitular> = {}): LicenciaDeTitular => ({
  licenseId: id,
  softwareId: "revit",
  teamId: UY,
  source: "individual",
  ocupa: true,
  ...extra,
});

const inscripcion = (
  contactId: string,
  enrollmentId: string,
  curso: TitularDeLicencias["curso"],
  licencias: LicenciaDeTitular[] = [],
  extra: Partial<TitularDeLicencias> = {}
): TitularDeLicencias => ({
  ref: { tipo: "alumno", contactId },
  enrollmentId,
  grupo: `Grupo ${enrollmentId}`,
  curso,
  programasDelGrupo: [],
  licenciaPropia: false,
  correo: null,
  licencias,
  ...extra,
});

const titularProfesor = (teacherId: string, licencias: LicenciaDeTitular[] = []): TitularDeLicencias => ({
  ref: { tipo: "profesor", teacherId },
  enrollmentId: null,
  grupo: null,
  curso: null,
  programasDelGrupo: [],
  licenciaPropia: false,
  correo: null,
  licencias,
});

const enAutodesk = (...correos: string[]) =>
  correos.map((email) => ({ email, softwareId: "revit", nombre: email.split("@")[0]!, offeringName: "Revit" }));

function plan(e: Partial<EntradaDeConciliacion> & { autodesk?: EntradaDeConciliacion["autodesk"] }) {
  return planDeConciliacion({
    teamId: UY,
    autodesk: [],
    directorio: [],
    alias: [],
    titulares: [],
    ...e,
  });
}

const caso = (p: ReturnType<typeof plan>, email: string) => p.casos.find((c) => c.email === email)!;

describe("Autodesk sí, campus sí", () => {
  it("coincide: queda verificada, sin nada que hacer", () => {
    const p = plan({
      autodesk: enAutodesk("ana@ejemplo.test"),
      directorio: [alumno("c1", "Ana", ["ana@ejemplo.test"])],
      titulares: [inscripcion("c1", "e1", "en_curso", [licencia("l1")])],
    });
    const c = caso(p, "ana@ejemplo.test");
    expect(c).toMatchObject({ tipo: "coincide", estado: "verificado", acciones: [], licenseId: "l1" });
    expect(accionesSeguras(p)).toEqual([]);
  });

  it("el correo de la LICENCIA de la inscripción también reconoce a la persona", () => {
    const p = plan({
      autodesk: enAutodesk("laboral@empresa.test"),
      directorio: [alumno("c1", "Ana", ["ana@ejemplo.test", "laboral@empresa.test"])],
      titulares: [inscripcion("c1", "e1", "en_curso", [licencia("l1")])],
    });
    expect(caso(p, "laboral@empresa.test").tipo).toBe("coincide");
  });

  it("el curso terminó pero Autodesk la sigue teniendo: se sugiere sacarla en Autodesk", () => {
    const p = plan({
      autodesk: enAutodesk("ana@ejemplo.test"),
      directorio: [alumno("c1", "Ana", ["ana@ejemplo.test"])],
      titulares: [inscripcion("c1", "e1", "finalizada", [licencia("l1", { ocupa: false })])],
    });
    expect(caso(p, "ana@ejemplo.test")).toMatchObject({
      tipo: "curso_terminado",
      sugerida: "sacar_en_autodesk",
      seguro: false,
      estado: "a_resolver",
    });
  });
});

describe("Autodesk sí, campus no", () => {
  const directorio = [alumno("c1", "Ana", ["ana@ejemplo.test"])];

  it("un único curso en marcha: se propone marcarlo, ya elegido, y es seguro", () => {
    const p = plan({
      autodesk: enAutodesk("ana@ejemplo.test"),
      directorio,
      titulares: [inscripcion("c1", "e1", "en_curso")],
    });
    const c = caso(p, "ana@ejemplo.test");
    expect(c).toMatchObject({ tipo: "falta_en_campus", sugerida: "asignar", preseleccionada: "e1", seguro: true });
    expect(accionesSeguras(p).map((s) => [s.accion, s.enrollmentId])).toEqual([["asignar", "e1"]]);
  });

  it("dos cursos en marcha: hay que elegir, no es seguro", () => {
    const p = plan({
      autodesk: enAutodesk("ana@ejemplo.test"),
      directorio,
      titulares: [inscripcion("c1", "e1", "en_curso"), inscripcion("c1", "e2", "planificada")],
    });
    const c = caso(p, "ana@ejemplo.test");
    expect(c).toMatchObject({ sugerida: null, preseleccionada: null, seguro: false });
    expect(c.candidatas).toHaveLength(2);
    expect(accionesSeguras(p)).toEqual([]);
  });

  it("solo cursos terminados: no debería tenerla → sugiere sacarla en Autodesk", () => {
    const p = plan({
      autodesk: enAutodesk("ana@ejemplo.test"),
      directorio,
      titulares: [inscripcion("c1", "e1", "finalizada")],
    });
    expect(caso(p, "ana@ejemplo.test")).toMatchObject({ sugerida: "sacar_en_autodesk", seguro: false });
  });

  it("un interesado sin grupo no cuenta como curso en marcha (curso terminado + lead)", () => {
    // Una inscripción sin grupo es un lead del pipeline, no un curso: su estado
    // "sin_fechas" no puede hacerla candidata a recibir la licencia.
    const p = plan({
      autodesk: enAutodesk("ana@ejemplo.test"),
      directorio,
      titulares: [
        inscripcion("c1", "e1", "finalizada"),
        inscripcion("c1", "lead", "sin_fechas", [], { conGrupo: false, grupo: null }),
      ],
    });
    const c = caso(p, "ana@ejemplo.test");
    expect(c).toMatchObject({ sugerida: "sacar_en_autodesk", seguro: false });
    expect(c.candidatas.map((k) => k.enrollmentId)).toEqual(["e1"]);
    expect(accionesSeguras(p)).toEqual([]);
  });

  it("no cursa nada: sugiere sacarla en Autodesk", () => {
    const p = plan({ autodesk: enAutodesk("ana@ejemplo.test"), directorio });
    const c = caso(p, "ana@ejemplo.test");
    expect(c).toMatchObject({ tipo: "falta_en_campus", sugerida: "sacar_en_autodesk" });
    expect(c.nota).toMatch(/No cursa nada/);
  });

  it("el programa es del grupo: no se asigna por alumno", () => {
    const p = plan({
      autodesk: enAutodesk("ana@ejemplo.test"),
      directorio,
      titulares: [inscripcion("c1", "e1", "en_curso", [], { programasDelGrupo: ["revit"] })],
    });
    const c = caso(p, "ana@ejemplo.test");
    expect(c.sugerida).toBeNull();
    expect(c.seguro).toBe(false);
    expect(c.nota).toMatch(/del grupo/);
  });

  it("quien trajo su licencia propia no se candidatea", () => {
    const p = plan({
      autodesk: enAutodesk("ana@ejemplo.test"),
      directorio,
      titulares: [inscripcion("c1", "e1", "en_curso", [], { licenciaPropia: true })],
    });
    expect(caso(p, "ana@ejemplo.test").candidatas[0]!.bloqueo).toBe("licencia_propia");
    expect(caso(p, "ana@ejemplo.test").seguro).toBe(false);
  });

  it("un profesor: se propone asignarle la licencia, y es seguro", () => {
    const p = plan({
      autodesk: enAutodesk("prof@ejemplo.test"),
      directorio: [profesor("t1", "Prof", ["prof@ejemplo.test"])],
      titulares: [titularProfesor("t1")],
    });
    expect(caso(p, "prof@ejemplo.test")).toMatchObject({ tipo: "falta_en_campus", sugerida: "asignar", seguro: true });
  });

  it("una persona dada de baja: sugiere sacarla en Autodesk", () => {
    const p = plan({
      autodesk: enAutodesk("ana@ejemplo.test"),
      directorio: [alumno("c1", "Ana", ["ana@ejemplo.test"], { archivada: true })],
      titulares: [inscripcion("c1", "e1", "en_curso")],
    });
    expect(caso(p, "ana@ejemplo.test")).toMatchObject({ personaArchivada: true, sugerida: "sacar_en_autodesk", seguro: false });
  });
});

describe("externos", () => {
  it("nadie en el campus con ese correo: es un externo, con mantener / vincular / sacar", () => {
    const p = plan({ autodesk: enAutodesk("afuera@otro.test") });
    expect(caso(p, "afuera@otro.test")).toMatchObject({
      tipo: "externo",
      acciones: ["mantener", "vincular", "sacar_en_autodesk"],
      sugerida: null,
      seguro: false,
    });
  });

  it("el correo secundario de alguien SUGIERE vincular, nunca vincula solo", () => {
    const p = plan({
      autodesk: enAutodesk("personal@mail.test"),
      directorio: [alumno("c1", "Ana", ["ana@ejemplo.test"], { secundarios: ["personal@mail.test"] })],
    });
    const c = caso(p, "personal@mail.test");
    expect(c.tipo).toBe("externo");
    expect(c.sugerencia?.nombre).toBe("Ana");
  });

  it("un correo que comparten dos personas queda para vincular a mano", () => {
    const p = plan({
      autodesk: enAutodesk("compartido@ejemplo.test"),
      directorio: [alumno("c1", "Ana", ["compartido@ejemplo.test"]), alumno("c2", "Beto", ["compartido@ejemplo.test"])],
    });
    const c = caso(p, "compartido@ejemplo.test");
    expect(c.tipo).toBe("externo");
    expect(c.nota).toMatch(/más de una persona/);
  });

  it("un correo vinculado a mano (alias) deja de ser externo", () => {
    const p = plan({
      autodesk: enAutodesk("raro@otro.test"),
      directorio: [alumno("c1", "Ana", ["ana@ejemplo.test"])],
      alias: [{ email: "raro@otro.test", ref: { tipo: "alumno", contactId: "c1" } }],
      titulares: [inscripcion("c1", "e1", "en_curso")],
    });
    expect(caso(p, "raro@otro.test")).toMatchObject({ tipo: "falta_en_campus", sugerida: "asignar" });
  });

  it("cuenta desde cuándo aparece, con el historial de importaciones", () => {
    const p = plan({
      autodesk: enAutodesk("afuera@otro.test"),
      apariciones: new Map([["afuera@otro.test|revit", { n: 3, de: 4, desde: "2026-08-01T00:00:00.000Z" }]]),
    });
    expect(caso(p, "afuera@otro.test").aparece).toEqual({ n: 3, de: 4, desde: "2026-08-01T00:00:00.000Z" });
  });
});

describe("campus sí, Autodesk no (la decisión del dueño)", () => {
  const directorio = [alumno("c1", "Ana", ["ana@ejemplo.test"])];

  it("curso FINALIZADO: se sugiere desmarcar y entra en «lo seguro»", () => {
    const p = plan({
      directorio,
      titulares: [inscripcion("c1", "e1", "finalizada", [licencia("l1", { ocupa: false })], { correo: "ana@ejemplo.test" })],
    });
    const c = p.casos[0]!;
    expect(c).toMatchObject({ tipo: "falta_en_autodesk", sugerida: "desmarcar", seguro: true, licenseId: "l1" });
    expect(accionesSeguras(p).map((s) => s.accion)).toEqual(["desmarcar"]);
  });

  it("curso EN CURSO: queda PENDIENTE en Autodesk, no se desmarca solo", () => {
    const p = plan({
      directorio,
      titulares: [inscripcion("c1", "e1", "en_curso", [licencia("l1")], { correo: "ana@ejemplo.test" })],
    });
    const c = p.casos[0]!;
    expect(c).toMatchObject({ tipo: "falta_en_autodesk", sugerida: "pendiente_en_autodesk", seguro: false });
    expect(c.acciones).toEqual(["pendiente_en_autodesk", "desmarcar", "omitir"]);
    expect(accionesSeguras(p)).toEqual([]);
  });

  it("curso por empezar: también pendiente en Autodesk", () => {
    const p = plan({
      directorio,
      titulares: [inscripcion("c1", "e1", "planificada", [licencia("l1")])],
    });
    expect(p.casos[0]!.sugerida).toBe("pendiente_en_autodesk");
  });

  it("un profesor: pendiente en Autodesk (su licencia no vence con ningún curso)", () => {
    const p = plan({
      directorio: [profesor("t1", "Prof", ["prof@ejemplo.test"])],
      titulares: [titularProfesor("t1", [licencia("l1")])],
    });
    expect(p.casos[0]).toMatchObject({ tipo: "falta_en_autodesk", sugerida: "pendiente_en_autodesk" });
  });

  it("licencia del GRUPO: no se desmarca por persona", () => {
    const p = plan({
      directorio,
      titulares: [inscripcion("c1", "e1", "finalizada", [licencia("l1", { ocupa: false, source: "grupo" })])],
    });
    const c = p.casos[0]!;
    expect(c.acciones).not.toContain("desmarcar");
    expect(c.sugerida).toBeNull();
    expect(c.seguro).toBe(false);
    expect(c.nota).toMatch(/grupo/);
  });

  it("una licencia de OTRO equipo no cuenta en este", () => {
    const p = plan({
      directorio,
      titulares: [inscripcion("c1", "e1", "en_curso", [licencia("l1", { teamId: PY })])],
    });
    expect(p.casos).toEqual([]);
  });

  it("si Autodesk la tiene en OTRO equipo, no es «falta en Autodesk» acá (aparece allá como «en otro equipo»)", () => {
    const p = plan({
      directorio,
      titulares: [inscripcion("c1", "e1", "en_curso", [licencia("l1")])],
      otrosEquipos: [{ email: "ana@ejemplo.test", softwareId: "revit", teamId: PY }],
    });
    expect(p.casos).toEqual([]);
  });
});

describe("la licencia está anotada en otro equipo del campus", () => {
  it("Autodesk la tiene en este equipo: se propone pasarla, y es seguro", () => {
    const p = plan({
      autodesk: enAutodesk("ana@ejemplo.test"),
      directorio: [alumno("c1", "Ana", ["ana@ejemplo.test"])],
      titulares: [inscripcion("c1", "e1", "en_curso", [licencia("l1", { teamId: PY })])],
    });
    const c = caso(p, "ana@ejemplo.test");
    expect(c).toMatchObject({ tipo: "en_otro_equipo", sugerida: "mover", destinoTeamId: UY, licenseId: "l1", seguro: true });
    expect(accionesSeguras(p).map((s) => s.accion)).toEqual(["mover"]);
  });

  it("si es del grupo, no se mueve sola: se cambia el equipo del programa del grupo", () => {
    const p = plan({
      autodesk: enAutodesk("ana@ejemplo.test"),
      directorio: [alumno("c1", "Ana", ["ana@ejemplo.test"])],
      titulares: [inscripcion("c1", "e1", "en_curso", [licencia("l1", { teamId: PY, source: "grupo" })])],
    });
    const c = caso(p, "ana@ejemplo.test");
    expect(c.acciones).toEqual(["omitir"]);
    expect(c.seguro).toBe(false);
  });
});

describe("decisiones y tareas", () => {
  const base = {
    autodesk: enAutodesk("afuera@otro.test"),
  };

  it("un caso resuelto no vuelve a aparecer mientras su situación no cambie", () => {
    const sin = plan(base);
    const huella = caso(sin, "afuera@otro.test").huella;
    const p = plan({
      ...base,
      resoluciones: [
        {
          teamId: UY,
          softwareId: "revit",
          subject: subjectDeCorreo("afuera@otro.test"),
          decision: "mantener",
          nota: "Es del estudio",
          huella,
          resueltoPor: "u1",
          resueltoEn: "2026-10-01T00:00:00.000Z",
        },
      ],
    });
    expect(caso(p, "afuera@otro.test")).toMatchObject({
      estado: "resuelto",
      resolucion: { decision: "mantener", nota: "Es del estudio" },
    });
  });

  it("si la situación cambia (otra huella), vuelve a estar a resolver", () => {
    const p = plan({
      ...base,
      resoluciones: [
        {
          teamId: UY,
          softwareId: "revit",
          subject: subjectDeCorreo("afuera@otro.test"),
          decision: "omitir",
          nota: null,
          huella: "una-situacion-vieja",
          resueltoPor: null,
          resueltoEn: "2026-10-01T00:00:00.000Z",
        },
      ],
    });
    expect(caso(p, "afuera@otro.test")).toMatchObject({ estado: "a_resolver", resolucion: null });
  });

  it("la huella de «falta en el campus» cambia cuando la persona se inscribe a otro curso", () => {
    const entrada = { autodesk: enAutodesk("ana@ejemplo.test"), directorio: [alumno("c1", "Ana", ["ana@ejemplo.test"])] };
    const antes = plan({ ...entrada, titulares: [inscripcion("c1", "e1", "en_curso")] });
    const despues = plan({ ...entrada, titulares: [inscripcion("c1", "e1", "en_curso"), inscripcion("c1", "e2", "en_curso")] });
    expect(caso(antes, "ana@ejemplo.test").huella).not.toBe(caso(despues, "ana@ejemplo.test").huella);
  });

  it("un caso con una tarea abierta está «pendiente», no «a resolver»", () => {
    const tarea: TareaAbierta = {
      id: "t1",
      teamId: UY,
      softwareId: "revit",
      kind: "sacar_en_autodesk",
      email: "afuera@otro.test",
      ref: null,
      persona: null,
      creadaEn: "2026-10-01T00:00:00.000Z",
    };
    const p = plan({ ...base, tareas: [tarea] });
    expect(caso(p, "afuera@otro.test")).toMatchObject({ estado: "pendiente", tarea: { id: "t1", kind: "sacar_en_autodesk" } });
    expect(accionesSeguras(p)).toEqual([]);
  });

  it("la tarea «asignar en Autodesk» de una persona sin correo se enlaza por la persona", () => {
    const p = plan({
      directorio: [alumno("c1", "Ana", ["ana@ejemplo.test"])],
      titulares: [inscripcion("c1", "e1", "en_curso", [licencia("l1")])],
      tareas: [
        {
          id: "t2",
          teamId: UY,
          softwareId: "revit",
          kind: "asignar_en_autodesk",
          email: null,
          ref: { tipo: "alumno", contactId: "c1" },
          persona: "Ana",
          creadaEn: "2026-10-01T00:00:00.000Z",
        },
      ],
    });
    expect(p.casos[0]!.estado).toBe("pendiente");
  });

  it("la clave del caso es estable entre vista previa y reporte", () => {
    const p = plan(base);
    expect(caso(p, "afuera@otro.test").clave).toBe(claveDeCaso("revit", subjectDeCorreo("afuera@otro.test")));
  });
});

describe("las tareas pendientes en Autodesk se cierran solas", () => {
  const t = (id: string, kind: TareaAbierta["kind"], email: string | null, teamId = UY): TareaAbierta => ({
    id,
    teamId,
    softwareId: "revit",
    kind,
    email,
    ref: null,
    persona: null,
    creadaEn: "2026-10-01T00:00:00.000Z",
  });

  it("«asignar»: se cierra cuando el correo ya aparece en el archivo", () => {
    expect(tareasQueSeCierran([t("a", "asignar_en_autodesk", "ana@ejemplo.test")], enAutodesk("ana@ejemplo.test"), UY)).toEqual(["a"]);
    expect(tareasQueSeCierran([t("a", "asignar_en_autodesk", "ana@ejemplo.test")], enAutodesk("otra@ejemplo.test"), UY)).toEqual([]);
  });

  it("«sacar»: se cierra cuando el correo ya NO aparece", () => {
    expect(tareasQueSeCierran([t("s", "sacar_en_autodesk", "ana@ejemplo.test")], enAutodesk("otra@ejemplo.test"), UY)).toEqual(["s"]);
    expect(tareasQueSeCierran([t("s", "sacar_en_autodesk", "ana@ejemplo.test")], enAutodesk("ana@ejemplo.test"), UY)).toEqual([]);
  });

  it("una tarea sin correo no se puede verificar: queda abierta; y la de otro equipo no se toca", () => {
    expect(tareasQueSeCierran([t("x", "sacar_en_autodesk", null)], [], UY)).toEqual([]);
    expect(tareasQueSeCierran([t("y", "sacar_en_autodesk", "ana@ejemplo.test", PY)], [], UY)).toEqual([]);
  });
});

describe("cuentas por programa y asientos ajenos", () => {
  // Cupo 5. Campus (ocupan): Ana, Beto. Autodesk: Ana, Beto, Carla (falta marcar) y un externo.
  const directorio = [
    alumno("c1", "Ana", ["ana@ejemplo.test"]),
    alumno("c2", "Beto", ["beto@ejemplo.test"]),
    alumno("c3", "Carla", ["carla@ejemplo.test"]),
  ];
  const titulares = [
    inscripcion("c1", "e1", "en_curso", [licencia("l1")]),
    inscripcion("c2", "e2", "en_curso", [licencia("l2")]),
    inscripcion("c3", "e3", "en_curso"),
  ];
  const autodesk = enAutodesk("ana@ejemplo.test", "beto@ejemplo.test", "carla@ejemplo.test", "afuera@otro.test");

  it("el resumen: lo que Autodesk tiene y el campus no cuenta resta de lo libre", () => {
    const p = plan({ autodesk, directorio, titulares });
    expect(contarCasos(p.casos)).toMatchObject({ coincide: 2, falta_en_campus: 1, externo: 1 });
    const [r] = resumenDeAsientos(
      p,
      new Map([["revit", 5]]),
      new Map([["revit", { alumnos: 2, profesores: 0 }]]),
      autodesk
    );
    expect(r).toMatchObject({
      cupo: 5,
      enAutodesk: 4,
      coinciden: 2,
      soloAutodesk: 2,
      externos: 1,
      soloCampus: 0,
      descuadre: true,
    });
  });

  it("contarAjenos da la misma cuenta que el plan (es lo que le resta al disponible)", () => {
    const ajenos = contarAjenos(
      autodesk.map((a) => ({ ...a, teamId: UY })),
      [
        { teamId: UY, softwareId: "revit", ocupa: true, ref: { tipo: "alumno", contactId: "c1" }, correos: ["ana@ejemplo.test"] },
        { teamId: UY, softwareId: "revit", ocupa: true, ref: { tipo: "alumno", contactId: "c2" }, correos: ["beto@ejemplo.test"] },
      ],
      []
    );
    expect(ajenos.get(claveDeStock(UY, "revit"))).toBe(2);
  });

  it("una licencia de un curso terminado NO cubre el asiento: Autodesk lo sigue teniendo ocupado", () => {
    const ajenos = contarAjenos(
      enAutodesk("ana@ejemplo.test").map((a) => ({ ...a, teamId: UY })),
      [{ teamId: UY, softwareId: "revit", ocupa: false, ref: { tipo: "alumno", contactId: "c1" }, correos: ["ana@ejemplo.test"] }],
      []
    );
    expect(ajenos.get(claveDeStock(UY, "revit"))).toBe(1);
  });

  it("la licencia anotada en OTRO equipo no cubre el asiento de este", () => {
    const ajenos = contarAjenos(
      enAutodesk("ana@ejemplo.test").map((a) => ({ ...a, teamId: UY })),
      [{ teamId: PY, softwareId: "revit", ocupa: true, ref: { tipo: "alumno", contactId: "c1" }, correos: ["ana@ejemplo.test"] }],
      []
    );
    expect(ajenos.get(claveDeStock(UY, "revit"))).toBe(1);
  });

  it("un correo vinculado a mano (alias) cubre el asiento de esa persona", () => {
    const ajenos = contarAjenos(
      enAutodesk("raro@otro.test").map((a) => ({ ...a, teamId: UY })),
      [{ teamId: UY, softwareId: "revit", ocupa: true, ref: { tipo: "alumno", contactId: "c1" }, correos: ["ana@ejemplo.test"] }],
      [{ email: "raro@otro.test", ref: { tipo: "alumno", contactId: "c1" } }]
    );
    expect(ajenos.size).toBe(0);
  });

  it("el mismo correo repetido en la foto cuenta una sola vez", () => {
    const fila = { teamId: UY, softwareId: "revit", email: "afuera@otro.test" };
    expect(contarAjenos([fila, fila], [], []).get(claveDeStock(UY, "revit"))).toBe(1);
  });

  it("sin importaciones no hay asientos ajenos", () => {
    expect(contarAjenos([], [], []).size).toBe(0);
  });
});

describe("aplicar lo seguro", () => {
  it("toca solo lo que no tiene dos lecturas; lo ambiguo, lo externo y lo pendiente quedan", () => {
    const p = plan({
      teamId: UY,
      autodesk: enAutodesk(
        "unica@ejemplo.test", // un curso en marcha → seguro
        "doble@ejemplo.test", // dos cursos → ambiguo
        "afuera@otro.test", // externo
        "movida@ejemplo.test" // licencia en otro equipo → seguro
      ),
      directorio: [
        alumno("c1", "Unica", ["unica@ejemplo.test"]),
        alumno("c2", "Doble", ["doble@ejemplo.test"]),
        alumno("c3", "Movida", ["movida@ejemplo.test"]),
        alumno("c4", "Termino", ["termino@ejemplo.test"]),
        alumno("c5", "EnCurso", ["encurso@ejemplo.test"]),
      ],
      titulares: [
        inscripcion("c1", "e1", "en_curso"),
        inscripcion("c2", "e2", "en_curso"),
        inscripcion("c2", "e3", "planificada"),
        inscripcion("c3", "e4", "en_curso", [licencia("lm", { teamId: PY })]),
        inscripcion("c4", "e5", "finalizada", [licencia("lt", { ocupa: false })]), // campus sí, Autodesk no, terminó → seguro
        inscripcion("c5", "e6", "en_curso", [licencia("lc")]), // campus sí, Autodesk no, en curso → pendiente
      ],
    });
    expect(accionesSeguras(p).map((s) => `${s.accion}:${s.caso.nombre}`).sort()).toEqual([
      "asignar:Unica",
      "desmarcar:Termino",
      "mover:Movida",
    ]);
  });

  it("es idempotente: una vez aplicado, la segunda corrida no encuentra nada seguro", () => {
    const entrada = {
      autodesk: enAutodesk("unica@ejemplo.test"),
      directorio: [alumno("c1", "Unica", ["unica@ejemplo.test"])],
    };
    expect(accionesSeguras(plan({ ...entrada, titulares: [inscripcion("c1", "e1", "en_curso")] }))).toHaveLength(1);
    // Después de marcar la licencia, el caso coincide.
    expect(accionesSeguras(plan({ ...entrada, titulares: [inscripcion("c1", "e1", "en_curso", [licencia("nueva")])] }))).toEqual([]);
  });

  it("un caso resuelto («omitir») ya no entra en lo seguro", () => {
    const entrada: Partial<EntradaDeConciliacion> = {
      autodesk: enAutodesk("unica@ejemplo.test"),
      directorio: [alumno("c1", "Unica", ["unica@ejemplo.test"])],
      titulares: [inscripcion("c1", "e1", "en_curso")],
    };
    const huella = caso(plan(entrada), "unica@ejemplo.test").huella;
    const resuelto = plan({
      ...entrada,
      resoluciones: [
        { teamId: UY, softwareId: "revit", subject: subjectDeCorreo("unica@ejemplo.test"), decision: "omitir", nota: null, huella, resueltoPor: null, resueltoEn: "2026-10-01T00:00:00.000Z" },
      ],
    });
    expect(accionesSeguras(resuelto)).toEqual([]);
  });
});

describe("estadoDelCurso", () => {
  const ahora = new Date("2026-10-30T15:00:00.000Z");
  it("sin cohorte o sin fechas no prueba que el curso terminó", () => {
    expect(estadoDelCurso(null, ahora)).toBe("sin_fechas");
    expect(estadoDelCurso({ startDate: null, endDate: null }, ahora)).toBe("sin_fechas");
  });
  it("sigue la regla de las cohortes", () => {
    expect(estadoDelCurso({ startDate: new Date("2026-01-01T00:00:00.000Z"), endDate: new Date("2026-03-01T00:00:00.000Z") }, ahora)).toBe("finalizada");
    expect(estadoDelCurso({ startDate: new Date("2026-10-01T00:00:00.000Z"), endDate: null }, ahora)).toBe("en_curso");
    expect(estadoDelCurso({ startDate: new Date("2027-01-01T00:00:00.000Z"), endDate: null }, ahora)).toBe("planificada");
  });
  it("con solo fecha de fin, terminó cuando ya pasó", () => {
    expect(estadoDelCurso({ startDate: null, endDate: new Date("2026-01-01T00:00:00.000Z") }, ahora)).toBe("finalizada");
    expect(estadoDelCurso({ startDate: null, endDate: new Date("2027-01-01T00:00:00.000Z") }, ahora)).toBe("sin_fechas");
  });
});

describe("los CSV de Soporte", () => {
  it("externos: una fila por externo, con el correo protegido contra fórmulas", () => {
    const p = plan({ autodesk: enAutodesk("afuera@otro.test", "=cmd@otro.test") });
    const csv = csvDeExternos(p.casos.map((c) => ({ ...c, programa: "Revit", equipo: "Uruguay ATC" })));
    const lineas = csv.split("\r\n");
    expect(lineas[0]).toContain("Equipo,Programa,Correo");
    expect(lineas).toHaveLength(3);
    expect(csv).toContain("afuera@otro.test");
    expect(csv).toContain("'=cmd@otro.test");
  });

  it("pendientes: qué hacer en Autodesk, a quién y desde cuándo", () => {
    const csv = csvDePendientes([
      { equipo: "Uruguay ATC", programa: "Revit", kind: "sacar_en_autodesk", email: "afuera@otro.test", persona: null, creadaEn: "2026-10-01T10:00:00.000Z" },
    ]);
    expect(csv.split("\r\n")[1]).toBe("Uruguay ATC,Revit,Sacar en Autodesk,afuera@otro.test,,2026-10-01");
  });

  it("no incluye nada que no sea un externo", () => {
    const p = plan({
      autodesk: enAutodesk("ana@ejemplo.test"),
      directorio: [alumno("c1", "Ana", ["ana@ejemplo.test"])],
      titulares: [inscripcion("c1", "e1", "en_curso", [licencia("l1")])],
    });
    expect(csvDeExternos(p.casos.map((c) => ({ ...c, programa: "Revit", equipo: "UY" }))).split("\r\n")).toHaveLength(1);
  });
});
