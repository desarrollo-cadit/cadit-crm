import { describe, expect, it } from "vitest";
import {
  MAX_DESCRIPCION_CERTIFICADO,
  PLANTILLA_DE,
  aRomano,
  achicarParaEntrar,
  acomodarDescripcion,
  anioDeInicio,
  armarCertificado,
  cursadaTermino,
  diagramaDe,
  distribuirModulos,
  fechaCorta,
  finDeEspecializacion,
  fraseDelCertificado,
  leerSnapshot,
  nombreDeArchivoCertificado,
  partirParrafo,
  partirTitulo,
  MARGEN_SOBRE_FIRMAS,
  TOPE_DE_FIRMAS,
  type CertificadoSnapshot,
  type Medidor,
} from "@/lib/certificado";

/**
 * 038 — El contenido y la diagramación del certificado, sin base y sin
 * fuentes: un medidor de mentira donde cada carácter mide `size * 0,6`.
 */
const medir: Medidor = (t, size) => Array.from(t).length * size * 0.6;

const base = {
  version: 1 as const,
  alumno: "  Noelia   Sosa Machado ",
  curso: "Especialización en Proyectos BIM",
  cohorte: "EBIM 13",
  anio: 2025,
  modulo: null,
  modulos: [],
  descripcion: null,
};

describe("aRomano (FR-003)", () => {
  it.each([
    [1, "I"], [2, "II"], [3, "III"], [4, "IV"], [5, "V"], [6, "VI"],
    [9, "IX"], [12, "XII"], [40, "XL"], [2025, "MMXXV"],
  ])("%i → %s", (n, r) => expect(aRomano(n)).toBe(r));

  it("fuera de rango no inventa un número", () => {
    expect(() => aRomano(0)).toThrow(RangeError);
    expect(() => aRomano(1.5)).toThrow(RangeError);
  });
});

describe("fraseDelCertificado", () => {
  it("una frase por formato, como el diseño", () => {
    expect(fraseDelCertificado("especializacion")).toBe(
      "Ha completado exitosamente la totalidad del curso"
    );
    expect(fraseDelCertificado("curso")).toBe("Ha completado exitosamente el curso");
    expect(fraseDelCertificado("modulo", 3)).toBe("Ha completado exitosamente el módulo III");
  });

  it("un módulo sin orden cargado no lleva un número inventado", () => {
    expect(fraseDelCertificado("modulo", null)).toBe("Ha completado exitosamente el módulo");
  });
});

describe("armarCertificado", () => {
  const opts = { codigo: "K7Q2M9XA", baseUrl: "https://campus.cadit.com.uy/" };

  it("el general: el CURSO en mayúsculas (nunca la cohorte), año, nombre y módulos en orden", () => {
    const v = armarCertificado(
      { ...base, formato: "especializacion", modulos: ["BIM Management", "Proyecto BIM"] },
      opts
    );
    expect(v.titulo).toBe("ESPECIALIZACIÓN EN PROYECTOS BIM");
    expect(v.titulo).not.toContain("EBIM");
    expect(v.anio).toBe("2025");
    expect(v.alumno).toBe("Noelia Sosa Machado");
    expect(v.modulos).toEqual(["BIM MANAGEMENT", "PROYECTO BIM"]);
    expect(v.nombreModulo).toBeNull();
    expect(v.descripcion).toBeNull();
  });

  it("FR-006 — lleva el código y la dirección de verificación", () => {
    const v = armarCertificado({ ...base, formato: "curso" }, opts);
    expect(v.codigo).toBe("K7Q2M9XA");
    expect(v.verificacion).toBe("https://campus.cadit.com.uy/verificar/K7Q2M9XA");
  });

  it("el de módulo: nombre del módulo en mayúsculas, ordinal en romanos y su descripción", () => {
    const v = armarCertificado(
      {
        ...base,
        formato: "modulo",
        modulo: { ordinal: 2, nombre: "Proyecto BIM" },
        descripcion: "  El alumno está apto…  ",
      },
      opts
    );
    expect(v.frase).toBe("Ha completado exitosamente el módulo II");
    expect(v.nombreModulo).toBe("PROYECTO BIM");
    expect(v.descripcion).toBe("El alumno está apto…");
  });

  it("una descripción vacía es ninguna: sin párrafo y sin hueco (US3)", () => {
    expect(armarCertificado({ ...base, formato: "curso", descripcion: "   " }, opts).descripcion).toBeNull();
  });

  it("mayúsculas en castellano: tildes y eñes se conservan", () => {
    const v = armarCertificado({ ...base, formato: "curso", curso: "diseño ñandú güiro" }, opts);
    expect(v.titulo).toBe("DISEÑO ÑANDÚ GÜIRO");
  });
});

describe("leerSnapshot", () => {
  it("acepta lo que se congeló y rechaza lo que no tiene forma", () => {
    const s: CertificadoSnapshot = { ...base, formato: "curso" };
    expect(leerSnapshot(s)).toEqual(s);
    expect(leerSnapshot(null)).toBeNull();
    expect(leerSnapshot({ formato: "curso" })).toBeNull();
  });
});

describe("acomodo del texto (FR-005)", () => {
  it("el nombre se achica para entrar, nunca se sale", () => {
    expect(achicarParaEntrar("Ana", medir, { size: 60, ancho: 500 })).toBe(60);
    const largo = "María de los Ángeles Fernández Rodríguez de la Peña";
    const size = achicarParaEntrar(largo, medir, { size: 60, ancho: 500 });
    expect(size).toBeLessThan(60);
    expect(medir(largo, size)).toBeLessThanOrEqual(500);
  });

  it("el título va en dos líneas equilibradas, como el ejemplo", () => {
    const t = partirTitulo("ESPECIALIZACIÓN EN PROYECTOS BIM", medir, {
      size: 40,
      ancho: 400,
      minSize: 20,
    });
    expect(t.lineas).toEqual(["ESPECIALIZACIÓN", "EN PROYECTOS BIM"]);
    expect(t.lineas.length).toBeLessThanOrEqual(2);
  });

  it("un título corto queda en una línea", () => {
    expect(partirTitulo("REVIT", medir, { size: 40, ancho: 400, minSize: 20 }).lineas).toEqual([
      "REVIT",
    ]);
  });

  it("un título larguísimo: dos líneas a lo sumo, achicado hasta entrar", () => {
    const t = partirTitulo(
      "ESPECIALIZACIÓN INTERNACIONAL EN COORDINACIÓN Y GESTIÓN DE PROYECTOS BIM PARA INFRAESTRUCTURA",
      medir,
      { size: 40, ancho: 400, minSize: 20 }
    );
    expect(t.lineas).toHaveLength(2);
    for (const l of t.lineas) expect(medir(l, t.size)).toBeLessThanOrEqual(400);
  });

  it("el párrafo se parte por palabras dentro del ancho", () => {
    const lineas = partirParrafo("uno dos tres cuatro cinco seis", medir, 10, 70);
    for (const l of lineas) expect(medir(l, 10)).toBeLessThanOrEqual(70);
    expect(lineas.join(" ")).toBe("uno dos tres cuatro cinco seis");
  });

  it("la descripción baja de tamaño hasta entrar en sus líneas", () => {
    const caja = { ...diagramaDe("modulo").descripcion!, ancho: 300, maxLineas: 2 };
    const texto = "palabra ".repeat(12).trim();
    const a = acomodarDescripcion(texto, medir, caja);
    expect(a.entra).toBe(true);
    expect(a.lineas.length).toBeLessThanOrEqual(2);
    expect(a.size).toBeLessThanOrEqual(11);
    expect(a.size).toBeGreaterThanOrEqual(caja.minSize);
  });

  it("si ni al mínimo entra, se corta con … y avisa que no entra", () => {
    const caja = { ...diagramaDe("modulo").descripcion!, ancho: 300, maxLineas: 2 };
    const a = acomodarDescripcion("palabra ".repeat(80), medir, caja);
    expect(a.entra).toBe(false);
    expect(a.lineas).toHaveLength(2);
    expect(a.lineas[1]!.endsWith("…")).toBe(true);
    for (const l of a.lineas) expect(medir(l, a.size)).toBeLessThanOrEqual(300);
  });
});

describe("distribuirModulos — la lista del general nunca pisa las firmas", () => {
  const lista = diagramaDe("especializacion").lista!;

  it("hasta cuatro, exactamente como el ejemplo", () => {
    const r = distribuirModulos(4, lista);
    expect(r.size).toBe(21);
    expect(r.baselines[0]).toBeCloseTo(395.2);
    expect(r.baselines[3]).toBeCloseTo(294.8, 0);
  });

  it.each([5, 6, 8])("con %i se aprieta entre el techo y el piso", (n) => {
    const r = distribuirModulos(n, lista);
    expect(r.baselines).toHaveLength(n);
    expect(Math.min(...r.baselines)).toBeGreaterThanOrEqual(lista.piso - 1e-6);
    expect(Math.max(...r.baselines)).toBeLessThanOrEqual(lista.techo + 1e-6);
    expect(r.size).toBeLessThanOrEqual(21);
  });

  it("sin módulos, sin lista", () => {
    expect(distribuirModulos(0, lista).baselines).toEqual([]);
  });
});

describe("diagramas y plantillas", () => {
  it("cada formato tiene su plantilla y su orientación", () => {
    expect(PLANTILLA_DE).toEqual({
      especializacion: "especializacion-vertical.pdf",
      modulo: "especializacion-horizontal.pdf",
      curso: "curso-horizontal.pdf",
    });
    const v = diagramaDe("especializacion").pagina;
    const h = diagramaDe("curso").pagina;
    expect(v.alto).toBeGreaterThan(v.ancho);
    expect(h.ancho).toBeGreaterThan(h.alto);
  });

  it("la caja del párrafo es la MISMA en los dos horizontales (y con ella se valida)", () => {
    expect(diagramaDe("curso").descripcion).toBe(diagramaDe("modulo").descripcion);
    const d = diagramaDe("modulo").descripcion!;
    for (const tope of Object.values(TOPE_DE_FIRMAS)) {
      expect(d.piso).toBeGreaterThanOrEqual(tope + MARGEN_SOBRE_FIRMAS);
    }
    // Debajo de la raya de la plantilla (y ≈ 236,5), con la mayúscula adentro.
    expect(d.techo + 0.7 * d.size).toBeLessThan(236.5);
  });

  it("el tope de largo es razonable para la caja", () => {
    expect(MAX_DESCRIPCION_CERTIFICADO).toBeGreaterThanOrEqual(300);
    expect(MAX_DESCRIPCION_CERTIFICADO).toBeLessThanOrEqual(500);
  });
});

describe("FR-008 — cuándo se puede emitir", () => {
  const ahora = new Date("2026-10-16T15:00:00.000Z");

  it("terminó si ya pasó la fecha de fin; no, si es futura; sin fecha no se sabe", () => {
    expect(cursadaTermino(new Date("2026-10-10T00:00:00.000Z"), ahora)).toBe(true);
    expect(cursadaTermino(new Date("2026-11-20T00:00:00.000Z"), ahora)).toBe(false);
    expect(cursadaTermino(null, ahora)).toBeNull();
  });

  it("la especialización termina con su camada o, sin fecha, con el último módulo", () => {
    const camada = new Date("2026-12-01T00:00:00.000Z");
    expect(finDeEspecializacion(camada, [])).toBe(camada);
    expect(
      finDeEspecializacion(null, [
        new Date("2026-03-01T00:00:00.000Z"),
        null,
        new Date("2026-09-30T00:00:00.000Z"),
      ])?.toISOString()
    ).toBe("2026-09-30T00:00:00.000Z");
    expect(finDeEspecializacion(null, [null])).toBeNull();
  });

  it("la fecha se dice como un día, sin correrse por la zona", () => {
    expect(fechaCorta(new Date("2026-11-20T00:00:00.000Z"))).toBe("20/11/2026");
    expect(anioDeInicio(new Date("2025-01-01T00:00:00.000Z"))).toBe(2025);
  });
});

describe("nombreDeArchivoCertificado (FR-015)", () => {
  it("lleva alumno y curso, sin caracteres que rompan el encabezado", () => {
    const n = nombreDeArchivoCertificado('Sofía "Sofi" Núñez', "REVIT / Arquitectura");
    expect(n.ascii).toBe("Certificado - Sofia Sofi Nunez - REVIT Arquitectura.pdf");
    expect(decodeURIComponent(n.utf8)).toBe(
      "Certificado - Sofía Sofi Núñez - REVIT Arquitectura.pdf"
    );
    expect(n.ascii).not.toMatch(/["\\/\r\n]/);
  });
});
