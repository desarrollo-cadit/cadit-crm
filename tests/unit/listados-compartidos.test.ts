import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 2026-10-29 — Las piezas de listado (buscador, filtros, resumen, resaltado,
 * "nada coincide") viven en `src/components/listados/` y las usan Académico
 * y Contactos. Estos guardas fijan que no vuelvan a copiarse por pantalla.
 */
const leer = (rel: string) =>
  readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");

const MODULO = "src/components/listados/filtros.tsx";

describe("Piezas compartidas de listados", () => {
  it("el módulo compartido no sabe de Académico ni de contactos", () => {
    const src = leer(MODULO);
    expect(src).not.toMatch(/@\/lib\/(academic-filters|cohort-color|course-kind)/);
    expect(src).not.toMatch(/@\/components\/(academic|contacts)\//);
    expect(src).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\b/);
  });

  it("Académico importa las piezas genéricas del módulo compartido", () => {
    const src = leer("src/components/academic/academic-client.tsx");
    expect(src).toMatch(/from "@\/components\/listados\/filtros"/);
    const toolbar = leer("src/components/academic/academic-toolbar.tsx");
    for (const pieza of ["Buscador", "Desplegable", "ResumenDeFiltros", "Resaltado"]) {
      expect(toolbar).not.toMatch(new RegExp(`export function ${pieza}\\b`));
    }
  });

  it("Contactos usa la tarjeta de filtros y distingue 'nada coincide' de 'no hay contactos'", () => {
    const src = leer("src/components/contacts/contacts-client.tsx");
    expect(src).toMatch(/from "@\/components\/listados\/filtros"/);
    expect(src).toMatch(/<TarjetaDeFiltros\b/);
    expect(src).toMatch(/<Buscador\b/);
    expect(src).toMatch(/<Segmentado<Pestana>/);
    expect(src).toMatch(/contacts\.length === 0 && hayFiltros \? \(\s*(\/\/[^\n]*\n\s*)?<SinCoincidencias/);
    expect(src).toContain("Sin alumnos");
  });

  it("Contactos resalta nombre, correo y teléfono con <Resaltado>, nunca con HTML", () => {
    const src = leer("src/components/contacts/contacts-client.tsx");
    expect(src).toMatch(/<Resaltado texto=\{fullName\(c\)\}/);
    expect(src).toMatch(/<Resaltado texto=\{c\.email\}/);
    expect(src).toMatch(/<Resaltado texto=\{formatPhone\(c\.phone\)\}/);
    expect(src).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\b/);
  });

  it("Talleres usa la tarjeta, la lógica pura y distingue 'nada coincide' de 'no hay talleres'", () => {
    const src = leer("src/components/workshops/workshops-client.tsx");
    expect(src).toMatch(/from "@\/components\/listados\/filtros"/);
    expect(src).toMatch(/from "@\/components\/listados\/curso-visual"/);
    expect(src).toMatch(/from "@\/lib\/workshop-filters"/);
    expect(src).toMatch(/<TarjetaDeFiltros\b/);
    expect(src).toMatch(/<SinCoincidencias\b/);
    expect(src).toContain("Todavía no hay talleres");
    expect(src).toContain("href={`/talleres/${e.id}`}");
    expect(src).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\b/);
  });

  it("el avatar y el tono de estado viven en el módulo compartido, no en Académico", () => {
    const toolbar = leer("src/components/academic/academic-toolbar.tsx");
    expect(toolbar).not.toMatch(/export function AvatarDeCurso\b/);
    expect(toolbar).not.toMatch(/export const TONO_DE_ESTADO\b/);
    expect(leer("src/components/listados/curso-visual.tsx")).toMatch(/export function AvatarDeCurso\b/);
  });

  it("el total del resumen de Contactos es el del servidor y la paginación sigue", () => {
    const src = leer("src/components/contacts/contacts-client.tsx");
    expect(src).toMatch(/total=\{total\}/);
    expect(src).toMatch(/params\.set\("page", String\(page\)\)/);
    expect(src).toMatch(/Página \{page\} de \{totalPages\}/);
  });
});
