import { describe, expect, it } from "vitest";
import {
  agruparPersonas,
  armarSugerencia,
  jaroWinkler,
  llavesDePersona,
  minutosConectado,
  normalizarNombre,
  planDeAprendizaje,
  planDeConfirmacion,
  umbralPresente,
  UMBRALES_DE_FABRICA,
  type AliasAprendido,
  type AlumnoDelGrupo,
  type SegmentoZoom,
} from "@/lib/zoom-attendance";

/**
 * Asistencia sugerida desde Zoom (constitución 1.9.0) — la parte pura: quién
 * es quién, cuántos minutos estuvo y qué se sugiere. Nombres de verdad, como
 * llegan de Zoom: con tildes, emojis, "iPhone de…", títulos y dispositivos
 * repetidos.
 */

const INICIO = new Date("2026-10-20T21:00:00Z");
const FIN = new Date("2026-10-20T23:00:00Z"); // 120 minutos
const ventana = { inicio: INICIO, fin: FIN };

const min = (m: number) => new Date(INICIO.getTime() + m * 60_000);

let n = 0;
function seg(name: string, desde: number, hasta: number, extra: Partial<SegmentoZoom> = {}): SegmentoZoom {
  n++;
  return {
    participantId: extra.participantId ?? `p${n}`,
    participantUserId: null,
    registrantId: null,
    name,
    email: null,
    joinTime: min(desde),
    leaveTime: min(hasta),
    breakout: false,
    waitingRoom: false,
    ...extra,
  };
}

const ROSTER: AlumnoDelGrupo[] = [
  { enrollmentId: "enr_ana", contactId: "ct_ana", nombre: "Ana Lucía Pérez", correos: ["ana.perez@gmail.com"] },
  { enrollmentId: "enr_juan", contactId: "ct_juan", nombre: "Juan Martín Rodríguez", correos: [] },
  { enrollmentId: "enr_maria", contactId: "ct_maria", nombre: "María José González", correos: ["mjg@empresa.uy"] },
  { enrollmentId: "enr_mariaf", contactId: "ct_mariaf", nombre: "María Fernández", correos: [] },
  { enrollmentId: "enr_seba", contactId: "ct_seba", nombre: "Sebastián Núñez", correos: [] },
];

const SIN_EXCLUSIONES = { correos: [], zoomUserIds: [] };

describe("normalizarNombre", () => {
  it.each([
    ["Ana Lucía Pérez", "ana lucia perez"],
    ["iPhone de Juan", "juan"],
    ["Galaxy de María José", "maria jose"],
    ["Juan's iPhone", "juan"],
    ["Arq. Sebastián Núñez 🎓", "sebastian nunez"],
    ["Ing. María Fernández (CadIT)", "maria fernandez"],
    ["SEBA NUÑEZ 2", "seba nunez"],
    ["iPad", ""],
    ["  Dra.   Ana   Pérez  ", "ana perez"],
  ])("%s → %s", (entrada, salida) => {
    expect(normalizarNombre(entrada)).toBe(salida);
  });
});

describe("jaroWinkler", () => {
  it("parecidos altos, distintos bajos", () => {
    expect(jaroWinkler("gonzalez", "gonzales")).toBeGreaterThan(0.9);
    expect(jaroWinkler("rodriguez", "rodrigues")).toBeGreaterThan(0.9);
    expect(jaroWinkler("ana", "juan")).toBeLessThan(0.8);
    expect(jaroWinkler("perez", "perez")).toBe(1);
  });
});

describe("minutosConectado: la UNIÓN de tramos, no la suma", () => {
  it("teléfono y computadora a la vez no cuentan doble", () => {
    const r = minutosConectado([seg("a", 0, 60), seg("a", 30, 90)], ventana);
    expect(r.minutos).toBe(90);
    expect(r.primeraEntrada).toEqual(min(0));
  });

  it("recorta a la ventana de la clase ± 15 minutos", () => {
    const r = minutosConectado([seg("a", -60, 10), seg("a", 110, 200)], ventana);
    // [-15, 10] = 25 y [110, 135] = 25
    expect(r.minutos).toBe(50);
  });

  it("la sala de espera no suma minutos", () => {
    const r = minutosConectado([seg("a", 0, 30, { waitingRoom: true }), seg("a", 30, 40)], ventana);
    expect(r.minutos).toBe(10);
    expect(r.primeraEntrada).toEqual(min(30));
  });

  it("redondea hacia abajo", () => {
    const s = seg("a", 0, 0);
    s.leaveTime = new Date(INICIO.getTime() + 59 * 60_000 + 59_000);
    expect(minutosConectado([s], ventana).minutos).toBe(59);
  });
});

describe("agruparPersonas", () => {
  it("una persona por llave: usuario de Zoom › registrante › correo › nombre", () => {
    const personas = agruparPersonas([
      seg("Ana Pérez", 0, 40, { participantUserId: "zu_ana", email: "ana.perez@gmail.com" }),
      seg("Ana Pérez", 50, 120, { participantUserId: "zu_ana", email: "ana.perez@gmail.com" }),
      seg("iPhone de Juan", 0, 120),
      seg("Juan's iPhone", 10, 20),
      seg("MJG", 0, 120, { email: "MJG@empresa.uy" }),
    ]);
    expect(personas.map((p) => p.key).sort()).toEqual([
      "correo:mjg@empresa.uy",
      "nombre:juan",
      "usuario_zoom:zu_ana",
    ]);
    const juan = personas.find((p) => p.key === "nombre:juan")!;
    expect(juan.nombres.sort()).toEqual(["Juan's iPhone", "iPhone de Juan"].sort());
  });

  it("las llaves de aprendizaje incluyen todas las que la persona trae", () => {
    const [p] = agruparPersonas([
      seg("Ana Pérez", 0, 40, { participantUserId: "zu_ana", registrantId: "rg_1", email: "ana@x.uy" }),
      seg("iPhone de Ana", 0, 40, { participantUserId: "zu_ana" }),
    ]);
    expect(llavesDePersona(p!)).toEqual([
      { keyKind: "usuario_zoom", key: "zu_ana" },
      { keyKind: "registrante", key: "rg_1" },
      { keyKind: "correo", key: "ana@x.uy" },
      { keyKind: "nombre", key: "ana" },
      { keyKind: "nombre", key: "ana perez" },
    ]);
  });

  it("un nombre que queda vacío (\"iPad\") no se vuelve llave de nombre", () => {
    const [p] = agruparPersonas([seg("iPad", 0, 40, { participantId: "dev1" })]);
    expect(p!.key).toBe("anonimo:dev1");
    expect(llavesDePersona(p!)).toEqual([]);
  });
});

describe("umbralPresente", () => {
  it("50 % con piso de 20 minutos", () => {
    expect(umbralPresente(120, UMBRALES_DE_FABRICA)).toBe(60);
    expect(umbralPresente(30, UMBRALES_DE_FABRICA)).toBe(20);
    expect(umbralPresente(45, { minPct: 50, minMinutes: 20, lateMinutes: null })).toBe(23);
  });
});

function sugerir(segmentos: SegmentoZoom[], extra: { aliases?: AliasAprendido[]; exclusiones?: { correos: string[]; zoomUserIds: string[] } } = {}) {
  return armarSugerencia({
    segmentos,
    ventana,
    alumnos: ROSTER,
    aliases: extra.aliases ?? [],
    exclusiones: extra.exclusiones ?? SIN_EXCLUSIONES,
    umbrales: UMBRALES_DE_FABRICA,
  });
}

const fila = (s: ReturnType<typeof sugerir>, enrollmentId: string) =>
  s.alumnos.find((a) => a.enrollmentId === enrollmentId)!;

describe("armarSugerencia — coincidencias", () => {
  it("correo igual a uno del grupo → alta", () => {
    const s = sugerir([seg("Ana", 0, 110, { email: "ana.perez@gmail.com" })]);
    expect(fila(s, "enr_ana")).toMatchObject({ sugerido: "presente", minutos: 110, confianza: "alta", coincidencia: "correo" });
  });

  it("nombre con dispositivo y sin tildes → media", () => {
    const s = sugerir([seg("iPhone de Juan Rodriguez", 0, 100)]);
    expect(fila(s, "enr_juan")).toMatchObject({ sugerido: "presente", confianza: "media", coincidencia: "nombre" });
  });

  it("nombre con un error de tipeo (Gonzales) → media por parecido", () => {
    const s = sugerir([seg("Maria Jose Gonzales", 0, 100)]);
    expect(fila(s, "enr_maria")).toMatchObject({ confianza: "media", coincidencia: "nombre" });
  });

  it("un solo nombre repetido en el grupo (\"María\") → baja, sin asignar, con candidatas", () => {
    const s = sugerir([seg("María", 0, 100)]);
    expect(fila(s, "enr_maria")).toMatchObject({ sugerido: "ausente", motivo: "no_aparecio", confianza: null });
    const [sin] = s.sinIdentificar;
    expect(sin!.confianza).toBe("baja");
    expect(sin!.candidatos.map((c) => c.enrollmentId).sort()).toEqual(["enr_maria", "enr_mariaf"]);
    expect(fila(s, "enr_maria").posibles).toEqual([sin!.key]);
  });

  it("un solo nombre ÚNICO en el grupo (\"Sebastián\") → media", () => {
    const s = sugerir([seg("Sebastián", 0, 100)]);
    expect(fila(s, "enr_seba")).toMatchObject({ confianza: "media", sugerido: "presente" });
  });

  it("alguien que no está en el grupo queda sin identificar", () => {
    const s = sugerir([seg("Pedro Gómez", 0, 100)]);
    expect(s.sinIdentificar).toHaveLength(1);
    expect(s.sinIdentificar[0]!.candidatos).toEqual([]);
    expect(s.sinIdentificar[0]!.confianza).toBeNull();
  });

  it("dos dispositivos de la misma alumna: se unen los minutos (unión, no suma)", () => {
    const s = sugerir([
      seg("Ana Lucía Pérez", 0, 50, { email: "ana.perez@gmail.com" }),
      seg("iPhone de Ana Pérez", 40, 70),
    ]);
    const ana = fila(s, "enr_ana");
    expect(ana.minutos).toBe(70);
    expect(ana.sugerido).toBe("presente");
    expect(ana.personas).toHaveLength(2);
    // La menos segura de las dos manda.
    expect(ana.confianza).toBe("media");
  });

  it("poco tiempo → ausente con los minutos; nadie visto → ausente, no apareció", () => {
    const s = sugerir([seg("Juan Rodríguez", 0, 15)]);
    expect(fila(s, "enr_juan")).toMatchObject({ sugerido: "ausente", motivo: "poco_tiempo", minutos: 15 });
    expect(fila(s, "enr_seba")).toMatchObject({ sugerido: "ausente", motivo: "no_aparecio", minutos: 0 });
  });

  it("tarde solo si la organización lo enciende", () => {
    const segs = [seg("Juan Rodríguez", 30, 120)];
    expect(fila(sugerir(segs), "enr_juan").sugerido).toBe("presente");
    const conTarde = armarSugerencia({
      segmentos: segs,
      ventana,
      alumnos: ROSTER,
      aliases: [],
      exclusiones: SIN_EXCLUSIONES,
      umbrales: { minPct: 50, minMinutes: 20, lateMinutes: 15 },
    });
    expect(fila(conTarde, "enr_juan").sugerido).toBe("tarde");
  });
});

describe("armarSugerencia — exclusiones", () => {
  it("anfitrión, profesor, equipo e ignorados no cuentan ni quedan sin identificar", () => {
    const s = sugerir(
      [
        seg("Aula 3", 0, 120, { participantUserId: "zu_aula3" }),
        seg("Prof. Carla", 0, 120, { email: "carla@cadit.uy" }),
        seg("Otter.ai", 0, 120),
        seg("Juan Rodríguez", 0, 120),
      ],
      {
        exclusiones: { correos: ["carla@cadit.uy"], zoomUserIds: ["zu_aula3"] },
        aliases: [alias("nombre", "otter ai", null, { ignorar: true })],
      }
    );
    expect(s.excluidas.map((e) => e.motivo).sort()).toEqual(["equipo", "equipo", "ignorado"]);
    expect(s.sinIdentificar).toEqual([]);
    expect(fila(s, "enr_juan").sugerido).toBe("presente");
  });
});

function alias(
  keyKind: AliasAprendido["keyKind"],
  key: string,
  contactId: string | null,
  extra: Partial<AliasAprendido> = {}
): AliasAprendido {
  return { keyKind, key, contactId, ignorar: false, confirmations: 1, rejections: 0, rejectedContactIds: [], ...extra };
}

describe("armarSugerencia — lo aprendido", () => {
  it("un alias confirmado 2+ veces y sin rechazos → alta", () => {
    const s = sugerir([seg("Juanchi", 0, 100)], { aliases: [alias("nombre", "juanchi", "ct_juan", { confirmations: 2 })] });
    expect(fila(s, "enr_juan")).toMatchObject({ confianza: "alta", coincidencia: "aprendido" });
  });

  it("un alias con una sola confirmación → media", () => {
    const s = sugerir([seg("Juanchi", 0, 100)], { aliases: [alias("nombre", "juanchi", "ct_juan")] });
    expect(fila(s, "enr_juan")).toMatchObject({ confianza: "media", coincidencia: "aprendido" });
  });

  it("un alias que apunta a alguien de OTRO grupo no asigna nada", () => {
    const s = sugerir([seg("Juanchi", 0, 100)], { aliases: [alias("nombre", "juanchi", "ct_de_otro_grupo", { confirmations: 9 })] });
    expect(s.alumnos.every((a) => a.personas.length === 0)).toBe(true);
    expect(s.sinIdentificar).toHaveLength(1);
  });

  it("el usuario de Zoom aprendido gana aunque el nombre diga otra cosa", () => {
    const s = sugerir([seg("Seba", 0, 100, { participantUserId: "zu_77" })], {
      aliases: [alias("usuario_zoom", "zu_77", "ct_juan")],
    });
    expect(fila(s, "enr_juan")).toMatchObject({ coincidencia: "aprendido" });
    expect(fila(s, "enr_seba").personas).toEqual([]);
  });

  it("si dijeron que NO es Juan, el parecido de nombre no vuelve a sugerir a Juan", () => {
    const s = sugerir([seg("Juan Rodríguez", 0, 100)], {
      aliases: [alias("nombre", "juan rodriguez", null, { rejections: 1, rejectedContactIds: ["ct_juan"] })],
    });
    expect(fila(s, "enr_juan").personas).toEqual([]);
    expect(s.sinIdentificar).toHaveLength(1);
  });
});

describe("planDeAprendizaje", () => {
  const personas = agruparPersonas([
    seg("iPhone de Juan", 0, 100, { participantId: "a" }),
    seg("Pedro Gómez", 0, 100, { participantId: "b" }),
    seg("Otter.ai", 0, 100, { participantId: "c" }),
    seg("Juan Rodríguez", 0, 100, { participantId: "d", participantUserId: "zu_9" }),
  ]);
  const key = (nombre: string) => personas.find((p) => p.nombres.includes(nombre))!.key;

  it("confirmar lo sugerido suma una confirmación por llave", () => {
    const ops = planDeAprendizaje({
      personas,
      sugeridas: { [key("iPhone de Juan")]: "ct_juan" },
      finales: { [key("iPhone de Juan")]: "ct_juan" },
      asignadasAMano: [],
      ignorar: [],
      existentes: [alias("nombre", "juan", "ct_juan", { confirmations: 1 })],
    });
    expect(ops).toEqual([
      {
        keyKind: "nombre",
        key: "juan",
        label: "iPhone de Juan",
        contactId: "ct_juan",
        ignorar: false,
        confirmations: 2,
        rejections: 0,
        rejectedContactIds: [],
      },
    ]);
  });

  it("asignar a mano un nombre sin identificar aprende con peso de dos confirmaciones", () => {
    const ops = planDeAprendizaje({
      personas,
      sugeridas: {},
      finales: { [key("Pedro Gómez")]: "ct_seba" },
      asignadasAMano: [key("Pedro Gómez")],
      ignorar: [],
      existentes: [],
    });
    expect(ops).toEqual([
      expect.objectContaining({ keyKind: "nombre", key: "pedro gomez", contactId: "ct_seba", confirmations: 2 }),
    ]);
  });

  it("corregir: la llave pasa a la otra persona y recuerda a quién NO es", () => {
    const ops = planDeAprendizaje({
      personas,
      sugeridas: { [key("Juan Rodríguez")]: "ct_juan" },
      finales: { [key("Juan Rodríguez")]: "ct_seba" },
      asignadasAMano: [key("Juan Rodríguez")],
      ignorar: [],
      existentes: [alias("usuario_zoom", "zu_9", "ct_juan", { confirmations: 3 })],
    });
    const zu = ops.find((o) => o.keyKind === "usuario_zoom")!;
    expect(zu).toMatchObject({ contactId: "ct_seba", confirmations: 2, rejections: 0, rejectedContactIds: ["ct_juan"] });
    const nombre = ops.find((o) => o.keyKind === "nombre")!;
    expect(nombre).toMatchObject({ key: "juan rodriguez", contactId: "ct_seba", rejectedContactIds: ["ct_juan"] });
  });

  it("\"No es esta persona\" sin reasignar: deja de apuntar y suma un rechazo", () => {
    const ops = planDeAprendizaje({
      personas,
      sugeridas: { [key("iPhone de Juan")]: "ct_juan" },
      finales: { [key("iPhone de Juan")]: null },
      asignadasAMano: [],
      ignorar: [],
      existentes: [alias("nombre", "juan", "ct_juan", { confirmations: 1 })],
    });
    expect(ops).toEqual([
      expect.objectContaining({ key: "juan", contactId: null, ignorar: false, rejections: 1, rejectedContactIds: ["ct_juan"] }),
    ]);
  });

  it("\"Es del equipo o un dispositivo\" → ignorar", () => {
    const ops = planDeAprendizaje({
      personas,
      sugeridas: {},
      finales: {},
      asignadasAMano: [],
      ignorar: [key("Otter.ai")],
      existentes: [],
    });
    expect(ops).toEqual([expect.objectContaining({ key: "otter ai", contactId: null, ignorar: true })]);
  });

  it("una persona que nadie tocó no aprende nada", () => {
    expect(
      planDeAprendizaje({ personas, sugeridas: {}, finales: {}, asignadasAMano: [], ignorar: [], existentes: [] })
    ).toEqual([]);
  });
});

describe("planDeConfirmacion", () => {
  const segs = () => [
    seg("Ana Lucía Pérez", 0, 110, { email: "ana.perez@gmail.com", participantId: "a" }),
    seg("iPhone de Juan Rodriguez", 0, 100, { participantId: "j" }),
    seg("Pedro Gómez", 0, 100, { participantId: "p" }),
    seg("Otter.ai", 0, 120, { participantId: "o" }),
  ];
  const base = (cuerpo: Parameters<typeof planDeConfirmacion>[0]["cuerpo"], conMarca: string[] = []) =>
    planDeConfirmacion({
      segmentos: segs(),
      ventana,
      alumnos: ROSTER,
      aliases: [],
      exclusiones: SIN_EXCLUSIONES,
      umbrales: UMBRALES_DE_FABRICA,
      conMarca: new Set(conMarca),
      cuerpo,
    });

  it("escribe solo a quien no tenía marca; pisar pide la tilde", () => {
    const decisions = [
      { enrollmentId: "enr_ana", status: "presente" as const, personaKeys: ["correo:ana.perez@gmail.com"] },
      { enrollmentId: "enr_juan", status: "presente" as const, personaKeys: ["nombre:juan rodriguez"] },
      { enrollmentId: "enr_seba", status: "ausente" as const, personaKeys: [] },
    ];
    const sinTilde = base({ decisions, ignore: [], rejected: [], overwrite: [] }, ["enr_juan"]);
    expect(sinTilde.ok && sinTilde.nuevas.map((f) => f.enrollmentId)).toEqual(["enr_ana", "enr_seba"]);
    expect(sinTilde.ok && sinTilde.pisadas).toEqual([]);
    expect(sinTilde.ok && sinTilde.salteadas).toBe(1);

    const conTilde = base({ decisions, ignore: [], rejected: [], overwrite: ["enr_juan"] }, ["enr_juan"]);
    expect(conTilde.ok && conTilde.pisadas).toEqual([{ enrollmentId: "enr_juan", status: "presente", zoomMinutes: 100 }]);
  });

  it("los minutos guardados son los de las personas que quedaron asignadas", () => {
    const r = base({
      decisions: [{ enrollmentId: "enr_ana", status: "presente", personaKeys: ["correo:ana.perez@gmail.com"] }],
      ignore: [],
      rejected: [],
      overwrite: [],
    });
    expect(r.ok && r.nuevas[0]!.zoomMinutes).toBe(110);
  });

  it("asignar un nombre sin identificar, ignorar un bot y rechazar aprende las tres cosas", () => {
    const r = base({
      decisions: [{ enrollmentId: "enr_seba", status: "presente", personaKeys: ["nombre:pedro gomez"] }],
      ignore: ["nombre:otter ai"],
      rejected: ["nombre:juan rodriguez"],
      overwrite: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const porLlave = Object.fromEntries(r.aprender.map((o) => [o.key, o]));
    expect(porLlave["pedro gomez"]).toMatchObject({ contactId: "ct_seba", confirmations: 2 });
    expect(porLlave["otter ai"]).toMatchObject({ ignorar: true, contactId: null });
    expect(porLlave["juan rodriguez"]).toMatchObject({ contactId: null, rejectedContactIds: ["ct_juan"] });
  });

  it("rechaza alguien fuera del grupo, un nombre que no está y uno asignado dos veces", () => {
    expect(
      base({ decisions: [{ enrollmentId: "enr_otro", status: "presente", personaKeys: [] }], ignore: [], rejected: [], overwrite: [] })
    ).toMatchObject({ ok: false, code: "fuera_del_grupo" });
    expect(
      base({ decisions: [{ enrollmentId: "enr_ana", status: "presente", personaKeys: ["nombre:nadie"] }], ignore: [], rejected: [], overwrite: [] })
    ).toMatchObject({ ok: false, code: "persona_desconocida" });
    expect(
      base({
        decisions: [
          { enrollmentId: "enr_ana", status: "presente", personaKeys: ["nombre:pedro gomez"] },
          { enrollmentId: "enr_seba", status: "presente", personaKeys: ["nombre:pedro gomez"] },
        ],
        ignore: [],
        rejected: [],
        overwrite: [],
      })
    ).toMatchObject({ ok: false, code: "persona_repetida" });
  });
});
