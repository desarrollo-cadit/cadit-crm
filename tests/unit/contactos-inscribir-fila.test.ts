import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 2026-10-26 — "Inscribir en un grupo" desde la fila del listado de contactos.
 *
 * Inscribe a una persona que YA existe con el MISMO formulario que el legajo
 * y la bandeja (`EnrollForm` vía `EnrollDialog`): no hay un segundo
 * formulario de inscripción. La acción se dibuja solo con
 * `inscripciones.editar`, resuelta en el servidor (la ruta tiene su propio
 * `requireCapability`; esto es lo que la persona VE, no la barrera).
 */

const leer = (rel: string) =>
  readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");

const cliente = () => leer("src/components/contacts/contacts-client.tsx");

describe("Inscribir desde la fila del listado de contactos", () => {
  it("la página baja canEnroll desde inscripciones.editar", () => {
    expect(leer("src/app/(app)/contacts/page.tsx")).toMatch(
      /canEnroll=\{caps\.includes\("inscripciones\.editar"\)\}/
    );
  });

  it("reusa EnrollDialog y no arma otro formulario", () => {
    const src = cliente();
    expect(src).toMatch(/import \{[^}]*EnrollDialog[^}]*\} from "@\/components\/enrollments\/enroll-launcher"/);
    expect(src).not.toMatch(/EnrollForm/);
  });

  it("el lanzador del encabezado y el de la fila comparten el mismo diálogo", () => {
    const launcher = leer("src/components/enrollments/enroll-launcher.tsx");
    expect(launcher).toMatch(/export function EnrollDialog\(/);
    // EnrollLauncher abre EnrollDialog: el aviso y el formulario viven en un solo lugar.
    expect(launcher).toMatch(/<EnrollDialog\b/);
    expect(launcher.match(/<EnrollForm\b/g)).toHaveLength(1);
  });

  it("la acción de la fila solo existe con canEnroll y preselecciona al contacto", () => {
    const src = cliente();
    const i = src.indexOf('aria-label={`Inscribir a ${fullName(c)} en un grupo`}');
    expect(i).toBeGreaterThan(-1);
    const antes = src.slice(Math.max(0, i - 400), i);
    expect(antes).toMatch(/\{canEnroll && \(/);
    expect(src).toMatch(/setEnrolling\(\{ id: c\.id, name: fullName\(c\) \}\)/);
    expect(src).toMatch(/initialContact=\{enrolling\}/);
  });

  it("después de inscribir vuelve a pedir la lista (cambian las cantidades por tipo)", () => {
    const src = cliente();
    const i = src.indexOf("<EnrollDialog");
    expect(src.slice(i, i + 400)).toMatch(/onEnrolled=\{\(\) => void refetch\(\)\}/);
  });
});
