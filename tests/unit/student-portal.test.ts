import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 015 — Los guards ESTRUCTURALES del portal del alumno.
 *
 * Son estructurales y no de comportamiento a propósito: las tres reglas que
 * protegen viven en la FORMA del módulo, y romperlas no hace fallar nada
 * visible. Un alcance mal escrito compila, responde 200 y devuelve la ficha de
 * otra persona.
 *
 * El comportamiento —que el alumno vea lo suyo y nada más— lo conduce el arnés
 * E2E con dos alumnos reales cruzando ids (`scripts/e2e-selftest.mjs`, bloque
 * 015). Los dos hacen falta: el arnés prueba el hoy, esto impide el mañana.
 */

const MODULO = path.join(process.cwd(), "src", "server", "student-portal.ts");
const src = readFileSync(MODULO, "utf8");

/** El archivo sin comentarios: las reglas hablan del código, no de la prosa. */
const codigo = src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

describe("015 — el portal del alumno", () => {
  /**
   * FR-001/SC-002 — Ausencia = 404, jamás 403.
   *
   * Un 403 confirmaría que la inscripción existe, y eso ya es información que
   * quien prueba ids ajenos no tenía. La regla se rompe con cualquier
   * `if (!esMia) return 403` bien intencionado, y como no hay ninguno para
   * copiar, quien lo agregue tiene que escribirlo a mano.
   *
   * Mismo guard que `teacher-portal.ts`: quien elige el código de estado es la
   * ruta, y el módulo solo devuelve `null`.
   */
  it("el módulo no decide códigos de estado: devuelve null, nunca 403", () => {
    expect(codigo).not.toMatch(/\b403\b/);
    expect(codigo).not.toMatch(/apiError\s*\(/);
  });

  /**
   * FR-001 — Toda función pública arranca por el CONTACTO.
   *
   * No es estilo: es lo que garantiza que no exista un camino de lectura que
   * no pase por "¿de quién es esto?". Una función que recibiera solo un
   * `enrollmentId` estaría confiando en que quien la llame ya verificó — y esa
   * confianza es exactamente lo que falla en la ruta número catorce.
   */
  it("toda función exportada recibe el contacto como alcance", () => {
    const firmas = [...src.matchAll(/export async function (\w+)\(([^)]*)\)/g)];
    expect(firmas.length, "no se encontraron funciones exportadas").toBeGreaterThan(3);

    const sinAlcance = firmas
      .filter(([, , args]) => !(args ?? "").includes("contactId"))
      .map(([, nombre]) => nombre);

    expect(
      sinAlcance,
      `funciones sin el contacto en la firma: ${sinAlcance.join(", ")}`
    ).toEqual([]);
  });

  /**
   * FR-004 — Superficie propia: no reusa la del staff ni la del profesor.
   *
   * `student-record.ts` calcula casi lo mismo y la tentación de importarlo es
   * fuerte. Casi: su DTO lleva cédula y teléfono, y su estado de cuenta
   * aparece según una capacidad de STAFF que un alumno nunca va a tener.
   * `teacher-portal.ts` es al revés — trae el roster completo de la cohorte.
   * Importar cualquiera de los dos es cómo un dato ajeno termina en la
   * pantalla del alumno sin que nadie lo decida.
   */
  it("no importa la superficie del staff ni la del profesor", () => {
    expect(codigo).not.toMatch(/from\s+"@\/server\/student-record"/);
    expect(codigo).not.toMatch(/from\s+"@\/server\/teacher-portal"/);
    expect(codigo).not.toMatch(/from\s+"@\/lib\/capabilities"/);
  });

  /**
   * Constitución III — Toda consulta pasa por `scoped()`.
   *
   * RLS ya filtra por organización, pero `scoped()` es la segunda cerradura y
   * la única que sigue puesta si alguien vuelve a conectar la app como
   * `postgres` (que saltea RLS sin avisar, ver docs/rls-rol-de-conexion.md).
   */
  it("toda consulta declara su organización", () => {
    const wheres = (codigo.match(/\.where\(/g) ?? []).length;
    const scoped = (codigo.match(/scoped\(/g) ?? []).length;
    // La única excepción es la organización misma, que se busca por su id.
    const porOrgId = (codigo.match(/eq\(schema\.organization\.id,/g) ?? []).length;
    expect(wheres).toBe(scoped + porOrgId);
  });

  /**
   * FR-003 — Solo lectura. La garantía no es que nadie llame a una escritura:
   * es que no haya ninguna.
   */
  it("el módulo es de solo lectura", () => {
    for (const verbo of [".insert(", ".update(", ".delete("]) {
      expect(codigo, `el módulo usa ${verbo}`).not.toContain(verbo);
    }
  });
});

describe("015 — las rutas del alumno", () => {
  const RUTAS = path.join(process.cwd(), "src", "app", "api", "portal", "me");

  /**
   * FR-003 — Solo lectura, y se comprueba en la RUTA además del módulo: el
   * método que no existe devuelve 405 sin que nadie escriba un `if`.
   */
  it("ninguna ruta del alumno exporta un método de escritura", () => {
    const archivos = [
      "route.ts",
      "cuenta/route.ts",
      "certificados/route.ts",
      "cursadas/[id]/route.ts",
    ];
    for (const rel of archivos) {
      const src = readFileSync(path.join(RUTAS, rel), "utf8");
      for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
        expect(src, `${rel} exporta ${metodo}`).not.toMatch(
          new RegExp(`export const ${metodo}\\b`)
        );
      }
      expect(src, `${rel} no usa la puerta del alumno`).toContain(
        "requireStudentPortal("
      );
    }
  });
});
