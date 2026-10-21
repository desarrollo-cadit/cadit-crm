import { describe, expect, it } from "vitest";
import {
  armarLineaDeTiempo,
  enlaceDeCorreo,
  enlaceDeWhatsApp,
  origenDelFormulario,
  pestanaInicialDelContacto,
  seguimientoBodySchema,
} from "@/lib/seguimiento";

describe("origenDelFormulario", () => {
  it("la página de un curso no repite el nombre del curso: dice de dónde vino", () => {
    expect(origenDelFormulario("formulario:Revit MEP", "Revit MEP")).toBe(
      "Página del curso en el sitio"
    );
  });

  it("un formulario de campaña dice su nombre", () => {
    expect(origenDelFormulario("formulario:Feria 2026", "Revit MEP")).toBe(
      "Formulario «Feria 2026»"
    );
  });

  it("la inscripción a un taller lo dice como tal", () => {
    expect(origenDelFormulario("formulario:Taller BIM básico", "BIM básico")).toBe(
      "Inscripción al taller desde el sitio"
    );
  });

  it("nunca muestra el prefijo interno", () => {
    expect(origenDelFormulario("formulario:Feria 2026", null)).not.toContain("formulario:");
    expect(origenDelFormulario("whatsapp", null)).toBe("whatsapp");
  });
});

/**
 * La pestaña «Seguimiento» del contacto: enlaces de contacto, la línea de
 * tiempo única (formularios + notas + contactos) y qué pestaña abre primero.
 */

describe("enlaceDeWhatsApp", () => {
  it("arma wa.me con los dígitos del teléfono normalizado", () => {
    expect(enlaceDeWhatsApp("59898574165")).toBe("https://wa.me/59898574165");
  });

  it("normaliza un teléfono escrito a mano (Uruguay sin código de país)", () => {
    expect(enlaceDeWhatsApp("098 574 165")).toBe("https://wa.me/59898574165");
  });

  it("acepta el + delante", () => {
    expect(enlaceDeWhatsApp("+34 600 111 222")).toBe("https://wa.me/34600111222");
  });

  it("sin teléfono no hay enlace (contactos bsuid:)", () => {
    expect(enlaceDeWhatsApp(null)).toBeNull();
    expect(enlaceDeWhatsApp("")).toBeNull();
    expect(enlaceDeWhatsApp("   ")).toBeNull();
  });

  it("un teléfono que no se puede marcar no produce enlace", () => {
    expect(enlaceDeWhatsApp("123")).toBeNull();
    expect(enlaceDeWhatsApp("bsuid:abc")).toBeNull();
    expect(enlaceDeWhatsApp("1234567890123456789")).toBeNull();
  });
});

describe("enlaceDeCorreo", () => {
  it("arma mailto con la dirección", () => {
    expect(enlaceDeCorreo("ana@example.com")).toBe("mailto:ana@example.com");
  });

  it("codifica lo que no va crudo en una URL", () => {
    expect(enlaceDeCorreo("ana+web@example.com")).toBe("mailto:ana%2Bweb@example.com");
  });

  it("sin correo (o con uno inválido) no hay enlace", () => {
    expect(enlaceDeCorreo(null)).toBeNull();
    expect(enlaceDeCorreo("  ")).toBeNull();
    expect(enlaceDeCorreo("no-es-correo")).toBeNull();
  });
});

describe("armarLineaDeTiempo", () => {
  const formulario = (id: string, at: string) => ({
    id,
    at,
    source: "formulario:Revit",
    interestKind: "curso" as const,
    interestName: "Revit",
    cohortName: null,
    firstName: "Ana",
    lastName: null,
    phone: "59899111222",
    email: null,
    message: null,
    company: null,
    result: null,
  });
  const actividad = (id: string, at: string, kind: "nota" | "contacto_email" | "contacto_whatsapp") => ({
    id,
    at,
    kind,
    body: kind === "nota" ? "Llamar el lunes" : null,
    authorName: "Vera",
  });

  it("mezcla formularios y actividades, lo más nuevo primero", () => {
    const linea = armarLineaDeTiempo(
      [formulario("cfs_1", "2026-10-01T10:00:00.000Z"), formulario("cfs_2", "2026-10-03T10:00:00.000Z")],
      [actividad("cact_1", "2026-10-02T10:00:00.000Z", "nota"), actividad("cact_2", "2026-10-04T10:00:00.000Z", "contacto_whatsapp")]
    );
    expect(linea.map((e) => e.id)).toEqual(["cact_2", "cfs_2", "cact_1", "cfs_1"]);
    expect(linea[0]?.tipo).toBe("contacto_whatsapp");
    expect(linea[1]?.tipo).toBe("formulario");
  });

  it("a igual instante, la actividad (que siempre es posterior al formulario que la motiva) va arriba", () => {
    const at = "2026-10-01T10:00:00.000Z";
    const linea = armarLineaDeTiempo([formulario("cfs_1", at)], [actividad("cact_1", at, "nota")]);
    expect(linea.map((e) => e.id)).toEqual(["cact_1", "cfs_1"]);
  });

  it("vacía si no hay nada", () => {
    expect(armarLineaDeTiempo([], [])).toEqual([]);
  });
});

describe("pestanaInicialDelContacto", () => {
  it("un lead (sin cursos) abre en Seguimiento", () => {
    expect(pestanaInicialDelContacto({ tieneCursos: false, pedida: null, puedeAuditar: false })).toBe("seguimiento");
  });

  it("un alumno abre en el Legajo, como siempre", () => {
    expect(pestanaInicialDelContacto({ tieneCursos: true, pedida: null, puedeAuditar: true })).toBe("record");
  });

  it("?tab=seguimiento gana siempre", () => {
    expect(pestanaInicialDelContacto({ tieneCursos: true, pedida: "seguimiento", puedeAuditar: false })).toBe("seguimiento");
  });

  it("?tab=legajo abre el legajo aunque sea un lead", () => {
    expect(pestanaInicialDelContacto({ tieneCursos: false, pedida: "legajo", puedeAuditar: false })).toBe("record");
  });

  it("Administración solo si se puede auditar; si no, cae al default", () => {
    expect(pestanaInicialDelContacto({ tieneCursos: true, pedida: "administracion", puedeAuditar: true })).toBe("admin");
    expect(pestanaInicialDelContacto({ tieneCursos: false, pedida: "administracion", puedeAuditar: false })).toBe("seguimiento");
  });

  it("un valor desconocido cae al default", () => {
    expect(pestanaInicialDelContacto({ tieneCursos: true, pedida: "cualquiera", puedeAuditar: false })).toBe("record");
  });
});

describe("seguimientoBodySchema", () => {
  it("una nota lleva texto (recortado)", () => {
    expect(seguimientoBodySchema.parse({ kind: "nota", body: "  Llamar  " })).toEqual({ kind: "nota", body: "Llamar" });
  });

  it("una nota vacía no pasa", () => {
    expect(seguimientoBodySchema.safeParse({ kind: "nota", body: "   " }).success).toBe(false);
    expect(seguimientoBodySchema.safeParse({ kind: "nota" }).success).toBe(false);
  });

  it("un contacto por WhatsApp o por correo no lleva texto", () => {
    expect(seguimientoBodySchema.parse({ kind: "contacto_whatsapp" })).toEqual({ kind: "contacto_whatsapp" });
    expect(seguimientoBodySchema.parse({ kind: "contacto_email" })).toEqual({ kind: "contacto_email" });
  });

  it("un tipo inventado no pasa", () => {
    expect(seguimientoBodySchema.safeParse({ kind: "llamada" }).success).toBe(false);
  });
});
