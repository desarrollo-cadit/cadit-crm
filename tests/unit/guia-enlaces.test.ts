import { describe, expect, it } from "vitest";
import { CAPABILITIES, type Capability } from "@/lib/capabilities";
import { GUIA_CAPACIDADES, hrefDeLaGuia } from "@/lib/guia";

describe("enlace «Abrir» de la guía", () => {
  it("lleva a la pantalla cuando la cuenta puede abrirla", () => {
    expect(hrefDeLaGuia("Académico → el grupo → Alumnos", ["academico.ver"])).toBe("/academico");
    expect(hrefDeLaGuia("/inbox", ["inbox.ver"])).toBe("/inbox");
  });

  it("no ofrece el enlace si la cuenta no tiene el permiso de esa pantalla", () => {
    // `licencias.gestionar` apunta a Académico: un rol personalizado puede tenerla sin `academico.ver`.
    expect(hrefDeLaGuia("Académico → el grupo → Alumnos", ["licencias.gestionar"])).toBeNull();
    expect(hrefDeLaGuia("/inbox", [])).toBeNull();
  });

  it("las pantallas de Ajustes que no están en el menú no dependen de la capacidad del menú", () => {
    expect(hrefDeLaGuia("/settings/areas", ["areas.configurar"])).toBe("/settings/areas");
  });

  it("un camino que arranca en algo que el menú no tiene no lleva a ningún lado", () => {
    expect(hrefDeLaGuia("Pantalla inventada → algo", CAPABILITIES)).toBeNull();
  });

  it("quien tiene TODAS las capacidades puede abrir todo lo que la guía describe", () => {
    const sinEnlace = (Object.keys(GUIA_CAPACIDADES) as Capability[]).filter(
      (c) => hrefDeLaGuia(GUIA_CAPACIDADES[c].donde, CAPABILITIES) === null
    );
    expect(sinEnlace, `sin enlace aun con todos los permisos: ${sinEnlace.join(", ")}`).toEqual([]);
  });
});
