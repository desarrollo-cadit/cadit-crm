import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 012 (T005, FR-008) — Ninguna ruta puede quedar sin declarar su permiso.
 *
 * El riesgo que cubre: la fase 2 migró 62 rutas a `requireCapability`. Si una
 * queda con `withAuth` pelado por olvido, no falla nada — simplemente queda
 * abierta a cualquier persona autenticada. Y el día que entren alumnos y
 * profesores (014, 015), "cualquier persona autenticada" deja de significar
 * "alguien del staff".
 *
 * Con la migración terminada el test dejó de ser informativo: ahora falla.
 *
 * Un olvido silencioso es exactamente el tipo de error que un test tiene que
 * volver ruidoso.
 */

const API_DIR = path.join(process.cwd(), "src", "app", "api");

function findRoutes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findRoutes(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(API_DIR, f).replace(/\\/g, "/");

/**
 * Rutas que legítimamente NO llevan capacidad, con el motivo. La lista es
 * explícita para que agregar una excepción sea una decisión visible en el
 * diff, no un silencio.
 */
const SIN_CAPACIDAD: Record<string, string> = {
  // Superficie pública: sin sesión por diseño (007).
  "public/courses/route.ts": "catálogo público",
  "public/courses/[id]/route.ts": "detalle público del curso",
  "public/courses/[id]/submit/route.ts": "captación pública por curso",
  "public/forms/[formId]/submit/route.ts": "captación pública por formulario",
  "public/certificates/[code]/route.ts": "verificación pública de certificado",
  // 023 — El GET es público a propósito: el login tiene que pintar la marca
  // ANTES de que exista sesión. El PUT sí pide `configuracion.editar`, y por
  // eso el archivo pasaba el chequeo de abajo sin que nadie mirara el GET.
  // Queda declarado acá para que la excepción sea visible, no accidental.
  "settings/branding/route.ts": "marca del login, antes de autenticarse",
  // Infraestructura sin datos de dominio.
  "health/route.ts": "healthcheck",
  "auth/[...all]/route.ts": "Better Auth",
  "events/route.ts": "stream SSE; su alcance se resuelve en 017",
  // Autenticadas por API key propia, no por sesión (001).
  "bot/typing/route.ts": "X-API-Key",
  "bot/reset/route.ts": "X-API-Key",
  "bot/media/[mediaId]/route.ts": "X-API-Key",
  "webhooks/wa/[webhookToken]/route.ts": "webhook de Meta, firma propia",
  // Mocks del entorno de pruebas: `mockGuard()` responde 404 incondicional
  // fuera de desarrollo (dev-guard.ts). Verificado: las 9 están cubiertas —
  // `ai-mock/chat/completions` hereda el guard por re-export.
  "dev/ai-mock/chat/completions/route.ts": "re-export de la ruta v1, con mockGuard",
  "dev/ai-mock/v1/chat/completions/route.ts": "mockGuard",
  "dev/wa-mock/echo/route.ts": "mockGuard",
  "dev/wa-mock/graph/[...path]/route.ts": "mockGuard",
  "dev/wa-mock/inbound/route.ts": "mockGuard",
  "dev/wa-mock/media-file/[id]/route.ts": "mockGuard",
  "dev/wa-mock/outbox/route.ts": "mockGuard",
  "dev/wa-mock/status/route.ts": "mockGuard",
  "dev/wa-mock/template-status/route.ts": "mockGuard",
};

describe("cobertura de permisos en las rutas de API", () => {
  const routes = findRoutes(API_DIR);

  it("encuentra el árbol de rutas", () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  /**
   * 012 (T006-T009) — La fase 2 terminó: las 62 rutas están migradas y esta
   * exigencia se endureció. Ya no alcanza con declarar "alguna" protección:
   * hay que nombrar la capacidad.
   *
   * `withAuth` pelado vuelve a ser un fallo, y por eso se comprueba aparte
   * abajo — que una ruta nazca autenticada pero sin permiso es exactamente
   * el olvido que esta fase vino a hacer imposible.
   */
  it("toda ruta declara su capacidad, o está en la lista de excepciones", () => {
    const desprotegidas: string[] = [];

    for (const file of routes) {
      const name = rel(file);
      if (name in SIN_CAPACIDAD) continue;

      const src = readFileSync(file, "utf8");
      // 014 — El portal no usa capacidades: un profesor no tiene ninguna, y
      // darle una para que entre le abriría también las pantallas del staff
      // que piden esa misma capacidad. Su puerta es `requireTeacherPortal`, y
      // el test de abajo exige que las dos no se mezclen.
      const protegida =
        src.includes("requireCapability(") ||
        src.includes("requireTeacherPortal(") ||
        // 015 — El alumno tiene su propia puerta por el mismo motivo que el
        // profesor: no tiene capacidades, y darle una para que entre le
        // abriría las pantallas del staff que piden esa misma capacidad.
        src.includes("requireStudentPortal(");
      if (!protegida) desprotegidas.push(name);
    }

    expect(desprotegidas, `rutas sin capacidad declarada:\n${desprotegidas.join("\n")}`)
      .toEqual([]);
  });

  /**
   * 014 (FR-008) — Las dos audiencias no comparten puerta.
   *
   * Una ruta del portal que use `requireCapability` estaría exigiéndole a un
   * profesor una capacidad de staff: o no entra nunca, o —peor— alguien le
   * asigna la capacidad para destrabarlo y de paso le abre el panel entero.
   * Y una ruta del staff con `requireTeacherPortal` dejaría entrar a cualquier
   * profesor a una pantalla de coordinación.
   */
  it("el portal usa su propia puerta, y el staff la suya", () => {
    const mezcladas: string[] = [];

    for (const file of routes) {
      const name = rel(file);
      const src = readFileSync(file, "utf8");
      const esPortal = name.startsWith("portal/");

      if (esPortal && src.includes("requireCapability(")) {
        mezcladas.push(`${name}: ruta de portal con capacidad de staff`);
      }
      if (!esPortal && src.includes("requireTeacherPortal(")) {
        mezcladas.push(`${name}: ruta de staff con la puerta del portal`);
      }
      if (!esPortal && src.includes("requireStudentPortal(")) {
        mezcladas.push(`${name}: ruta de staff con la puerta del alumno`);
      }
      /**
       * 015 — Y las DOS puertas del portal tampoco se mezclan entre sí. Una
       * ruta del alumno con `requireTeacherPortal` no falla: deja entrar a
       * cualquier profesor a la ficha de un alumno, que es exactamente lo que
       * FR-002 prohíbe.
       */
      if (
        esPortal &&
        src.includes("requireTeacherPortal(") &&
        src.includes("requireStudentPortal(")
      ) {
        mezcladas.push(`${name}: una misma ruta con las dos puertas del portal`);
      }
    }

    expect(mezcladas, mezcladas.join("\n")).toEqual([]);
  });

  /**
   * FR-006/DV-002 — El profesor carga resultados; **no crea ni borra
   * evaluaciones**. La forma de garantizarlo no es esconder un botón: es que
   * la ruta no exista.
   */
  it("el portal no expone crear ni borrar evaluaciones", () => {
    const grading = routes.filter((f) => {
      const name = rel(f);
      return name.startsWith("portal/") && name.includes("grading");
    });

    expect(grading.length, "no hay ruta de evaluación en el portal").toBeGreaterThan(0);

    for (const f of grading) {
      const src = readFileSync(f, "utf8");
      expect(src, `${rel(f)} exporta POST`).not.toMatch(/export const POST/);
      expect(src, `${rel(f)} exporta DELETE`).not.toMatch(/export const DELETE/);
    }
  });

  /**
   * `requireFullAccess` se eliminó en T007 y `withAuth` quedó como detalle
   * interno de `requireCapability`. Una ruta que lo importe directamente está
   * salteando el permiso, aunque el usuario esté autenticado.
   *
   * Se mira el IMPORT y no el cuerpo a propósito: varias rutas mencionan
   * `withAuth` en un comentario para explicar de dónde sale el 409, y un test
   * que se enoja con la prosa termina enseñando a no escribir comentarios.
   */
  it("ninguna ruta importa los envoltorios viejos", () => {
    const viejas = routes.filter((f) => {
      const src = readFileSync(f, "utf8");
      const imports = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@\/lib\/api"/g)];
      return imports.some((m) =>
        (m[1] ?? "").split(",").some((n) => {
          const name = n.trim();
          return name === "withAuth" || name === "requireFullAccess";
        })
      );
    });

    expect(viejas.map(rel), "rutas con envoltorio viejo").toEqual([]);
  });

  /**
   * Una excepción que ya no existe es basura que confunde: alguien la lee y
   * cree que hay una ruta pública donde no la hay.
   */
  it("no hay excepciones que apunten a rutas inexistentes", () => {
    const existentes = new Set(routes.map(rel));
    const fantasmas = Object.keys(SIN_CAPACIDAD).filter((r) => !existentes.has(r));
    expect(fantasmas, `excepciones sin ruta: ${fantasmas.join(", ")}`).toEqual([]);
  });

  /**
   * El contador que informaba el avance de la fase 2 se retiró: llegó a cero
   * y la exigencia de arriba ya no lo deja subir.
   */
});
