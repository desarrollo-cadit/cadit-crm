import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ningún módulo de `src/server` o `src/lib` puede importarse en círculo.
 *
 * El riesgo que cubre, y que ya pasó: `courses` importaba `licenses` y
 * `licenses` importaba `courses`. En un ciclo, el módulo que se evalúa segundo
 * recibe el espacio de nombres del primero A MEDIO LLENAR, así que si le toca
 * el orden equivocado un `export function` todavía no está. Eso produjo una
 * corrida con 25 fallos —todos `computeCohortStatus is not a function`— y la
 * corrida siguiente, sin tocar una línea, salió verde.
 *
 * Ese es el defecto real: no los 25 fallos, sino que el resultado de la suite
 * dependa del orden de carga. Una suite así puede mentir en cualquier
 * dirección, y la vez que mienta en verde no la vamos a ver.
 *
 * Por eso el test mira la ESTRUCTURA y no el síntoma: el síntoma aparece una
 * de cada N corridas, el ciclo está siempre.
 */

const ROOT = process.cwd();
const RAICES = ["src/server", "src/lib"];

function archivosTs(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entrada of readdirSync(dir)) {
    const full = path.join(dir, entrada);
    if (statSync(full).isDirectory()) archivosTs(full, out);
    else if (/\.tsx?$/.test(entrada) && !entrada.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, "/");

/**
 * `import ... from "x"` y `export ... from "x"`. La cláusula del medio se
 * captura para poder descartar las que son solo de tipos.
 */
const DESDE = /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
/** `import "x"` a secas: sin cláusula, y siempre en runtime. */
const SUELTO = /(?:^|\n)\s*import\s+["']([^"']+)["']/g;

/**
 * Un import de tipos se borra al compilar, así que no puede llegar a existir
 * cuando el módulo se evalúa: un ciclo hecho solo de tipos es inofensivo y
 * marcarlo sería ruido. Cuenta como tal tanto `import type { A }` como
 * `import { type A, type B }` con TODOS los bindings marcados.
 */
function soloTipos(clausula: string): boolean {
  if (/^\s*type\b/.test(clausula)) return true;
  const llaves = /\{([\s\S]*)\}/.exec(clausula);
  if (!llaves?.[1]) return false;
  const fuera = clausula.replace(/\{[\s\S]*\}/, "").replace(/,/g, "").trim();
  if (fuera !== "") return false;
  const partes = llaves[1].split(",").map((p) => p.trim()).filter(Boolean);
  return partes.length > 0 && partes.every((p) => /^type\s/.test(p));
}

/**
 * `import()` dinámico queda afuera a propósito: se evalúa cuando se llama, no
 * cuando se carga el módulo, así que no puede dejar un export a medio armar.
 * Es, de hecho, una de las formas válidas de romper un ciclo.
 */
function resolver(spec: string, desde: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(desde), spec);
  else return null;

  for (const cand of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

function construirGrafo(): Map<string, Set<string>> {
  const grafo = new Map<string, Set<string>>();
  for (const archivo of RAICES.flatMap((r) => archivosTs(path.join(ROOT, r)))) {
    const src = readFileSync(archivo, "utf8");
    const destinos = new Set<string>();
    const agregar = (spec: string) => {
      const destino = resolver(spec, archivo);
      if (destino && destino !== archivo) destinos.add(rel(destino));
    };
    for (const m of src.matchAll(DESDE)) {
      if (!soloTipos(m[1] ?? "")) agregar(m[2] ?? "");
    }
    for (const m of src.matchAll(SUELTO)) agregar(m[1] ?? "");
    grafo.set(rel(archivo), destinos);
  }
  return grafo;
}

/** Tarjan: cada componente fuertemente conexo de más de un archivo es un ciclo. */
function ciclos(grafo: Map<string, Set<string>>): string[][] {
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const enPila = new Set<string>();
  const pila: string[] = [];
  const encontrados: string[][] = [];
  let n = 0;

  const visitar = (v: string): void => {
    idx.set(v, n);
    low.set(v, n);
    n += 1;
    pila.push(v);
    enPila.add(v);

    for (const w of grafo.get(v) ?? []) {
      if (!grafo.has(w)) continue;
      if (!idx.has(w)) {
        visitar(w);
        low.set(v, Math.min(low.get(v) ?? 0, low.get(w) ?? 0));
      } else if (enPila.has(w)) {
        low.set(v, Math.min(low.get(v) ?? 0, idx.get(w) ?? 0));
      }
    }

    if (low.get(v) === idx.get(v)) {
      const componente: string[] = [];
      let w: string | undefined;
      do {
        w = pila.pop();
        if (w === undefined) break;
        enPila.delete(w);
        componente.push(w);
      } while (w !== v);
      if (componente.length > 1) encontrados.push(componente.sort());
    }
  };

  for (const v of grafo.keys()) if (!idx.has(v)) visitar(v);
  return encontrados;
}

describe("ciclos de import en src/server y src/lib", () => {
  const grafo = construirGrafo();

  it("el grafo se construyó sobre archivos reales", () => {
    expect(grafo.size).toBeGreaterThan(50);
  });

  /**
   * Sin lista de excepciones a propósito. Un ciclo tolerado es exactamente el
   * que vuelve dentro de tres meses, y romperlo siempre se puede: se extrae lo
   * compartido a un módulo hoja que no importa de vuelta —como
   * `@/lib/cohort-status` y `@/server/inbox/message-dto`— o se difiere la
   * importación con `import()`.
   */
  it("no hay ninguno", () => {
    const encontrados = ciclos(grafo);
    const detalle = encontrados
      .map((c) => {
        const aristas = c.flatMap((a) =>
          [...(grafo.get(a) ?? [])].filter((b) => c.includes(b)).map((b) => `${a} -> ${b}`)
        );
        return `ciclo entre ${c.length} archivos:\n    ${aristas.join("\n    ")}`;
      })
      .join("\n  ");

    expect(encontrados, `ciclos de import detectados:\n  ${detalle}`).toEqual([]);
  });
});
