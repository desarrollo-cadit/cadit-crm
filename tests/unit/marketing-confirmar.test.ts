import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 045 (T057; FR-006, FR-018, FR-019, FR-020) — Confirmar el envío (todo o
 * nada, en el orden del contrato) y cancelarlo.
 */

const selectQueue: unknown[][] = [];
const inserts: { table: string; values: unknown }[] = [];
const updates: { table: string; set: Record<string, unknown> }[] = [];
const agendadas: (() => void)[] = [];
let ajustes: Record<string, unknown> = {};
let destinatarios: {
  contactId: string;
  name: string;
  firstName: string;
  lastName: string | null;
  email: string;
  vars: Record<string, string>;
}[] = [];
let overCap = false;
let canceladas = 0;

const nombre = (t: unknown) => (t as { __t: string }).__t;

function chain() {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "offset"]) c[m] = () => c;
  (c as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(selectQueue.shift() ?? []).then(resolve);
  return c;
}

vi.mock("@/lib/db", () => {
  const db = {
    select: () => chain(),
    insert: (t: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table: nombre(t), values });
        return Promise.resolve([]);
      },
    }),
    update: (t: unknown) => ({
      set: (set: Record<string, unknown>) => {
        updates.push({ table: nombre(t), set });
        const filas = nombre(t) === "marketingCampaignRecipient" ? Array.from({ length: canceladas }, (_, i) => ({ id: `r${i}` })) : [{ id: "mkc_1" }];
        const resultado = Promise.resolve(filas);
        return { where: () => Object.assign(resultado, { returning: () => resultado }) };
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

vi.mock("@/lib/db/tenant-context", () => ({
  onAfterCommit: (task: () => void) => agendadas.push(task),
}));

vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_BASE_URL: "https://crm.academia.test" }) }));

vi.mock("@/server/marketing/settings", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/marketing/settings")>();
  return {
    ...real,
    getMarketingSettings: async () => ({ ...real.AJUSTES_VACIOS, ...ajustes }),
    m365Configurado: () => true,
  };
});

vi.mock("@/server/marketing/audiences", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/marketing/audiences")>();
  return {
    ...real,
    destinatariosDeAudiencia: async () => ({
      recipients: destinatarios,
      excluded: { prueba: 0, baja: 0, archivado: 0, sin_correo: 0, duplicado: 0 },
      count: destinatarios.length,
      overCap,
    }),
  };
});

const corridas: string[] = [];
vi.mock("@/server/marketing/runner", () => ({
  runCampaign: async (_org: string, id: string) => {
    corridas.push(id);
  },
}));
vi.mock("@/server/marketing/send", () => ({ enviarCorreoDeMarketing: async () => ({ ok: true }) }));
vi.mock("@/server/marketing/images", () => ({
  urlPublicaDeImagen: (t: string) => `https://x/${t}`,
  borrarImagenesDeCampana: async () => {},
}));
vi.mock("@/server/branding", () => ({ getBranding: async () => ({ name: "Academia", accent: "#3f5972" }) }));

const LISTO = {
  senderEmail: "novedades@academia.test",
  senderName: "Academia Novedades",
  footerAddress: "Av. Siempre Viva 742",
  footerContact: "hola@academia.test",
  verifiedSender: "novedades@academia.test",
};

const fila = (over: Record<string, unknown> = {}) => ({
  id: "mkc_1",
  name: "Octubre",
  subject: "Hola {{nombre|colega}}",
  body: {
    v: 1,
    blocks: [
      { type: "paragraph", text: "Mirá [esto](https://a.test) y [aquello](https://b.test)" },
      { type: "button", label: "Ir", url: "https://a.test" },
    ],
  },
  audienceId: "mka_1",
  audienceName: "Perdidos",
  filters: { v: 1, stageIds: ["stg_lost"] },
  status: "borrador",
  recipientCount: null,
  createdAt: new Date(),
  sendConfirmedAt: null,
  finishedAt: null,
  createdByName: null,
  sentByName: null,
  ...over,
});

const persona = (i: number): (typeof destinatarios)[number] => ({
  contactId: `ct_${i}`,
  name: `Persona ${i}`,
  firstName: `Persona${i}`,
  lastName: i % 2 ? "Pérez" : null,
  email: `p${i}@x.test`,
  vars: i === 1 ? { curso_de_interes: "Revit" } : {},
});

const sesion = { organizationId: "org_1", userId: "usr_1" };

beforeEach(() => {
  selectQueue.length = 0;
  inserts.length = 0;
  updates.length = 0;
  agendadas.length = 0;
  corridas.length = 0;
  ajustes = { ...LISTO };
  destinatarios = [persona(1), persona(2)];
  overCap = false;
  canceladas = 0;
});

describe("confirmarEnvio — validaciones en orden", () => {
  it("not_found", async () => {
    const { confirmarEnvio } = await import("@/server/marketing/campaigns");
    expect(await confirmarEnvio(sesion, "mkc_x", 2)).toMatchObject({ ok: false, code: "not_found" });
  });

  it("campana_no_editable antes que el buzón", async () => {
    ajustes = {};
    selectQueue.push([fila({ status: "enviando" })]);
    const { confirmarEnvio } = await import("@/server/marketing/campaigns");
    expect(await confirmarEnvio(sesion, "mkc_1", 2)).toMatchObject({ ok: false, code: "campana_no_editable" });
  });

  it("buzon_no_listo con `fields` de lo que falta, antes que el contenido", async () => {
    ajustes = { ...LISTO, verifiedSender: null };
    selectQueue.push([fila({ subject: "" })]);
    const { confirmarEnvio } = await import("@/server/marketing/campaigns");
    const r = await confirmarEnvio(sesion, "mkc_1", 2);
    expect(r).toMatchObject({ ok: false, code: "buzon_no_listo", fields: [{ path: "buzon_sin_verificar" }] });
  });

  it.each([
    ["sin asunto", { subject: "  " }],
    ["sin bloques", { body: { v: 1, blocks: [] } }],
    ["sin audiencia", { filters: null }],
  ])("contenido_incompleto %s", async (_c, over) => {
    selectQueue.push([fila(over)]);
    const { confirmarEnvio } = await import("@/server/marketing/campaigns");
    expect(await confirmarEnvio(sesion, "mkc_1", 2)).toMatchObject({ ok: false, code: "contenido_incompleto" });
  });

  it("revalida el cuerpo guardado", async () => {
    selectQueue.push([fila({ body: { v: 1, blocks: [{ type: "image", imageId: "mki_ajena", alt: "x" }] } })], []);
    const { confirmarEnvio } = await import("@/server/marketing/campaigns");
    expect(await confirmarEnvio(sesion, "mkc_1", 2)).toMatchObject({ ok: false, code: "imagen_ajena" });
  });

  it("audiencia_vacia", async () => {
    destinatarios = [];
    selectQueue.push([fila()], []);
    const { confirmarEnvio } = await import("@/server/marketing/campaigns");
    expect(await confirmarEnvio(sesion, "mkc_1", 0)).toMatchObject({ ok: false, code: "audiencia_vacia" });
  });

  it("tope_superado (> 500)", async () => {
    overCap = true;
    selectQueue.push([fila()], []);
    const { confirmarEnvio } = await import("@/server/marketing/campaigns");
    expect(await confirmarEnvio(sesion, "mkc_1", 2)).toMatchObject({ ok: false, code: "tope_superado" });
  });

  it("conteo_cambio con la cantidad nueva en `fields`", async () => {
    selectQueue.push([fila()], []);
    const { confirmarEnvio } = await import("@/server/marketing/campaigns");
    expect(await confirmarEnvio(sesion, "mkc_1", 5)).toMatchObject({
      ok: false,
      code: "conteo_cambio",
      fields: [{ path: "count", message: "2" }],
    });
    expect(updates).toHaveLength(0);
  });

  it("otra_campana_enviando", async () => {
    selectQueue.push([fila()], [], [{ id: "mkc_otra" }]);
    const { confirmarEnvio } = await import("@/server/marketing/campaigns");
    expect(await confirmarEnvio(sesion, "mkc_1", 2)).toMatchObject({ ok: false, code: "otra_campana_enviando" });
    expect(updates).toHaveLength(0);
  });
});

describe("confirmarEnvio — éxito", () => {
  it("congela, inserta destinatarios y enlaces, pasa a enviando y agenda el ejecutor DESPUÉS del commit", async () => {
    selectQueue.push([fila()], [], []);
    const { confirmarEnvio } = await import("@/server/marketing/campaigns");
    const r = await confirmarEnvio(sesion, "mkc_1", 2);
    expect(r).toEqual({ ok: true, campaignId: "mkc_1", recipientCount: 2 });

    const campana = updates.find((u) => u.table === "marketingCampaign")!;
    expect(campana.set).toMatchObject({
      status: "enviando",
      filters: { v: 1, stageIds: ["stg_lost"] },
      senderEmail: "novedades@academia.test",
      senderName: "Academia Novedades",
      footer: { address: "Av. Siempre Viva 742", contact: "hola@academia.test" },
      sentBy: "usr_1",
      recipientCount: 2,
    });
    expect(campana.set.sendConfirmedAt).toBeInstanceOf(Date);

    const dest = inserts.find((i) => i.table === "marketingCampaignRecipient")!.values as Record<string, unknown>[];
    expect(dest).toHaveLength(2);
    expect(dest[0]).toMatchObject({
      organizationId: "org_1",
      campaignId: "mkc_1",
      contactId: "ct_1",
      email: "p1@x.test",
      firstName: "Persona1",
      lastName: "Pérez",
      vars: { curso_de_interes: "Revit" },
      position: 0,
      status: "pendiente",
    });
    expect(dest[1]).toMatchObject({ position: 1, lastName: null });

    const enlaces = inserts.find((i) => i.table === "marketingCampaignLink")!.values as Record<string, unknown>[];
    expect(enlaces.map((e) => [e.url, e.position])).toEqual([
      ["https://a.test/", 0],
      ["https://b.test/", 1],
    ]);

    expect(corridas).toEqual([]);
    expect(agendadas).toHaveLength(1);
    agendadas[0]!();
    await Promise.resolve();
    expect(corridas).toEqual(["mkc_1"]);
  });
});

describe("cancelarCampana", () => {
  it("pasa a cancelada y las pendientes a cancelado, en la misma transacción", async () => {
    canceladas = 7;
    selectQueue.push([{ status: "enviando" }]);
    const { cancelarCampana } = await import("@/server/marketing/campaigns");
    expect(await cancelarCampana(sesion, "mkc_1")).toEqual({ ok: true, cancelled: 7 });
    const campana = updates.find((u) => u.table === "marketingCampaign")!;
    expect(campana.set).toMatchObject({ status: "cancelada", cancelledBy: "usr_1" });
    expect(campana.set.finishedAt).toBeInstanceOf(Date);
    const dest = updates.find((u) => u.table === "marketingCampaignRecipient")!;
    expect(dest.set).toMatchObject({ status: "cancelado" });
  });

  it.each(["borrador", "enviada", "cancelada"])("%s → `no_esta_enviando`", async (status) => {
    selectQueue.push([{ status }]);
    const { cancelarCampana } = await import("@/server/marketing/campaigns");
    expect(await cancelarCampana(sesion, "mkc_1")).toMatchObject({ ok: false, code: "no_esta_enviando" });
    expect(updates).toHaveLength(0);
  });

  it("inexistente → not_found", async () => {
    const { cancelarCampana } = await import("@/server/marketing/campaigns");
    expect(await cancelarCampana(sesion, "mkc_x")).toMatchObject({ ok: false, code: "not_found" });
  });
});
