import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MINIMO_PARA_GUARDAR_POR_DEFECTO, seGuardaLaGrabacion } from "@/lib/recording-duration";

/**
 * 2026-10-27 — Una clase real nunca dura 15 minutos: las grabaciones más
 * cortas (pruebas, arranques por error) no se guardan en `zoom_recording`.
 * `ZOOM_MIN_RECORDING_MIN` (default 15, 0 apaga). Las ya guardadas las limpia
 * la migración 0081 con un 15 FIJO (en SQL no hay entorno), sin tocar las
 * asignadas a mano ni las que son el enlace de una clase.
 */

describe("seGuardaLaGrabacion", () => {
  it("se guarda con el mínimo o más; se descarta por debajo", () => {
    expect(seGuardaLaGrabacion(15, 15)).toBe(true);
    expect(seGuardaLaGrabacion(120, 15)).toBe(true);
    expect(seGuardaLaGrabacion(14, 15)).toBe(false);
    expect(seGuardaLaGrabacion(0, 15)).toBe(false);
  });

  it("sin duración conocida se guarda: no se descarta lo que no se puede juzgar", () => {
    expect(seGuardaLaGrabacion(null, 15)).toBe(true);
  });

  it("0 apaga el filtro", () => {
    expect(seGuardaLaGrabacion(0, 0)).toBe(true);
    expect(seGuardaLaGrabacion(3, 0)).toBe(true);
  });

  it("el default es 15", () => {
    expect(MINIMO_PARA_GUARDAR_POR_DEFECTO).toBe(15);
  });
});

describe("el entorno", () => {
  it("ZOOM_MIN_RECORDING_MIN: entero ≥ 0, default 15", () => {
    const env = readFileSync("src/lib/env.ts", "utf8");
    expect(env).toMatch(/ZOOM_MIN_RECORDING_MIN: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(15\)/);
  });

  it("la sincronización y la verificación lo leen", () => {
    for (const f of ["src/server/zoom/sync.ts", "src/server/zoom/verify.ts"]) {
      expect(readFileSync(f, "utf8")).toMatch(/minRecordingMin: env\.ZOOM_MIN_RECORDING_MIN/);
    }
  });
});

describe("0081 — limpieza de las cortas ya guardadas", () => {
  const ARCHIVO = path.join(process.cwd(), "drizzle", "0081_grabaciones_cortas.sql");
  const leer = () => readFileSync(ARCHIVO, "utf8").replace(/\r\n/g, "\n");
  const sinComentarios = () => leer().replace(/--.*$/gm, "");

  it("existe y está en el journal", () => {
    expect(existsSync(ARCHIVO)).toBe(true);
    expect(readFileSync("drizzle/meta/_journal.json", "utf8")).toContain('"tag": "0081_grabaciones_cortas"');
  });

  it("borra SOLO de zoom_recording, con 15 fijo y nunca las de duración desconocida", () => {
    const sql = sinComentarios();
    expect([...sql.matchAll(/delete from "([a-z_]+)"/g)].map((m) => m[1])).toEqual(["zoom_recording"]);
    expect(sql).toMatch(/"duration_min" is not null/);
    expect(sql).toMatch(/"duration_min" < 15/);
    expect(sql).not.toMatch(/\b(update|truncate|drop)\b/i);
  });

  it("nunca las asignadas a mano ni las que son el enlace de una clase", () => {
    const sql = sinComentarios();
    expect(sql).toMatch(/"assignment_mode" <> 'manual'/);
    expect(sql).toMatch(/"class_session_id" is null/);
    expect(sql).toMatch(
      /not exists \(\s*select 1 from "class_session" cs[\s\S]*cs\."recording_source" = 'zoom'[\s\S]*cs\."recording_url" = zr\."play_url"/
    );
  });
});
