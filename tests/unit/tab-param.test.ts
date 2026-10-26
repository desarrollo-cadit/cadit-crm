import { describe, expect, it } from "vitest";
import { leerPestana, urlConPestana } from "@/lib/tab-param";
import {
  ALIAS_ACADEMICO,
  ALIAS_DEL_GRUPO,
  FILTRO_POR_PESTANA_DE_CONTACTOS,
  PESTANA_POR_FILTRO_DE_CONTACTOS,
  PESTANAS_ACADEMICO,
  PESTANAS_CONTACTOS,
  pestanasDelGrupo,
} from "@/lib/pestanas";

const PESTANAS = ["cursos", "grupos", "profesores"] as const;

describe("leerPestana", () => {
  it("devuelve la pestaña pedida cuando es válida", () => {
    expect(leerPestana("grupos", PESTANAS, "cursos")).toBe("grupos");
  });

  it("cae al default si falta, es desconocida o viene repetida", () => {
    expect(leerPestana(undefined, PESTANAS, "cursos")).toBe("cursos");
    expect(leerPestana(null, PESTANAS, "cursos")).toBe("cursos");
    expect(leerPestana("", PESTANAS, "cursos")).toBe("cursos");
    expect(leerPestana("inventada", PESTANAS, "cursos")).toBe("cursos");
    expect(leerPestana(["grupos", "cursos"], PESTANAS, "cursos")).toBe("cursos");
  });

  it("no confunde una clave heredada de Object.prototype con una pestaña", () => {
    expect(leerPestana("constructor", PESTANAS, "cursos")).toBe("cursos");
    expect(
      leerPestana("toString", PESTANAS, "cursos", { cohorts: "grupos" })
    ).toBe("cursos");
  });

  it("acepta alias (claves viejas) y los traduce", () => {
    expect(leerPestana("cohorts", PESTANAS, "cursos", { cohorts: "grupos" })).toBe("grupos");
  });

  it("una pestaña que esta persona no ve cae al default (no se revela)", () => {
    // Quien llama pasa SOLO las pestañas visibles: la oculta es desconocida.
    const visibles = ["cursos", "grupos"] as const;
    expect(leerPestana("profesores", visibles, "cursos")).toBe("cursos");
    expect(leerPestana("docentes", visibles, "cursos", { docentes: "profesores" })).toBe(
      "cursos"
    );
  });
});

describe("urlConPestana", () => {
  it("agrega ?tab= a una URL sin query", () => {
    expect(urlConPestana("/academico", "", "grupos")).toBe("/academico?tab=grupos");
  });

  it("conserva los demás parámetros y reemplaza el tab anterior", () => {
    expect(urlConPestana("/contacts/ct_1/legajo", "?cohort=cv_9&tab=legajo", "seguimiento")).toBe(
      "/contacts/ct_1/legajo?cohort=cv_9&tab=seguimiento"
    );
  });

  it("acepta el search con o sin el signo de pregunta", () => {
    expect(urlConPestana("/finanzas", "mes=2026-10", "ventas")).toBe(
      "/finanzas?mes=2026-10&tab=ventas"
    );
  });
});

describe("pestanas del grupo por URL", () => {
  it("Recorrido solo en una especialización, y es la primera", () => {
    expect(pestanasDelGrupo({ esEspecializacion: true, verCursosOffline: false })[0]).toBe(
      "recorrido"
    );
    expect(pestanasDelGrupo({ esEspecializacion: false, verCursosOffline: true })).not.toContain(
      "recorrido"
    );
  });

  it("sin `academico.ver` (o en un módulo) `?tab=cursos-offline` cae a la default", () => {
    const visibles = pestanasDelGrupo({ esEspecializacion: false, verCursosOffline: false });
    expect(leerPestana("cursos-offline", visibles, "alumnos", ALIAS_DEL_GRUPO)).toBe("alumnos");
    expect(leerPestana("offline", visibles, "alumnos", ALIAS_DEL_GRUPO)).toBe("alumnos");
  });

  it("las claves viejas en inglés siguen abriendo su pestaña", () => {
    const visibles = pestanasDelGrupo({ esEspecializacion: false, verCursosOffline: true });
    expect(leerPestana("attendance", visibles, "alumnos", ALIAS_DEL_GRUPO)).toBe("asistencia");
    expect(leerPestana("cohorts", PESTANAS_ACADEMICO, "cursos", ALIAS_ACADEMICO)).toBe("grupos");
  });
});

describe("pestañas de contactos", () => {
  it("cada slug de la URL va y vuelve al mismo filtro", () => {
    for (const p of PESTANAS_CONTACTOS) {
      expect(PESTANA_POR_FILTRO_DE_CONTACTOS[FILTRO_POR_PESTANA_DE_CONTACTOS[p]]).toBe(p);
    }
  });
});
