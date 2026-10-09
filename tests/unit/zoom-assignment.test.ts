import { beforeEach, describe, expect, it } from "vitest";
import type {
  AssignmentDeps,
  AssignmentTx,
  ClassRow,
  RecRow,
} from "@/server/zoom/assignment";
import type { MatchContext } from "@/server/zoom/matching";

/**
 * 030 US2/US3 (contrato adjudicacion.md §Persistencia y §Operaciones
 * manuales) — Lo que la adjudicación ESCRIBE.
 *
 * Almacenamiento en memoria con las mismas reglas que la base (una clase, una
 * grabación). Lo que se fija son las promesas al usuario:
 *  - un enlace pegado a mano nunca se pisa (conflicto, no reemplazo);
 *  - una decisión manual nunca la deshace la sincronización (SC-005);
 *  - desasignar limpia la clase SOLO si el enlace era el de esa grabación.
 */

const ORG = "org_1";
const AHORA = new Date("2026-10-09T12:00:00Z");

let recs: Map<string, RecRow>;
let classes: Map<string, ClassRow>;
let locks: string[][];

const tx: AssignmentTx = {
  async lockClasses(ids) {
    locks.push(ids);
  },
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
    return r ? { id: r.id } : null;
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
  async updateClass(id, patch) {
    Object.assign(classes.get(id)!, patch);
  },
};

const sinClases: MatchContext = { classes: [], rooms: [], tolerance: { beforeMin: 30, afterFallbackMin: 180 } };
let ctx: MatchContext;

const deps = (): AssignmentDeps => ({
  run: async (_org, fn) => fn(tx),
  loadContext: async () => ctx,
  now: () => AHORA,
});

function rec(id: string, extra: Partial<RecRow> = {}): RecRow {
  const r: RecRow = {
    id,
    zoomConnectionId: "zc_1",
    zoomMeetingId: "9990000001",
    hostZoomUserId: "u1",
    startTime: new Date("2026-09-15T21:34:00Z"),
    playUrl: `https://zoom.us/rec/share/${id}`,
    classSessionId: null,
    assignmentMode: "auto",
    assignmentState: "pendiente",
    candidateClassIds: [],
    conflictClassSessionId: null,
    assignedBy: null,
    assignedAt: null,
    ...extra,
  };
  recs.set(id, r);
  return r;
}

function clase(id: string, extra: Partial<ClassRow> = {}): ClassRow {
  const c: ClassRow = { id, canceledAt: null, recordingUrl: null, recordingSource: null, ...extra };
  classes.set(id, c);
  return c;
}

const claseEnVentana = (id: string, meetingId: string | null = "9990000001") => ({
  classSessionId: id,
  cohortId: `coh_${id}`,
  startsAt: new Date("2026-09-15T21:30:00Z"),
  endsAt: new Date("2026-09-16T00:30:00Z"),
  meetingId,
  roomId: "aula_1",
});

async function mod() {
  return import("@/server/zoom/assignment");
}

beforeEach(() => {
  recs = new Map();
  classes = new Map();
  locks = [];
  ctx = { ...sinClases, classes: [claseEnVentana("A1")] };
});

describe("applyMatch — la adjudicación automática", () => {
  it("caso feliz: la clase recibe el enlace con origen 'zoom' y la grabación queda asignada", async () => {
    const { applyMatch } = await mod();
    rec("r1");
    clase("A1");
    expect(await applyMatch(ORG, "r1", ctx, deps())).toBe("asignada");
    expect(recs.get("r1")).toMatchObject({ classSessionId: "A1", assignmentState: "asignada", assignedAt: AHORA });
    expect(classes.get("A1")).toMatchObject({ recordingUrl: "https://zoom.us/rec/share/r1", recordingSource: "zoom" });
    expect(locks).toEqual([["A1"]]);
  });

  it("una grabación manual no se toca nunca (SC-005)", async () => {
    const { applyMatch } = await mod();
    rec("r1", { assignmentMode: "manual", assignmentState: "sin_clase" });
    clase("A1");
    expect(await applyMatch(ORG, "r1", ctx, deps())).toBeNull();
    expect(recs.get("r1")!.assignmentState).toBe("sin_clase");
    expect(classes.get("A1")!.recordingUrl).toBeNull();
  });

  it("una auto/asignada es estable: no se mueve aunque ahora coincida otra clase", async () => {
    const { applyMatch } = await mod();
    clase("A1");
    clase("X9", { recordingUrl: "https://zoom.us/rec/share/r1", recordingSource: "zoom" });
    rec("r1", { classSessionId: "X9", assignmentState: "asignada" });
    expect(await applyMatch(ORG, "r1", ctx, deps())).toBeNull();
    expect(recs.get("r1")!.classSessionId).toBe("X9");
  });

  it("clase con enlace MANUAL → conflicto, sin tocar la clase", async () => {
    const { applyMatch } = await mod();
    rec("r1");
    clase("A1", { recordingUrl: "https://drive.example.com/x", recordingSource: "manual" });
    expect(await applyMatch(ORG, "r1", ctx, deps())).toBe("conflicto");
    expect(recs.get("r1")).toMatchObject({ assignmentState: "conflicto", conflictClassSessionId: "A1", classSessionId: null });
    expect(classes.get("A1")).toMatchObject({ recordingUrl: "https://drive.example.com/x", recordingSource: "manual" });
  });

  it("un enlace sin origen (anterior a la 030) cuenta como manual", async () => {
    const { applyMatch } = await mod();
    rec("r1");
    clase("A1", { recordingUrl: "https://drive.example.com/x", recordingSource: null });
    expect(await applyMatch(ORG, "r1", ctx, deps())).toBe("conflicto");
  });

  it("clase que ya tiene OTRA grabación (reunión reiniciada) → conflicto", async () => {
    const { applyMatch } = await mod();
    clase("A1", { recordingUrl: "https://zoom.us/rec/share/r0", recordingSource: "zoom" });
    rec("r0", { classSessionId: "A1", assignmentState: "asignada" });
    rec("r1");
    expect(await applyMatch(ORG, "r1", ctx, deps())).toBe("conflicto");
    expect(classes.get("A1")!.recordingUrl).toBe("https://zoom.us/rec/share/r0");
  });

  it("sin play_url todavía → pendiente (se reintenta la próxima)", async () => {
    const { applyMatch } = await mod();
    rec("r1", { playUrl: null });
    clase("A1");
    expect(await applyMatch(ORG, "r1", ctx, deps())).toBe("pendiente");
    expect(classes.get("A1")!.recordingUrl).toBeNull();
  });

  it("ninguna → sin_clase con candidatas vacías; ambigua → candidatas guardadas", async () => {
    const { applyMatch } = await mod();
    rec("r1", { candidateClassIds: ["viejo"], conflictClassSessionId: "viejo" });
    expect(await applyMatch(ORG, "r1", { ...ctx, classes: [] }, deps())).toBe("sin_clase");
    expect(recs.get("r1")).toMatchObject({ candidateClassIds: [], conflictClassSessionId: null });

    rec("r2", { zoomMeetingId: "1110000001" });
    const ambig: MatchContext = {
      ...ctx,
      classes: [claseEnVentana("A2", null), claseEnVentana("C2", null)],
      rooms: [{ roomId: "aula_1", zoomConnectionId: "zc_1", zoomUserId: "u1", pmiMeetingId: "1110000001" }],
    };
    expect(await applyMatch(ORG, "r2", ambig, deps())).toBe("ambigua");
    expect(recs.get("r2")!.candidateClassIds).toEqual(["A2", "C2"]);
  });

  it("una ambigua/conflicto/sin_clase se re-evalúa y puede asignarse después", async () => {
    const { applyMatch } = await mod();
    rec("r1", { assignmentState: "conflicto", conflictClassSessionId: "A1" });
    clase("A1");
    expect(await applyMatch(ORG, "r1", ctx, deps())).toBe("asignada");
    expect(recs.get("r1")).toMatchObject({ conflictClassSessionId: null, candidateClassIds: [] });
  });
});

describe("liberar al pegar a mano (R6) y limpiar lo propio", () => {
  it("releaseForManualLink pasa la grabación de Zoom de esa clase a manual/sin_clase", async () => {
    const { releaseForManualLink } = await mod();
    clase("A1", { recordingUrl: "https://zoom.us/rec/share/r1", recordingSource: "zoom" });
    rec("r1", { classSessionId: "A1", assignmentState: "asignada" });
    await releaseForManualLink(ORG, "A1", "usr_1", deps());
    expect(recs.get("r1")).toMatchObject({
      classSessionId: null,
      assignmentMode: "manual",
      assignmentState: "sin_clase",
      assignedBy: "usr_1",
    });
  });

  it("releaseForManualLink sin grabación en la clase no hace nada", async () => {
    const { releaseForManualLink } = await mod();
    clase("A1");
    await expect(releaseForManualLink(ORG, "A1", null, deps())).resolves.toBeUndefined();
  });

  it("clearClassIfOwned limpia solo si el enlace es el de ESA grabación y vino de Zoom", async () => {
    const { clearClassIfOwned } = await mod();
    clase("A1", { recordingUrl: "https://drive.example.com/x", recordingSource: "manual" });
    await clearClassIfOwned(tx, rec("r1", { classSessionId: null }), "A1");
    expect(classes.get("A1")!.recordingUrl).toBe("https://drive.example.com/x");

    clase("A2", { recordingUrl: "https://zoom.us/rec/share/r2", recordingSource: "zoom" });
    await clearClassIfOwned(tx, rec("r2"), "A2");
    expect(classes.get("A2")).toMatchObject({ recordingUrl: null, recordingSource: null });
  });
});

describe("US3 — operaciones manuales", () => {
  it("assignManually: no_existe (grabación o clase), clase_cancelada, sin_enlace", async () => {
    const { assignManually } = await mod();
    rec("r1");
    rec("sin", { playUrl: null });
    clase("A1");
    clase("X", { canceledAt: new Date() });
    const o = { replace: false, userId: "usr_1" };
    expect(await assignManually(ORG, "nada", "A1", o, deps())).toEqual({ ok: false, reason: "no_existe" });
    expect(await assignManually(ORG, "r1", "nada", o, deps())).toEqual({ ok: false, reason: "no_existe" });
    expect(await assignManually(ORG, "r1", "X", o, deps())).toEqual({ ok: false, reason: "clase_cancelada" });
    expect(await assignManually(ORG, "sin", "A1", o, deps())).toEqual({ ok: false, reason: "sin_enlace" });
  });

  it("assignManually a clase libre → manual/asignada con quién y cuándo; la clase recibe el enlace", async () => {
    const { assignManually } = await mod();
    rec("r1", { assignmentState: "ambigua", candidateClassIds: ["A1", "C1"] });
    clase("A1");
    expect(await assignManually(ORG, "r1", "A1", { replace: false, userId: "usr_1" }, deps())).toEqual({ ok: true });
    expect(recs.get("r1")).toMatchObject({
      classSessionId: "A1",
      assignmentMode: "manual",
      assignmentState: "asignada",
      candidateClassIds: [],
      assignedBy: "usr_1",
      assignedAt: AHORA,
    });
    expect(classes.get("A1")).toMatchObject({ recordingUrl: "https://zoom.us/rec/share/r1", recordingSource: "zoom" });
  });

  it("requiere_reemplazo: enlace manual u otra grabación, y dice cuál", async () => {
    const { assignManually } = await mod();
    rec("r1");
    clase("M", { recordingUrl: "https://drive.example.com/x", recordingSource: "manual" });
    clase("Z", { recordingUrl: "https://zoom.us/rec/share/r0", recordingSource: "zoom" });
    rec("r0", { classSessionId: "Z", assignmentState: "asignada" });
    const o = { replace: false, userId: "usr_1" };
    expect(await assignManually(ORG, "r1", "M", o, deps())).toEqual({
      ok: false,
      reason: "requiere_reemplazo",
      current: { kind: "manual", recordingId: null },
    });
    expect(await assignManually(ORG, "r1", "Z", o, deps())).toEqual({
      ok: false,
      reason: "requiere_reemplazo",
      current: { kind: "zoom", recordingId: "r0" },
    });
  });

  it("con replace: la otra grabación → manual/sin_clase, la clase anterior de ESTA se limpia, locks en orden", async () => {
    const { assignManually } = await mod();
    clase("Z", { recordingUrl: "https://zoom.us/rec/share/r0", recordingSource: "zoom" });
    rec("r0", { classSessionId: "Z", assignmentState: "asignada" });
    clase("A", { recordingUrl: "https://zoom.us/rec/share/r1", recordingSource: "zoom" });
    rec("r1", { classSessionId: "A", assignmentState: "asignada" });
    expect(await assignManually(ORG, "r1", "Z", { replace: true, userId: "usr_1" }, deps())).toEqual({ ok: true });
    expect(recs.get("r0")).toMatchObject({ classSessionId: null, assignmentMode: "manual", assignmentState: "sin_clase" });
    expect(recs.get("r1")).toMatchObject({ classSessionId: "Z", assignmentMode: "manual", assignmentState: "asignada" });
    expect(classes.get("A")).toMatchObject({ recordingUrl: null, recordingSource: null });
    expect(classes.get("Z")!.recordingUrl).toBe("https://zoom.us/rec/share/r1");
    expect(locks.at(-1)).toEqual(["A", "Z"]);
  });

  it("con replace sobre un enlace manual: lo reemplaza", async () => {
    const { assignManually } = await mod();
    rec("r1");
    clase("M", { recordingUrl: "https://drive.example.com/x", recordingSource: "manual" });
    expect(await assignManually(ORG, "r1", "M", { replace: true, userId: "usr_1" }, deps())).toEqual({ ok: true });
    expect(classes.get("M")).toMatchObject({ recordingUrl: "https://zoom.us/rec/share/r1", recordingSource: "zoom" });
  });

  it("unassign: manual/sin_clase y limpia SOLO lo propio", async () => {
    const { unassign } = await mod();
    clase("A", { recordingUrl: "https://zoom.us/rec/share/r1", recordingSource: "zoom" });
    rec("r1", { classSessionId: "A", assignmentState: "asignada" });
    expect(await unassign(ORG, "r1", "usr_1", deps())).toEqual({ ok: true });
    expect(recs.get("r1")).toMatchObject({ classSessionId: null, assignmentMode: "manual", assignmentState: "sin_clase", assignedBy: "usr_1" });
    expect(classes.get("A")).toMatchObject({ recordingUrl: null, recordingSource: null });
    expect(await unassign(ORG, "nada", "usr_1", deps())).toEqual({ ok: false, reason: "no_existe" });
  });

  it("resetToAuto exige manual; limpia, vuelve a auto y re-evalúa en el acto", async () => {
    const { resetToAuto, unassign } = await mod();
    clase("A1", { recordingUrl: "https://zoom.us/rec/share/r1", recordingSource: "zoom" });
    rec("r1", { classSessionId: "A1", assignmentState: "asignada" });
    expect(await resetToAuto(ORG, "r1", deps())).toEqual({ ok: false, reason: "ya_automatica" });
    await unassign(ORG, "r1", "usr_1", deps());
    expect(await resetToAuto(ORG, "r1", deps())).toEqual({ ok: true });
    expect(recs.get("r1")).toMatchObject({ assignmentMode: "auto", assignmentState: "asignada", classSessionId: "A1", assignedBy: null });
    expect(classes.get("A1")!.recordingUrl).toBe("https://zoom.us/rec/share/r1");
  });

  it("SC-005: tras asignar o desasignar a mano, una sincronización (applyMatch) no cambia nada", async () => {
    const { assignManually, unassign, applyMatch } = await mod();
    clase("A1");
    clase("C2");
    rec("r1");
    rec("r2");
    await assignManually(ORG, "r1", "C2", { replace: false, userId: "usr_1" }, deps());
    await unassign(ORG, "r2", "usr_1", deps());
    const antes = JSON.stringify([...recs.values()]);
    expect(await applyMatch(ORG, "r1", ctx, deps())).toBeNull();
    expect(await applyMatch(ORG, "r2", ctx, deps())).toBeNull();
    expect(JSON.stringify([...recs.values()])).toBe(antes);
  });
});
