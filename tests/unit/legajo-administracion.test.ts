import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { describeUserAgent } from "@/lib/user-agent";
import { mergeTimeline, type TimelineEvent } from "@/lib/activity-timeline";
import { migasDelLegajo } from "@/lib/student-header";
import { esInicioDeSesion } from "@/lib/activity-kinds";
import {
  CAPABILITIES,
  SYSTEM_ROLES,
  capabilitiesFor,
} from "@/lib/capabilities";

/**
 * 2026-10-07 — La pestaña «Administración» del legajo.
 *
 * Lo que se fija acá es la lógica PURA (navegador a partir del user agent,
 * mezcla de la línea de tiempo, migas) y las dos fronteras estructurales: la
 * capacidad nueva existe y solo la tiene quien dirige, y los datos de
 * auditoría viajan por su PROPIA ruta — nunca dentro del legajo.
 */

describe("describeUserAgent — un nombre que se lee, no la cadena cruda", () => {
  it.each([
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
      "Chrome en Windows",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
      "Edge en Windows",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      "Safari en iPhone",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
      "Chrome en Android",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      "Safari en Mac",
    ],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0", "Firefox en Linux"],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0",
      "Opera en Windows",
    ],
  ])("%s → %s", (ua, esperado) => {
    expect(describeUserAgent(ua)).toBe(esperado);
  });

  it("sin user agent no inventa un navegador", () => {
    expect(describeUserAgent(null)).toBe("Dispositivo desconocido");
    expect(describeUserAgent("   ")).toBe("Dispositivo desconocido");
  });

  it("un agente raro se nombra como «Otro navegador», con el sistema si se sabe", () => {
    expect(describeUserAgent("curl/8.4.0")).toBe("Otro navegador");
    expect(describeUserAgent("AlgoRaro/1.0 (Windows NT 10.0)")).toBe("Otro navegador en Windows");
  });
});

describe("mergeTimeline — una sola línea de tiempo, la más reciente arriba", () => {
  const ev = (id: string, at: string, kind: TimelineEvent["kind"] = "mensaje"): TimelineEvent => ({
    id,
    kind,
    at,
    title: id,
    detail: null,
  });

  it("mezcla las fuentes y ordena de la más nueva a la más vieja", () => {
    const out = mergeTimeline([
      [ev("m1", "2026-10-01T10:00:00.000Z"), ev("m2", "2026-10-03T10:00:00.000Z")],
      [ev("a1", "2026-10-02T10:00:00.000Z", "asistencia")],
      [],
    ]);
    expect(out.map((e) => e.id)).toEqual(["m2", "a1", "m1"]);
  });

  it("corta en el límite", () => {
    const muchos = Array.from({ length: 80 }, (_, i) =>
      ev(`e${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString())
    );
    const out = mergeTimeline([muchos], 50);
    expect(out).toHaveLength(50);
    expect(out[0]!.id).toBe("e79");
  });

  it("descarta fechas inválidas en vez de mandarlas al final como si fueran viejas", () => {
    const out = mergeTimeline([[ev("ok", "2026-10-01T10:00:00.000Z"), ev("roto", "no-es-fecha")]]);
    expect(out.map((e) => e.id)).toEqual(["ok"]);
  });

  it("con dos eventos en el mismo instante, el orden es estable (por id)", () => {
    const at = "2026-10-01T10:00:00.000Z";
    const a = mergeTimeline([[ev("b", at), ev("a", at)]]);
    const b = mergeTimeline([[ev("a", at)], [ev("b", at)]]);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
  });

  it("el límite por defecto es 50", () => {
    const muchos = Array.from({ length: 70 }, (_, i) =>
      ev(`e${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString())
    );
    expect(mergeTimeline([muchos])).toHaveLength(50);
  });
});

describe("migasDelLegajo — de dónde viene quien mira", () => {
  it("sin contexto: Alumnos › la persona", () => {
    expect(migasDelLegajo("Ana Pérez", null)).toEqual([
      { label: "Alumnos", href: "/contacts" },
      { label: "Ana Pérez", href: null },
    ]);
  });

  it("desde una cohorte: Académico › la cohorte › la persona", () => {
    expect(migasDelLegajo("Ana Pérez", { id: "coh_1", name: "Revit MEP 2" })).toEqual([
      { label: "Académico", href: "/academico" },
      { label: "Revit MEP 2", href: "/cohorts/coh_1" },
      { label: "Ana Pérez", href: null },
    ]);
  });
});

describe("esInicioDeSesion — solo los ingresos, no cualquier sesión nueva", () => {
  it("el login por correo es un ingreso", () => {
    expect(esInicioDeSesion("/sign-in/email")).toBe(true);
  });

  it("el alta de una cuenta o un cambio de contraseña no lo son", () => {
    expect(esInicioDeSesion("/sign-up/email")).toBe(false);
    expect(esInicioDeSesion("/change-password")).toBe(false);
    expect(esInicioDeSesion(undefined)).toBe(false);
  });
});

describe("`alumnos.auditoria` — la capacidad nueva", () => {
  it("existe en la lista cerrada", () => {
    expect(CAPABILITIES).toContain("alumnos.auditoria");
  });

  it("la tiene Dirección, y NO coordinación, soporte ni administración", () => {
    const de = (k: string) => SYSTEM_ROLES.find((r) => r.key === k)!.capabilities;
    expect(de("direccion")).toContain("alumnos.auditoria");
    expect(de("coordinacion")).not.toContain("alumnos.auditoria");
    expect(de("soporte")).not.toContain("alumnos.auditoria");
    expect(de("administracion")).not.toContain("alumnos.auditoria");
  });

  it("en el respaldo de código: owner sí, soporte no", () => {
    expect(capabilitiesFor("owner")).toContain("alumnos.auditoria");
    expect(capabilitiesFor("soporte")).not.toContain("alumnos.auditoria");
  });
});

describe("los datos de auditoría viajan por su propia ruta", () => {
  const leer = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");

  it("la ruta nueva exige `alumnos.auditoria`", () => {
    const ruta = leer("src", "app", "api", "contacts", "[id]", "admin-activity", "route.ts");
    expect(ruta).toMatch(/requireCapability\(\s*"alumnos\.auditoria"/);
  });

  it("el legajo no arma nada de auditoría", () => {
    const legajo = leer("src", "server", "student-record.ts");
    const rutaLegajo = leer("src", "app", "api", "contacts", "[id]", "record", "route.ts");
    for (const texto of [legajo, rutaLegajo]) {
      expect(texto).not.toMatch(/activityLog|activity-log|admin-activity|alumnos\.auditoria/);
    }
  });

  it("la migración nueva habilita RLS en `activity_log`", () => {
    const sql = leer("drizzle", "0050_registro_de_actividad.sql");
    expect(sql).toMatch(/alter table "activity_log" enable row level security/);
    expect(sql).toMatch(/create policy tenant_isolation on "activity_log"/);
    expect(sql).toMatch(/create table if not exists "activity_log"/);
  });
});
