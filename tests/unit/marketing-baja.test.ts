import { beforeEach, describe, expect, it, vi } from "vitest";
import { derivarClave, firmarBaja, firmarClic } from "@/lib/marketing/link-token";

/**
 * 045 (T079; FR-012, FR-013, FR-015; DV-010, DV-011; US4-1, US4-2, US4-5) —
 * La baja de marketing: el enlace firmado, registrarla (idempotente), la baja
 * activa por contacto o por correo y revertirla sin borrar el historial.
 */

const KEY = Buffer.alloc(32, 5).toString("base64");
const k = derivarClave(KEY);

const selectQueue: unknown[][] = [];
const inserts: { table: string; values: Record<string, unknown>; conflicto: boolean }[] = [];
const updates: { table: string; set: Record<string, unknown> }[] = [];
let selects = 0;

const nombre = (t: unknown) => (t as { __t: string }).__t;

function chain() {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) c[m] = () => c;
  (c as { then: unknown }).then = (resolve: (v: unknown) => void) => {
    selects++;
    return Promise.resolve(selectQueue.shift() ?? []).then(resolve);
  };
  return c;
}

vi.mock("@/lib/db", () => {
  const db = {
    select: () => chain(),
    insert: (t: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const registro = { table: nombre(t), values, conflicto: false };
        inserts.push(registro);
        const p = Promise.resolve([]);
        return Object.assign(p, {
          onConflictDoNothing: () => {
            registro.conflicto = true;
            return Promise.resolve([]);
          },
        });
      },
    }),
    update: (t: unknown) => ({
      set: (set: Record<string, unknown>) => {
        updates.push({ table: nombre(t), set });
        return { where: () => Promise.resolve([]) };
      },
    }),
  };
  return {
    getDb: () => db,
    getRootDb: () => db,
    schema: new Proxy(
      {},
      {
        get: (_t, tn) =>
          new Proxy({ __t: String(tn) }, { get: (o, c) => (c === "__t" ? o.__t : `${String(tn)}.${String(c)}`) }),
      }
    ),
  };
});
vi.mock("@/lib/env", () => ({ getEnv: () => ({ ENCRYPTION_KEY: KEY, APP_BASE_URL: "https://crm.test" }) }));

const destinatario = { id: "mkr_1", email: "ana@x.test", contactId: "ct_1", campaignId: "mkc_1" };

beforeEach(() => {
  selectQueue.length = 0;
  inserts.length = 0;
  updates.length = 0;
  selects = 0;
});

describe("estadoDeEnlaceDeBaja", () => {
  it("`prueba` → prueba, sin tocar la base", async () => {
    const { estadoDeEnlaceDeBaja } = await import("@/server/marketing/unsubscribe");
    expect(await estadoDeEnlaceDeBaja("org_1", "prueba")).toBe("prueba");
    expect(selects).toBe(0);
  });

  it("firma alterada, token de clic, destinatario inexistente u otra organización → `invalido`, todos iguales", async () => {
    const { estadoDeEnlaceDeBaja } = await import("@/server/marketing/unsubscribe");
    const token = firmarBaja(k, "mkr_1");
    expect(await estadoDeEnlaceDeBaja("org_1", token.slice(0, -1) + "x")).toBe("invalido");
    expect(await estadoDeEnlaceDeBaja("org_1", firmarClic(k, "mkr_1"))).toBe("invalido");
    selectQueue.push([]); // inexistente (o de otra organización: RLS + scoped no lo devuelven)
    expect(await estadoDeEnlaceDeBaja("org_1", token)).toBe("invalido");
  });

  it("válido sin baja → `valido`; con baja activa → `ya_dado_de_baja`", async () => {
    const { estadoDeEnlaceDeBaja } = await import("@/server/marketing/unsubscribe");
    const token = firmarBaja(k, "mkr_1");
    selectQueue.push([destinatario], []);
    expect(await estadoDeEnlaceDeBaja("org_1", token)).toBe("valido");
    selectQueue.push([destinatario], [{ id: "mku_1" }]);
    expect(await estadoDeEnlaceDeBaja("org_1", token)).toBe("ya_dado_de_baja");
  });

  it("devuelve solo el estado: nunca correo ni nombre", async () => {
    const { estadoDeEnlaceDeBaja } = await import("@/server/marketing/unsubscribe");
    selectQueue.push([destinatario], []);
    const r = await estadoDeEnlaceDeBaja("org_1", firmarBaja(k, "mkr_1"));
    expect(typeof r).toBe("string");
    expect(String(r)).not.toContain("ana");
  });
});

describe("registrarBaja", () => {
  it("inserta la baja (contacto, correo normalizado, campaña, destinatario) con `on conflict do nothing`", async () => {
    selectQueue.push([{ ...destinatario, email: " Ana@X.test " }]);
    const { registrarBaja } = await import("@/server/marketing/unsubscribe");
    expect(await registrarBaja("org_1", firmarBaja(k, "mkr_1"))).toEqual({ ok: true });
    const baja = inserts.find((i) => i.table === "marketingUnsubscribe")!;
    expect(baja.values).toMatchObject({
      organizationId: "org_1",
      contactId: "ct_1",
      email: "ana@x.test",
      campaignId: "mkc_1",
      recipientId: "mkr_1",
    });
    expect(baja.conflicto).toBe(true);
    const marca = updates.find((u) => u.table === "marketingCampaignRecipient")!;
    expect(marca.set.unsubscribedAt).toBeInstanceOf(Date);
  });

  it("es idempotente: registrar dos veces responde lo mismo", async () => {
    const { registrarBaja } = await import("@/server/marketing/unsubscribe");
    selectQueue.push([destinatario]);
    expect(await registrarBaja("org_1", firmarBaja(k, "mkr_1"))).toEqual({ ok: true });
    selectQueue.push([destinatario]);
    expect(await registrarBaja("org_1", firmarBaja(k, "mkr_1"))).toEqual({ ok: true });
  });

  it("token inválido o de prueba → no registra nada", async () => {
    const { registrarBaja } = await import("@/server/marketing/unsubscribe");
    expect(await registrarBaja("org_1", "prueba")).toEqual({ ok: false });
    expect(await registrarBaja("org_1", "mkr_1.no")).toEqual({ ok: false });
    selectQueue.push([]);
    expect(await registrarBaja("org_1", firmarBaja(k, "mkr_9"))).toEqual({ ok: false });
    expect(inserts).toHaveLength(0);
  });
});

describe("bajaActiva", () => {
  it("por contacto O por correo normalizado", async () => {
    const { bajaActiva } = await import("@/server/marketing/unsubscribe");
    selectQueue.push([{ id: "mku_1" }]);
    expect(await bajaActiva("org_1", { contactId: "ct_1", email: "x@x.test" })).toBe(true);
    selectQueue.push([]);
    expect(await bajaActiva("org_1", { contactId: "ct_1", email: "x@x.test" })).toBe(false);
  });

  it("sobrevive al borrado del contacto: alcanza con el correo", async () => {
    const { bajaActiva } = await import("@/server/marketing/unsubscribe");
    selectQueue.push([{ id: "mku_1" }]);
    expect(await bajaActiva("org_1", { contactId: null, email: "ANA@x.test" })).toBe(true);
  });

  it("sin contacto ni correo → false sin consultar", async () => {
    const { bajaActiva } = await import("@/server/marketing/unsubscribe");
    expect(await bajaActiva("org_1", { contactId: null, email: null })).toBe(false);
    expect(selects).toBe(0);
  });
});

describe("revertirBaja", () => {
  const sesion = { organizationId: "org_1", userId: "usr_dir" };

  it("marca `reverted_at`/`reverted_by` sin borrar la fila", async () => {
    selectQueue.push([{ email: "ana@x.test" }], [{ id: "mku_1" }]);
    const { revertirBaja } = await import("@/server/marketing/unsubscribe");
    expect(await revertirBaja(sesion, "ct_1")).toEqual({ ok: true });
    const u = updates.find((x) => x.table === "marketingUnsubscribe")!;
    expect(u.set.revertedBy).toBe("usr_dir");
    expect(u.set.revertedAt).toBeInstanceOf(Date);
  });

  it("contacto ajeno o sin baja activa → `not_found`", async () => {
    const { revertirBaja } = await import("@/server/marketing/unsubscribe");
    selectQueue.push([]);
    expect(await revertirBaja(sesion, "ct_x")).toEqual({ ok: false, code: "not_found" });
    selectQueue.push([{ email: "ana@x.test" }], []);
    expect(await revertirBaja(sesion, "ct_1")).toEqual({ ok: false, code: "not_found" });
    expect(updates).toHaveLength(0);
  });
});
