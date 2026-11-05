import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  claveDeClasePush,
  claveDeCorreccionPush,
  claveDeProrrogaPush,
  clasesQueTocan,
  contenidoClasePorEmpezar,
  contenidoCorreccionPublicada,
  contenidoProrroga,
  type ClaseCandidata,
} from "@/lib/push/notices";

const root = process.cwd();
const ZONA = "America/Montevideo"; // UTC-3 all year

// A class on 2026-11-10 at 19:00 Montevideo = 22:00 UTC.
const clase = (over: Partial<ClaseCandidata> = {}): ClaseCandidata => ({
  id: "cls_1",
  cohortId: "coh_1",
  date: new Date(Date.UTC(2026, 10, 10)),
  startTime: "19:00",
  canceledAt: null,
  ...over,
});
const a = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 10, h, m));

describe("clasesQueTocan — window (now, now + lead]", () => {
  it("includes a class that starts inside the lead window", () => {
    const r = clasesQueTocan([clase()], ZONA, a(21, 15), 60); // 45 min before
    expect(r).toHaveLength(1);
    expect(r[0]!.hora).toBe("19:00");
  });

  it("skips classes too far away, already started, or exactly now", () => {
    expect(clasesQueTocan([clase()], ZONA, a(20, 0), 60)).toHaveLength(0); // 2 h before
    expect(clasesQueTocan([clase()], ZONA, a(22, 5), 60)).toHaveLength(0); // started
    expect(clasesQueTocan([clase()], ZONA, a(22, 0), 60)).toHaveLength(0); // exactly now
  });

  it("includes the boundary (exactly lead minutes before)", () => {
    expect(clasesQueTocan([clase()], ZONA, a(21, 0), 60)).toHaveLength(1);
  });

  it("never notifies canceled classes or classes with no start time", () => {
    const now = a(21, 15);
    expect(clasesQueTocan([clase({ canceledAt: new Date() })], ZONA, now, 60)).toHaveLength(0);
    expect(clasesQueTocan([clase({ startTime: null })], ZONA, now, 60)).toHaveLength(0);
    expect(clasesQueTocan([clase({ startTime: "pronto" })], ZONA, now, 60)).toHaveLength(0);
  });
});

describe("push notice content", () => {
  const todos = [
    contenidoCorreccionPublicada({ evaluacion: "Trabajo final", curso: "Revit", enrollmentId: "enr_1" }),
    contenidoProrroga({ aprobada: true, evaluacion: "Trabajo final", enrollmentId: "enr_1" }),
    contenidoProrroga({ aprobada: false, evaluacion: "Trabajo final", enrollmentId: "enr_1" }),
    contenidoClasePorEmpezar({ curso: "Revit", hora: "19:00", enrollmentId: "enr_1" }),
  ];

  it("keeps titles short and destinations inside the app", () => {
    for (const p of todos) {
      expect(p.title.length).toBeLessThanOrEqual(40);
      expect(p.url.startsWith("/portal/")).toBe(true);
      expect(p.tag).toBeTruthy();
    }
  });

  it("says approved or rejected without leaking the reason", () => {
    expect(todos[1]!.title).toBe("Prórroga aprobada");
    expect(todos[2]!.title).toBe("Prórroga rechazada");
  });

  it("never carries grades or amounts on the lock screen", () => {
    for (const p of todos) {
      expect(`${p.title} ${p.body}`).not.toMatch(/nota|puntos|\$|USD|aprobad[oa] con|%/i);
    }
  });

  it("escapes the enrollment id in the destination", () => {
    const p = contenidoCorreccionPublicada({ evaluacion: "x", curso: "y", enrollmentId: "a/b?c" });
    expect(p.url).toContain("a%2Fb%3Fc");
  });
});

describe("dedupe keys", () => {
  it("are stable and distinct per subject", () => {
    expect(claveDeCorreccionPush("cor_1")).toBe("push:correccion:cor_1");
    expect(claveDeProrrogaPush("req_1")).toBe("push:prorroga:req_1");
    // the same class notifies each student once, and two students do not collide
    expect(claveDeClasePush("cls_1", "ct_a")).not.toBe(claveDeClasePush("cls_1", "ct_b"));
    expect(claveDeClasePush("cls_1", "ct_a")).toBe(claveDeClasePush("cls_1", "ct_a"));
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  it("publishing a correction notifies by push AFTER the commit", () => {
    expect(read("src/server/corrections.ts")).toMatch(
      /onAfterCommit\(\(\) => void avisarPushCorreccionPublicada\(/
    );
  });

  it("deciding an extension request notifies by push AFTER the commit", () => {
    expect(read("src/server/extension-requests.ts")).toMatch(
      /onAfterCommit\(\(\) => void avisarPushProrroga\(/
    );
  });

  it("the class reminder scheduler starts on boot behind the shared guard", () => {
    expect(read("src/instrumentation.ts")).toContain("startPushClassRemindersOnBoot");
    const node = read("src/instrumentation-node.ts");
    expect(node).toMatch(/startPushClassRemindersOnBoot[\s\S]*shouldStartScheduler/);
  });

  it("the push service is never called inside a database scope", () => {
    // `enviarAviso` must load → send → record in separate scopes: the HTTP call
    // (`enviarADestinos`) sits BETWEEN two withOrganizationScope blocks.
    const src = read("src/server/push/notices.ts");
    const aviso = src.slice(src.indexOf("async function enviarAviso"), src.indexOf("avisarPushCorreccionPublicada"));
    const primero = aviso.indexOf("withOrganizationScope");
    const envio = aviso.indexOf("enviarADestinos(");
    const segundo = aviso.indexOf("withOrganizationScope", primero + 1);
    expect(primero).toBeGreaterThan(-1);
    expect(envio).toBeGreaterThan(primero);
    expect(segundo).toBeGreaterThan(envio);
  });
});

describe("a push failure never breaks the business action", () => {
  it("every trigger swallows errors from the database layer", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/with-tenant", () => ({
      withOrganizationScope: async () => {
        throw new Error("db caída");
      },
    }));
    vi.doMock("@/lib/push", () => ({ pushDisponible: () => true }));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = await import("@/server/push/notices");

    await expect(m.avisarPushCorreccionPublicada("org", "cor_1")).resolves.toBeUndefined();
    await expect(m.avisarPushProrroga("org", "req_1", "aprobar")).resolves.toBeUndefined();
    await expect(m.runPushClassRemindersForOrg("org", new Date(), 60)).resolves.toBe(0);

    quiet.mockRestore();
    vi.doUnmock("@/lib/db/with-tenant");
    vi.doUnmock("@/lib/push");
  });
});
