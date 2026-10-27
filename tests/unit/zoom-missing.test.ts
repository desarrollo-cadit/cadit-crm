import { beforeEach, describe, expect, it } from "vitest";
import type { ClassRow, MissingDeps, MissingTx, RecRow } from "@/server/zoom/assignment";

/**
 * Grabaciones que ya no están en Zoom: desvincular, volver y borrar.
 *
 * Almacenamiento en memoria con las mismas reglas que la base (una clase, una
 * grabación; asignada ⇔ clase). Lo que se fija:
 *  - al faltar, la clase pierde el enlace SOLO si vino de Zoom y es el de
 *    ESA grabación (un enlace pegado a mano nunca se toca);
 *  - la grabación queda sin clase, conserva quién/cuándo y recuerda la clase;
 *  - si vuelve: la automática queda para el matcher; la manual vuelve a su
 *    clase solo si la clase está libre;
 *  - se borra recién cumplido el plazo, nunca antes.
 */

const ORG = "org_1";
const AHORA = new Date("2026-10-22T12:00:00Z");
const DIA = 86_400_000;

type Extra = { missingInZoomAt: Date | null; missingFromClassSessionId: string | null };

let recs: Map<string, RecRow & Extra>;
let classes: Map<string, ClassRow>;
let deleted: string[];

const tx: MissingTx = {
  async lockClasses() {},
  async getRecording(id) {
    const r = recs.get(id);
    return r ? { ...r } : null;
  },
  async getClass(id) {
    const c = classes.get(id);
    return c ? { ...c } : null;
  },
  async recordingOnClass(classId) {
    const r = [...recs.values()].find((x) => x.classSessionId === classId);
    return r ? { id: r.id, assignmentMode: r.assignmentMode, durationMin: r.durationMin } : null;
  },
  async updateRecording(id, patch) {
    const r = recs.get(id)!;
    Object.assign(r, patch);
    if (r.classSessionId) {
      const dup = [...recs.values()].filter((x) => x.classSessionId === r.classSessionId);
      if (dup.length > 1) throw new Error("unique violation: una clase, una grabación");
    }
    if ((r.assignmentState === "asignada") !== (r.classSessionId !== null)) {
      throw new Error("check violation: asignada ⇔ clase");
    }
  },
  async releaseConflicts(classId, exceptId) {
    let n = 0;
    for (const r of recs.values()) {
      if (r.id !== exceptId && r.assignmentMode === "auto" && r.assignmentState === "conflicto" && r.conflictClassSessionId === classId) {
        Object.assign(r, { assignmentState: "sin_clase", conflictClassSessionId: null });
        n++;
      }
    }
    return n;
  },
  async updateClass(id, patch) {
    Object.assign(classes.get(id)!, patch);
  },
  async getMissing(id) {
    const r = recs.get(id);
    return r ? { missingInZoomAt: r.missingInZoomAt, missingFromClassSessionId: r.missingFromClassSessionId } : null;
  },
  async deleteRecording(id) {
    recs.delete(id);
    deleted.push(id);
  },
};

const deps = (): MissingDeps => ({ run: async (_org, fn) => fn(tx), now: () => AHORA });

const url = (id: string) => `https://zoom.us/rec/share/${id}`;

function rec(id: string, extra: Partial<RecRow & Extra> = {}) {
  const r: RecRow & Extra = {
    id,
    zoomConnectionId: "zc_1",
    zoomMeetingId: "9990000001",
    hostZoomUserId: "u1",
    startTime: new Date("2026-06-15T21:34:00Z"),
    durationMin: 120,
    playUrl: url(id),
    classSessionId: null,
    assignmentMode: "auto",
    assignmentState: "pendiente",
    candidateClassIds: [],
    conflictClassSessionId: null,
    assignedBy: null,
    assignedAt: null,
    missingInZoomAt: null,
    missingFromClassSessionId: null,
    ...extra,
  };
  recs.set(id, r);
  return r;
}

function clase(id: string, extra: Partial<ClassRow> = {}) {
  const c: ClassRow = { id, canceledAt: null, recordingUrl: null, recordingSource: null, ...extra };
  classes.set(id, c);
  return c;
}

/** Una grabación asignada a A1, con el enlace de Zoom proyectado en la clase. */
function asignada(id: string, extra: Partial<RecRow & Extra> = {}) {
  clase("A1", { recordingUrl: url(id), recordingSource: "zoom" });
  return rec(id, {
    classSessionId: "A1",
    assignmentState: "asignada",
    assignedAt: new Date("2026-06-16T00:00:00Z"),
    ...extra,
  });
}

const mod = () => import("@/server/zoom/assignment");

beforeEach(() => {
  recs = new Map();
  classes = new Map();
  deleted = [];
});

describe("detachMissing — al faltar en Zoom se desvincula", () => {
  it("limpia el enlace de Zoom de la clase y deja la grabación sin clase, recordando la clase", async () => {
    const { detachMissing } = await mod();
    asignada("r1", { missingInZoomAt: AHORA, assignedBy: "usr_1", assignmentMode: "manual" });

    expect(await detachMissing(ORG, "r1", deps())).toBe(true);

    expect(classes.get("A1")).toMatchObject({ recordingUrl: null, recordingSource: null });
    expect(recs.get("r1")).toMatchObject({
      classSessionId: null,
      assignmentState: "sin_clase",
      missingFromClassSessionId: "A1",
      // Auditoría: quién y cuándo se conservan hasta el borrado.
      assignmentMode: "manual",
      assignedBy: "usr_1",
      assignedAt: new Date("2026-06-16T00:00:00Z"),
    });
  });

  it("un enlace pegado a mano en la clase NO se toca", async () => {
    const { detachMissing } = await mod();
    asignada("r1", { missingInZoomAt: AHORA });
    classes.get("A1")!.recordingUrl = "https://drive.example/video";
    classes.get("A1")!.recordingSource = "manual";

    await detachMissing(ORG, "r1", deps());

    expect(classes.get("A1")).toMatchObject({ recordingUrl: "https://drive.example/video", recordingSource: "manual" });
    expect(recs.get("r1")!.classSessionId).toBeNull();
  });

  it("un enlace de Zoom que NO es el de esta grabación no se toca", async () => {
    const { detachMissing } = await mod();
    asignada("r1", { missingInZoomAt: AHORA });
    classes.get("A1")!.recordingUrl = url("otra");

    await detachMissing(ORG, "r1", deps());

    expect(classes.get("A1")).toMatchObject({ recordingUrl: url("otra"), recordingSource: "zoom" });
  });

  it("una grabación que sigue en Zoom no se desvincula", async () => {
    const { detachMissing } = await mod();
    asignada("r1");

    expect(await detachMissing(ORG, "r1", deps())).toBe(false);

    expect(classes.get("A1")!.recordingUrl).toBe(url("r1"));
    expect(recs.get("r1")!.assignmentState).toBe("asignada");
  });
});

describe("restoreReappeared — si vuelve a aparecer", () => {
  it("manual: vuelve a su clase si la clase está libre", async () => {
    const { restoreReappeared } = await mod();
    clase("A1");
    rec("r1", {
      assignmentMode: "manual",
      assignmentState: "sin_clase",
      assignedBy: "usr_1",
      missingFromClassSessionId: "A1",
    });

    expect(await restoreReappeared(ORG, "r1", deps())).toBe("restaurada");

    expect(recs.get("r1")).toMatchObject({
      classSessionId: "A1",
      assignmentState: "asignada",
      assignmentMode: "manual",
      assignedBy: "usr_1",
      missingFromClassSessionId: null,
    });
    expect(classes.get("A1")).toMatchObject({ recordingUrl: url("r1"), recordingSource: "zoom" });
  });

  it("manual: si la clase ya tiene OTRA grabación, no se restaura y queda sin clase", async () => {
    const { restoreReappeared } = await mod();
    clase("A1", { recordingUrl: url("r2"), recordingSource: "zoom" });
    rec("r2", { classSessionId: "A1", assignmentState: "asignada" });
    rec("r1", { assignmentMode: "manual", assignmentState: "sin_clase", missingFromClassSessionId: "A1" });

    expect(await restoreReappeared(ORG, "r1", deps())).toBe("no_restaurada");

    expect(recs.get("r1")).toMatchObject({ classSessionId: null, assignmentState: "sin_clase", missingFromClassSessionId: null });
    expect(classes.get("A1")!.recordingUrl).toBe(url("r2"));
  });

  it("manual: si la clase tiene un enlace pegado a mano, no se restaura", async () => {
    const { restoreReappeared } = await mod();
    clase("A1", { recordingUrl: "https://drive.example/video", recordingSource: "manual" });
    rec("r1", { assignmentMode: "manual", assignmentState: "sin_clase", missingFromClassSessionId: "A1" });

    expect(await restoreReappeared(ORG, "r1", deps())).toBe("no_restaurada");
    expect(classes.get("A1")!.recordingUrl).toBe("https://drive.example/video");
  });

  it("manual: una clase cancelada o borrada no la recibe", async () => {
    const { restoreReappeared } = await mod();
    clase("A1", { canceledAt: AHORA });
    rec("r1", { assignmentMode: "manual", assignmentState: "sin_clase", missingFromClassSessionId: "A1" });
    rec("r3", { assignmentMode: "manual", assignmentState: "sin_clase", missingFromClassSessionId: "BORRADA" });

    expect(await restoreReappeared(ORG, "r1", deps())).toBe("no_restaurada");
    expect(await restoreReappeared(ORG, "r3", deps())).toBe("no_restaurada");
    expect(recs.get("r1")!.classSessionId).toBeNull();
  });

  it("automática: no se le fuerza la clase; queda para el matcher normal", async () => {
    const { restoreReappeared } = await mod();
    clase("A1");
    rec("r1", { assignmentState: "sin_clase", missingFromClassSessionId: "A1" });

    expect(await restoreReappeared(ORG, "r1", deps())).toBe("automatica");

    expect(recs.get("r1")).toMatchObject({ classSessionId: null, missingFromClassSessionId: null });
    expect(classes.get("A1")!.recordingUrl).toBeNull();
  });

  it("mientras siga faltando, no se restaura nada", async () => {
    const { restoreReappeared } = await mod();
    clase("A1");
    rec("r1", {
      assignmentMode: "manual",
      assignmentState: "sin_clase",
      missingInZoomAt: AHORA,
      missingFromClassSessionId: "A1",
    });

    expect(await restoreReappeared(ORG, "r1", deps())).toBeNull();
    expect(recs.get("r1")!.missingFromClassSessionId).toBe("A1");
  });
});

describe("purgeMissing — se borra cumplido el plazo, nunca antes", () => {
  it("falta hace menos que el plazo → se conserva", async () => {
    const { purgeMissing } = await mod();
    rec("r1", { missingInZoomAt: new Date(AHORA.getTime() - 29 * DIA) });

    expect(await purgeMissing(ORG, "r1", { purgeDays: 30 }, deps())).toBe(false);
    expect(recs.has("r1")).toBe(true);
  });

  it("falta hace más que el plazo → se borra (y antes suelta la clase si era suya)", async () => {
    const { purgeMissing } = await mod();
    asignada("r1", { missingInZoomAt: new Date(AHORA.getTime() - 31 * DIA) });

    expect(await purgeMissing(ORG, "r1", { purgeDays: 30 }, deps())).toBe(true);

    expect(deleted).toEqual(["r1"]);
    expect(classes.get("A1")).toMatchObject({ recordingUrl: null, recordingSource: null });
  });

  it("una que volvió a aparecer no se borra nunca", async () => {
    const { purgeMissing } = await mod();
    rec("r1", { missingInZoomAt: null });

    expect(await purgeMissing(ORG, "r1", { purgeDays: 30 }, deps())).toBe(false);
    expect(deleted).toEqual([]);
  });
});

describe("la fecha de borrado (pura)", () => {
  it("es la marca de faltante + el plazo; sin marca no hay fecha", async () => {
    const { fechaDeBorrado, debeBorrarse } = await import("@/lib/recording-purge");
    const marca = new Date("2026-10-01T10:00:00Z");
    expect(fechaDeBorrado(marca, 30)!.toISOString()).toBe("2026-10-31T10:00:00.000Z");
    expect(fechaDeBorrado(null, 30)).toBeNull();
    expect(debeBorrarse(marca, new Date("2026-10-31T09:59:59Z"), 30)).toBe(false);
    expect(debeBorrarse(marca, new Date("2026-10-31T10:00:00Z"), 30)).toBe(true);
    expect(debeBorrarse(null, new Date("2027-01-01T00:00:00Z"), 30)).toBe(false);
  });
});
