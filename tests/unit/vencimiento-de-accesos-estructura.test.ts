import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 043 — Guard ESTRUCTURAL: toda ruta del portal del alumno está clasificada.
 *
 * O sirve CONTENIDO (grabaciones, enlaces, material, avisos, cursos offline)
 * y pasa por el vencimiento, o sirve lo que la persona LOGRÓ (notas,
 * certificados, escolaridad, cuenta), que no vence. Una ruta nueva bajo
 * `api/portal/me` que no esté en ninguna de las dos listas hace fallar este
 * test: alguien tiene que decidir de qué lado está antes de que viaje nada.
 *
 * El comportamiento (qué viaja y qué no) lo prueba
 * `vencimiento-de-accesos-servidor.test.ts`.
 */

const ROOT = process.cwd();
const ME = path.join(ROOT, "src", "app", "api", "portal", "me");
const leer = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function rutas(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return rutas(p);
    return n === "route.ts" ? [path.relative(ME, p).split(path.sep).join("/")] : [];
  });
}

/** Contenido: vence. Ruta → la marca que prueba que su módulo corta. */
const CONTENIDO: Record<string, { modulo: string; marca: string }> = {
  "route.ts": { modulo: "src/server/student-portal.ts", marca: "accesoVencido(accesos" },
  // 0083 — Con el acceso vencido no hay pedido de prórroga (404).
  "assessments/[id]/extension-request/route.ts": {
    modulo: "src/server/extension-requests.ts",
    marca: "estadosDeAcceso(organizationId, [inscripcion.id], now)",
  },
  "cursadas/[id]/route.ts": { modulo: "src/server/student-portal.ts", marca: "vencida ? null" },
  "offline-courses/route.ts": { modulo: "src/server/offline-courses/student.ts", marca: "offlineAccessForContact(" },
  "offline-courses/[id]/route.ts": { modulo: "src/server/offline-courses/student.ts", marca: "readableCourse(" },
  "offline-courses/[id]/thumbnail/route.ts": {
    modulo: "src/server/offline-courses/student.ts",
    marca: "readableCourse(",
  },
  "offline-courses/[id]/topics/[topicId]/route.ts": {
    modulo: "src/server/offline-courses/student.ts",
    marca: "readableCourse(",
  },
  "offline-courses/[id]/topics/[topicId]/progress/route.ts": {
    modulo: "src/server/offline-courses/progress.ts",
    marca: "canReadCourse(",
  },
  "offline-courses/[id]/quizzes/[quizId]/route.ts": {
    modulo: "src/server/offline-courses/student.ts",
    marca: "readableCourse(",
  },
  "offline-courses/[id]/quizzes/[quizId]/attempts/route.ts": {
    modulo: "src/server/offline-courses/submit.ts",
    marca: "effectiveAccessByEnrollment(",
  },
};

/** Lo que la persona logró: NO vence (decisión del dueño). */
const LOGROS = [
  "certificados/route.ts",
  "certificados/[code]/pdf/route.ts",
  "correcciones/route.ts",
  "cuenta/route.ts",
  "entregas/route.ts",
  "escolaridad/print/route.ts",
];

describe("043 — toda ruta del alumno está clasificada", () => {
  it("cada ruta de api/portal/me es CONTENIDO (vence) o LOGRO (no vence)", () => {
    const todas = rutas(ME).sort();
    const clasificadas = [...Object.keys(CONTENIDO), ...LOGROS].sort();
    expect(todas).toEqual(clasificadas);
  });

  for (const [ruta, { modulo, marca }] of Object.entries(CONTENIDO)) {
    it(`${ruta} pasa por el vencimiento (${modulo})`, () => {
      expect(leer(modulo)).toContain(marca);
    });
  }

  it("las lecturas offline del alumno parten de los accesos con vencimiento", () => {
    const student = leer("src/server/offline-courses/student.ts");
    expect(student).toContain("await offlineAccessForContact(orgId, contactId)");
    // `readableCourse` y `canReadCourse` cuelgan de la misma lista.
    expect(student).toMatch(/async function readableCourseIds[\s\S]*readableAccess\(/);
  });

  it("la unión offline filtra lo vencido antes de unir (cohortes y accesos directos)", () => {
    const access = leer("src/server/offline-courses/access.ts");
    expect(access).toContain("accesoOfflineDeContacto(enrollments, directos)");
    expect(access).toContain("estadosDeAcceso(");
    const logic = leer("src/server/offline-courses/logic.ts");
    expect(logic).toContain(".filter((e) => !e.acceso.vencido)");
    expect(logic).toContain("if (!g.vencido)");
  });

  it("el detalle vencido no consulta material ni avisos", () => {
    const src = leer("src/server/student-portal.ts");
    expect(src).toMatch(/const \[announcements, resources\] = vencida\s*\?\s*\[\[\], \[\]\]/);
    expect(src).toContain("sinEnlacesSiVencio(vencida, buildClassRow(");
  });

  it("el portal del profesor no lee el vencimiento (conserva sus cohortes)", () => {
    expect(leer("src/server/teacher-portal.ts")).not.toContain("access-expiry");
  });
});
