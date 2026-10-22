import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 045 (T036; FR-006, FR-009, FR-010; US2-1…US2-4) — Borrador, vista previa y
 * envío de prueba de una campaña, con dobles de base y de los módulos vecinos.
 */

const selectQueue: unknown[][] = [];
const inserts: { values: Record<string, unknown> }[] = [];
const updates: { set: Record<string, unknown> }[] = [];
const deletes: unknown[] = [];
const enviados: Record<string, unknown>[] = [];
const imagenesBorradas: string[] = [];
let ajustes: Record<string, unknown> = {};
let m365 = true;
let destinatarios: { contactId: string; name: string; firstName: string; lastName: string | null; email: string; vars: Record<string, string> }[] = [];
let resultadoEnvio: { ok: boolean; message?: string } = { ok: true };

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
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ values });
        return Promise.resolve([values]);
      },
    }),
    update: () => ({
      set: (set: Record<string, unknown>) => {
        updates.push({ set });
        return { where: () => Promise.resolve([]) };
      },
    }),
    delete: (t: unknown) => {
      deletes.push(t);
      return { where: () => Promise.resolve([]) };
    },
  };
  return {
    getDb: () => db,
    getRootDb: () => db,
    schema: new Proxy({}, { get: (_t, tn) => new Proxy({}, { get: (_x, c) => `${String(tn)}.${String(c)}` }) }),
  };
});

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ APP_BASE_URL: "https://crm.academia.test", M365_SENDER: "cursos@academia.test" }),
}));

vi.mock("@/server/marketing/settings", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/marketing/settings")>();
  return {
    ...real,
    getMarketingSettings: async () => ({ ...real.AJUSTES_VACIOS, ...ajustes }),
    m365Configurado: () => m365,
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
      overCap: false,
    }),
  };
});

vi.mock("@/server/marketing/send", () => ({
  enviarCorreoDeMarketing: async (input: Record<string, unknown>) => {
    enviados.push(input);
    return resultadoEnvio.ok
      ? { ok: true }
      : { ok: false, code: "send_failed", message: resultadoEnvio.message ?? "falló" };
  },
}));

vi.mock("@/server/marketing/images", () => ({
  urlPublicaDeImagen: (token: string) => `https://crm.academia.test/api/public/marketing/images/${token}`,
  borrarImagenesDeCampana: async (_org: string, campaignId: string) => {
    imagenesBorradas.push(campaignId);
  },
}));

vi.mock("@/server/branding", () => ({
  getBranding: async () => ({ name: "Academia Test", accent: "#3f5972" }),
}));

const LISTO = {
  senderEmail: "novedades@academia.test",
  senderName: "Academia Novedades",
  footerAddress: "Av. Siempre Viva 742",
  footerContact: "hola@academia.test",
  verifiedSender: "novedades@academia.test",
};

const filaCampana = (over: Record<string, unknown> = {}) => ({
  id: "mkc_1",
  name: "Octubre",
  subject: "Hola {{nombre|colega}}",
  body: { v: 1, blocks: [{ type: "paragraph", text: "Hola {{nombre|colega}}" }] },
  audienceId: "mka_1",
  audienceName: "Perdidos",
  filters: { v: 1 },
  status: "borrador",
  recipientCount: null,
  createdAt: new Date("2026-10-22T10:00:00Z"),
  sendConfirmedAt: null,
  finishedAt: null,
  createdByName: "Mariana",
  sentByName: null,
  ...over,
});

const ana = { contactId: "ct_ana", name: "Ana Pérez", firstName: "Ana", lastName: "Pérez", email: "ana@x.test", vars: {} };
const beto = { contactId: "ct_beto", name: "Beto", firstName: "Beto", lastName: null, email: "beto@x.test", vars: {} };

beforeEach(async () => {
  selectQueue.length = 0;
  inserts.length = 0;
  updates.length = 0;
  deletes.length = 0;
  enviados.length = 0;
  imagenesBorradas.length = 0;
  ajustes = { ...LISTO };
  m365 = true;
  destinatarios = [];
  resultadoEnvio = { ok: true };
  const { resetRateLimit } = await import("@/lib/rate-limit");
  resetRateLimit();
});

describe("crearCampana", () => {
  it("nace en borrador y copia los filtros de la audiencia elegida", async () => {
    selectQueue.push([{ filters: { v: 1, stageIds: ["stg_lost"] } }], [filaCampana()], []);
    const { crearCampana } = await import("@/server/marketing/campaigns");
    const r = await crearCampana("org_1", "usr_1", { name: "Octubre", audienceId: "mka_1" });
    expect(r.ok).toBe(true);
    expect(inserts[0]!.values).toMatchObject({
      organizationId: "org_1",
      name: "Octubre",
      audienceId: "mka_1",
      filters: { v: 1, stageIds: ["stg_lost"] },
      status: "borrador",
      createdBy: "usr_1",
    });
  });

  it("audiencia inexistente → `audience_not_found`", async () => {
    selectQueue.push([]);
    const { crearCampana } = await import("@/server/marketing/campaigns");
    expect(await crearCampana("org_1", "usr_1", { name: "x", audienceId: "mka_x" })).toMatchObject({
      ok: false,
      code: "audience_not_found",
    });
    expect(inserts).toHaveLength(0);
  });
});

describe("solo el borrador se edita o se borra", () => {
  it("actualizar una enviada → `campana_no_editable`", async () => {
    selectQueue.push([filaCampana({ status: "enviando" })]);
    const { actualizarCampana } = await import("@/server/marketing/campaigns");
    expect(await actualizarCampana("org_1", "mkc_1", { name: "otro" })).toMatchObject({
      ok: false,
      code: "campana_no_editable",
    });
    expect(updates).toHaveLength(0);
  });

  it("borrar una cancelada → `campana_no_editable`", async () => {
    selectQueue.push([filaCampana({ status: "cancelada" })]);
    const { borrarCampana } = await import("@/server/marketing/campaigns");
    expect(await borrarCampana("org_1", "mkc_1")).toMatchObject({ ok: false, code: "campana_no_editable" });
    expect(deletes).toHaveLength(0);
  });

  it("borrar un borrador borra ANTES los archivos de sus imágenes", async () => {
    selectQueue.push([filaCampana()]);
    const { borrarCampana } = await import("@/server/marketing/campaigns");
    expect(await borrarCampana("org_1", "mkc_1")).toEqual({ ok: true });
    expect(imagenesBorradas).toEqual(["mkc_1"]);
    expect(deletes).toHaveLength(1);
  });

  it("un cuerpo inválido se rechaza con su código (imagen ajena)", async () => {
    selectQueue.push([filaCampana()], []);
    const { actualizarCampana } = await import("@/server/marketing/campaigns");
    const r = await actualizarCampana("org_1", "mkc_1", {
      body: { v: 1, blocks: [{ type: "image", imageId: "mki_otra", alt: "x" }] },
    });
    expect(r).toMatchObject({ ok: false, code: "imagen_ajena" });
  });
});

describe("obtenerCampana — el DTO", () => {
  it("trae `readOnly` y qué falta para enviar", async () => {
    ajustes = {};
    m365 = false;
    selectQueue.push([filaCampana({ subject: "", body: { v: 1, blocks: [] }, filters: null })], []);
    const { obtenerCampana } = await import("@/server/marketing/campaigns");
    const dto = await obtenerCampana("org_1", "mkc_1");
    expect(dto?.readOnly).toBe(false);
    expect(dto?.readiness).toEqual({
      ok: false,
      missing: ["buzon", "m365", "audiencia", "asunto", "cuerpo"],
      settingsHref: "/settings/marketing",
    });
  });

  it("una enviada es de solo lectura; buzón sin verificar se informa", async () => {
    ajustes = { ...LISTO, verifiedSender: null };
    selectQueue.push([filaCampana({ status: "enviada" })], [{ id: "mki_1", publicToken: "t".repeat(43), sizeBytes: 10 }]);
    const { obtenerCampana } = await import("@/server/marketing/campaigns");
    const dto = await obtenerCampana("org_1", "mkc_1");
    expect(dto?.readOnly).toBe(true);
    expect(dto?.readiness.missing).toEqual(["buzon_sin_verificar"]);
    expect(dto?.images).toEqual([
      { id: "mki_1", url: `https://crm.academia.test/api/public/marketing/images/${"t".repeat(43)}`, sizeBytes: 10 },
    ]);
  });
});

describe("vistaPrevia", () => {
  it("sin contacto pedido usa el primero de la audiencia", async () => {
    destinatarios = [ana, beto];
    selectQueue.push([filaCampana()], []);
    const { vistaPrevia } = await import("@/server/marketing/campaigns");
    const r = await vistaPrevia("org_1", "mkc_1", {});
    expect(r).toMatchObject({ ok: true, preview: { contact: { id: "ct_ana", email: "ana@x.test" }, subject: "Hola Ana" } });
    if (r.ok) expect(r.preview.html).toContain("Hola Ana");
  });

  it("con un contacto pedido lo usa; si no está en la audiencia → `contact_not_in_audience`", async () => {
    destinatarios = [ana, beto];
    selectQueue.push([filaCampana()], []);
    const { vistaPrevia } = await import("@/server/marketing/campaigns");
    const r = await vistaPrevia("org_1", "mkc_1", { contactId: "ct_beto" });
    expect(r).toMatchObject({ ok: true, preview: { subject: "Hola Beto" } });
    selectQueue.push([filaCampana()], []);
    expect(await vistaPrevia("org_1", "mkc_1", { contactId: "ct_x" })).toMatchObject({
      ok: false,
      code: "contact_not_in_audience",
    });
  });

  it("audiencia vacía → usa los textos alternativos", async () => {
    selectQueue.push([filaCampana()], []);
    const { vistaPrevia } = await import("@/server/marketing/campaigns");
    const r = await vistaPrevia("org_1", "mkc_1", {});
    expect(r).toMatchObject({ ok: true, preview: { contact: null, subject: "Hola colega" } });
  });

  it("previsualiza lo que se está editando sin guardar", async () => {
    destinatarios = [ana];
    selectQueue.push([filaCampana()], []);
    const { vistaPrevia } = await import("@/server/marketing/campaigns");
    const r = await vistaPrevia("org_1", "mkc_1", { subject: "Nuevo para {{nombre}}" });
    expect(r).toMatchObject({ ok: true, preview: { subject: "Nuevo para Ana" } });
    expect(updates).toHaveLength(0);
  });
});

describe("enviarPrueba", () => {
  const sesion = { organizationId: "org_1", userId: "usr_1" };

  it("manda SOLO al correo de la sesión, con `[PRUEBA] `, desde el buzón de marketing; no toca nada más", async () => {
    destinatarios = [ana];
    selectQueue.push([filaCampana()], [], [{ email: "mariana@academia.test" }]);
    const { enviarPrueba } = await import("@/server/marketing/campaigns");
    const r = await enviarPrueba(sesion, "mkc_1", {});
    expect(r).toEqual({ ok: true, sentTo: "mariana@academia.test" });
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({
      to: "mariana@academia.test",
      sender: "novedades@academia.test",
      fromName: "Academia Novedades",
      subject: "[PRUEBA] Hola Ana",
    });
    expect(String(enviados[0]!.html)).toContain("https://crm.academia.test/baja/prueba");
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("buzón no listo → `buzon_no_listo` con lo que falta, sin enviar", async () => {
    ajustes = { ...LISTO, verifiedSender: null };
    selectQueue.push([filaCampana()], []);
    const { enviarPrueba } = await import("@/server/marketing/campaigns");
    expect(await enviarPrueba(sesion, "mkc_1", {})).toEqual({
      ok: false,
      code: "buzon_no_listo",
      missing: ["buzon_sin_verificar"],
    });
    expect(enviados).toHaveLength(0);
  });

  it("un rechazo de Graph → `envio_fallido` con el mensaje", async () => {
    resultadoEnvio = { ok: false, message: "Buzón inexistente" };
    selectQueue.push([filaCampana()], [], [{ email: "mariana@academia.test" }]);
    const { enviarPrueba } = await import("@/server/marketing/campaigns");
    expect(await enviarPrueba(sesion, "mkc_1", {})).toMatchObject({
      ok: false,
      code: "envio_fallido",
      message: "Buzón inexistente",
    });
  });

  it("10 pruebas cada 10 minutos por persona; la 11.ª → `too_many_requests`", async () => {
    const { enviarPrueba } = await import("@/server/marketing/campaigns");
    for (let i = 0; i < 10; i++) {
      selectQueue.push([filaCampana()], [], [{ email: "mariana@academia.test" }]);
      expect((await enviarPrueba(sesion, "mkc_1", {})).ok).toBe(true);
    }
    expect(await enviarPrueba(sesion, "mkc_1", {})).toMatchObject({ ok: false, code: "too_many_requests" });
    expect(enviados).toHaveLength(10);
  });
});
