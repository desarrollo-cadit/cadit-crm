import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 045 — Guardas estructurales de marketing (constitución 1.8.0, II).
 *
 * Lo que un test de comportamiento no puede ver: que nadie abra un SEGUNDO
 * camino para armar destinatarios —uno que se olvide de los contactos de
 * prueba o de las bajas— ni que el correo operativo se entere de las bajas de
 * marketing.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8").replace(/\r\n/g, "\n");

function archivos(dir: string): string[] {
  const abs = path.join(RAIZ, dir);
  return readdirSync(abs).flatMap((e) => {
    const full = path.join(abs, e);
    const rel = path.relative(RAIZ, full).replace(/\\/g, "/");
    if (statSync(full).isDirectory()) return archivos(rel);
    return /\.(ts|tsx)$/.test(e) ? [rel] : [];
  });
}

/** El cuerpo de una función exportada (hasta la siguiente declaración de nivel superior). */
function cuerpoDe(src: string, nombre: string): string {
  const inicio = src.search(new RegExp(`(export )?(async )?function ${nombre}\\b`));
  if (inicio < 0) return "";
  const resto = src.slice(inicio + 1);
  const fin = resto.search(/\n(export |async function |function |const |type )/);
  return fin < 0 ? resto : resto.slice(0, fin);
}

describe("(c) un solo camino arma destinatarios desde `contact` (II.b, II.d; FR-003, FR-027)", () => {
  const AUDIENCIAS = "src/server/marketing/audiences.ts";

  it("ningún otro módulo de `src/server/marketing` lee la tabla `contact`", () => {
    const otros = archivos("src/server/marketing")
      .filter((f) => f !== AUDIENCIAS)
      // La baja lee el correo de UN contacto por su id (regla (a), abajo).
      .filter((f) => f !== "src/server/marketing/unsubscribe.ts")
      .filter((f) => /schema\.contact(?![A-Za-z])/.test(leer(f)));
    expect(otros, `leen contactos por su cuenta: ${otros.join(", ")}`).toEqual([]);
  });

  it("`evaluarAudiencia` y `destinatariosDeAudiencia` pasan por `candidatosDeAudiencia`", () => {
    const src = leer(AUDIENCIAS);
    expect(cuerpoDe(src, "evaluarAudiencia")).toContain("candidatosDeAudiencia(");
    expect(cuerpoDe(src, "destinatariosDeAudiencia")).toContain("candidatosDeAudiencia(");
    expect(cuerpoDe(src, "destinatariosDeAudiencia")).toContain("particionarAudiencia(");
  });

  it("`candidatosDeAudiencia` es la única que lee `contact`, y siempre mira prueba y bajas", () => {
    const src = leer(AUDIENCIAS);
    const cuerpo = cuerpoDe(src, "candidatosDeAudiencia");
    expect(cuerpo).toContain(".from(schema.contact)");
    expect(cuerpo, "falta la condición de prueba (is_test)").toContain("schema.conversation.isTest");
    expect(cuerpo, "falta la consulta a las bajas").toContain("schema.marketingUnsubscribe");
    // 045 (T084) — la regla de baja es UNA, compartida con el ejecutor.
    expect(cuerpo).toContain("whereDeBajaActiva(");
    const regla = cuerpoDe(leer("src/server/marketing/bajas.ts"), "whereDeBajaActiva");
    expect(regla, "la baja tiene que mirar también el correo").toContain("schema.marketingUnsubscribe.email");
    expect(regla).toContain("schema.marketingUnsubscribe.contactId");
    expect(regla).toContain("schema.marketingUnsubscribe.revertedAt");
    expect(leer("src/server/marketing/runner.ts"), "el ejecutor usa la misma regla").toMatch(/\bbajaActiva\(/);
    // La otra lectura admitida es la de las OPCIONES del filtro de origen
    // (valores y cantidades), que no arma destinatarios.
    const sinOpciones = src.replace(cuerpoDe(src, "opcionesDeFiltros"), "");
    const lecturas = sinOpciones.match(/\.from\(schema\.contact\)/g) ?? [];
    expect(lecturas, "hay otra lectura de `contact` en audiences.ts").toHaveLength(1);
    expect(cuerpoDe(src, "opcionesDeFiltros")).not.toContain("email");
  });

  it("sin SQL crudo (`sql.raw`) en marketing", () => {
    const conRaw = archivos("src/server/marketing").filter((f) => leer(f).includes("sql.raw"));
    expect(conRaw).toEqual([]);
  });
});

describe("(b) solo el buzón de marketing elige remitente (II.a; FR-016)", () => {
  it("en todo `src/`, solo `src/server/marketing/send.ts` pasa `sender` a `sendMail`", () => {
    const conRemitente = archivos("src")
      .filter((f) => f !== "src/lib/m365/client.ts")
      .filter((f) => {
        const src = leer(f);
        // Dentro de la MISMA llamada (sin cruzar un `;`): `sender:` o `sender,`.
        return /sendMail\(\s*\{[^;]*?\bsender\s*[:,}]/.test(src);
      });
    expect(conRemitente).toEqual(["src/server/marketing/send.ts"]);
  });

  it("el ejecutor no arma destinatarios: solo lee los congelados al confirmar", () => {
    const src = leer("src/server/marketing/runner.ts");
    for (const prohibido of ["evaluarAudiencia", "destinatariosDeAudiencia", "candidatosDeAudiencia", "@/server/marketing/audiences", "./audiences"]) {
      expect(src, `el ejecutor usa ${prohibido}`).not.toContain(prohibido);
    }
    expect(src).not.toMatch(/schema\.contact(?![A-Za-z])/);
    expect(src).toContain("schema.marketingCampaignRecipient");
  });

  it("`confirmarEnvio` congela la lista con `destinatariosDeAudiencia` (única fuente)", () => {
    const cuerpo = cuerpoDe(leer("src/server/marketing/campaigns.ts"), "confirmarEnvio");
    expect(cuerpo).toContain("destinatariosDeAudiencia(");
  });
});

describe("(a) la baja de marketing no toca el correo operativo (II.b; FR-014, SC-005)", () => {
  const OPERATIVOS = [
    ...archivos("src/server/email"),
    "src/server/bulk-sends.ts",
    "src/server/staff-notices.ts",
    ...archivos("src/server").filter((f) => /\/(billing-notices|lead-notices)[^/]*\.ts$/.test(f)),
    "src/server/workshop-notices.ts",
  ];

  it("encuentra los módulos del correo operativo", () => {
    expect(OPERATIVOS.length).toBeGreaterThan(5);
  });

  it.each(OPERATIVOS)("%s no importa marketing ni nombra sus bajas", (f) => {
    const src = leer(f);
    expect(src).not.toContain("@/server/marketing");
    expect(src).not.toContain("marketing_unsubscribe");
    expect(src).not.toContain("marketingUnsubscribe");
  });

  it("la página pública de baja solo LEE: el GET nunca da de baja", () => {
    const src = leer("src/app/baja/[token]/page.tsx");
    expect(src).not.toContain("registrarBaja");
    expect(src).toContain("estadoDeEnlaceDeBaja");
  });

  it("la página pública de baja no muestra el correo ni el nombre del destinatario", () => {
    const src = leer("src/app/baja/[token]/page.tsx") + leer("src/components/marketing/unsubscribe-confirm.tsx");
    for (const dato of [".email", "firstName", "lastName", "contactId"]) {
      expect(src, `la baja muestra ${dato}`).not.toContain(dato);
    }
  });

  it("`unsubscribe.ts` solo lee un contacto por su id (para su correo), nunca listas", () => {
    const src = leer("src/server/marketing/unsubscribe.ts");
    const lecturas = (src.match(/\.from\(schema\.contact\)/g) ?? []).length;
    const porId = (src.match(/eq\(schema\.contact\.id, contactId\)/g) ?? []).length;
    expect(lecturas).toBeGreaterThan(0);
    expect(lecturas).toBe(porId);
  });
});
