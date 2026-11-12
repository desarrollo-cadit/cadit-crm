import { describe, expect, it } from "vitest";
import {
  cuandoVenceDesde,
  esDiaValido,
  estadoDeRecordatorio,
  estaVencido,
  fechaDeRecordatorio,
  fechaEnElPasado,
  hoyEnZona,
  ordenarRecordatorios,
  recordatorioAccionSchema,
  recordatorioBodySchema,
  type RecordatorioDto,
} from "@/lib/recordatorios";
import {
  armarAvisoRecordatorio,
  recordatorioIdDe,
  recordatorioQueToca,
  sujetoDeRecordatorio,
} from "@/lib/recordatorios-aviso";
import { claveDeAviso, columnasDelSujeto, sujetoDeRegistro } from "@/lib/staff-notices";
import { eventosDelHilo, mezclarHilo } from "@/lib/eventos-del-hilo";

const TZ = "America/Montevideo"; // UTC-3, sin horario de verano
/** Lunes 26/10/2026, 10:00 en Montevideo. */
const AHORA = new Date("2026-10-26T13:00:00Z");

describe("recordatorios — reglas puras", () => {
  it("el body pide motivo (1..500) y un día real YYYY-MM-DD", () => {
    expect(recordatorioBodySchema.safeParse({ reason: " Llamarlo ", dueDate: "2026-10-30" }).success).toBe(true);
    expect(recordatorioBodySchema.safeParse({ reason: "  ", dueDate: "2026-10-30" }).success).toBe(false);
    expect(recordatorioBodySchema.safeParse({ reason: "x".repeat(501), dueDate: "2026-10-30" }).success).toBe(false);
    expect(recordatorioBodySchema.safeParse({ reason: "ok", dueDate: "2026-02-30" }).success).toBe(false);
    expect(recordatorioBodySchema.safeParse({ reason: "ok", dueDate: "30/10/2026" }).success).toBe(false);
    expect(esDiaValido("2028-02-29")).toBe(true);
    expect(esDiaValido("2026-02-29")).toBe(false);
  });

  it("la acción es hecho, reabrir o eliminar", () => {
    for (const action of ["hecho", "reabrir", "eliminar"]) {
      expect(recordatorioAccionSchema.safeParse({ action }).success).toBe(true);
    }
    expect(recordatorioAccionSchema.safeParse({ action: "borrar" }).success).toBe(false);
  });

  it("«hoy» es el día de la organización, no el de UTC", () => {
    // 01:00 UTC del 27/10 sigue siendo 26/10 en Montevideo.
    expect(hoyEnZona(new Date("2026-10-27T01:00:00Z"), TZ)).toBe("2026-10-26");
    expect(hoyEnZona(AHORA, TZ)).toBe("2026-10-26");
  });

  it("no se agenda en el pasado, pero hoy sí", () => {
    expect(fechaEnElPasado("2026-10-25", AHORA, TZ)).toBe(true);
    expect(fechaEnElPasado("2026-10-26", AHORA, TZ)).toBe(false);
    expect(fechaEnElPasado("2026-10-27", AHORA, TZ)).toBe(false);
  });

  it("vencido = el día llegó (hoy incluido); el estado distingue vencido, hoy y próximo", () => {
    expect(estaVencido("2026-10-26", AHORA, TZ)).toBe(true);
    expect(estaVencido("2026-10-27", AHORA, TZ)).toBe(false);
    expect(estadoDeRecordatorio("2026-10-20", AHORA, TZ)).toBe("vencido");
    expect(estadoDeRecordatorio("2026-10-26", AHORA, TZ)).toBe("hoy");
    expect(estadoDeRecordatorio("2026-11-01", AHORA, TZ)).toBe("proximo");
  });

  it("dice cuándo vence en palabras", () => {
    expect(cuandoVenceDesde("2026-10-26", "2026-10-26")).toBe("vence hoy");
    expect(cuandoVenceDesde("2026-10-25", "2026-10-26")).toBe("venció ayer");
    expect(cuandoVenceDesde("2026-10-23", "2026-10-26")).toBe("venció hace 3 días");
    expect(cuandoVenceDesde("2026-10-27", "2026-10-26")).toBe("vence mañana");
    expect(cuandoVenceDesde("2026-10-30", "2026-10-26")).toBe("vence en 4 días");
    expect(fechaDeRecordatorio("2026-11-02")).toBe("02/11/2026");
  });

  it("ordena: pendientes por fecha (el más atrasado arriba), después los hechos, el último resuelto arriba", () => {
    const r = (id: string, dueDate: string, doneAt: string | null, createdAt = "2026-10-01T10:00:00Z") => ({
      id,
      dueDate,
      doneAt,
      createdAt,
    });
    const orden = ordenarRecordatorios([
      r("hecho_viejo", "2026-10-10", "2026-10-11T10:00:00Z"),
      r("proximo", "2026-11-01", null),
      r("hecho_nuevo", "2026-10-12", "2026-10-20T10:00:00Z"),
      r("atrasado", "2026-10-20", null),
    ]).map((x) => x.id);
    expect(orden).toEqual(["atrasado", "proximo", "hecho_nuevo", "hecho_viejo"]);
  });
});

describe("recordatorio_contacto — el aviso del día", () => {
  const rec = (over: Partial<{ dueDate: string; doneAt: Date | null; createdAt: Date }> = {}) => ({
    dueDate: "2026-10-26",
    doneAt: null,
    createdAt: new Date("2026-10-20T15:00:00Z"),
    ...over,
  });
  const a = (iso: string) => new Date(iso);

  it("sale el día que vence, desde las 08:00 de la organización", () => {
    // 07:59 en Montevideo (10:59Z) todavía no; 08:00 (11:00Z) sí.
    expect(recordatorioQueToca(rec(), a("2026-10-26T10:59:00Z"), TZ)).toBe(false);
    expect(recordatorioQueToca(rec(), a("2026-10-26T11:00:00Z"), TZ)).toBe(true);
    // Un servidor apagado a las 8 se pone al día durante el día.
    expect(recordatorioQueToca(rec(), a("2026-10-26T20:00:00Z"), TZ)).toBe(true);
  });

  it("ni antes ni después del día, ni si ya está resuelto", () => {
    expect(recordatorioQueToca(rec({ dueDate: "2026-10-27" }), AHORA, TZ)).toBe(false);
    expect(recordatorioQueToca(rec({ dueDate: "2026-10-25" }), AHORA, TZ)).toBe(false);
    expect(recordatorioQueToca(rec({ doneAt: a("2026-10-26T12:00:00Z") }), AHORA, TZ)).toBe(false);
  });

  it("uno agendado el mismo día pasadas las 08:00 no se manda: quien lo creó ya lo sabe", () => {
    expect(recordatorioQueToca(rec({ createdAt: a("2026-10-26T12:00:00Z") }), a("2026-10-26T13:00:00Z"), TZ)).toBe(false);
    // Agendado ese día de madrugada, sí.
    expect(recordatorioQueToca(rec({ createdAt: a("2026-10-26T09:00:00Z") }), a("2026-10-26T13:00:00Z"), TZ)).toBe(true);
  });

  it("la llave es por recordatorio y día, cuelga del contacto y se lee de vuelta", () => {
    const s = sujetoDeRecordatorio("ct_1", "crem_9", "2026-10-26");
    expect(claveDeAviso(s)).toBe("recordatorio_contacto:ct_1:crem_9:2026-10-26");
    expect(columnasDelSujeto(s)).toMatchObject({ contactId: "ct_1", cohortId: null, enrollmentId: null });
    expect(recordatorioIdDe(s)).toBe("crem_9");
    expect(
      sujetoDeRegistro({
        kind: "recordatorio_contacto",
        dedupKey: claveDeAviso(s),
        contactId: "ct_1",
        cohortId: null,
        enrollmentId: null,
        paymentId: null,
        periodKey: null,
      })
    ).toEqual(s);
    // Mover la fecha cambia la llave: el aviso del día nuevo no queda tapado por el viejo.
    expect(claveDeAviso(sujetoDeRecordatorio("ct_1", "crem_9", "2026-10-28"))).not.toBe(claveDeAviso(s));
  });

  it("el correo escapa el HTML, lleva motivo, fecha y el enlace al seguimiento", () => {
    const { subject, html } = armarAvisoRecordatorio({
      contacto: "Ana <Pérez>",
      contactId: "ct_1",
      motivo: "Llamar a las 10 & confirmar\nsegunda línea",
      dueDate: "2026-10-26",
      baseUrl: "https://crm.example.com/",
    });
    expect(subject).toBe("Recordatorio para hoy: Ana <Pérez>");
    expect(html).toContain("Ana &lt;Pérez&gt;");
    expect(html).toContain("Llamar a las 10 &amp; confirmar<br>segunda línea");
    expect(html).toContain("26/10/2026");
    expect(html).toContain("https://crm.example.com/contacts/ct_1/legajo?tab=seguimiento");
    expect(html).not.toContain("<Pérez>");
  });
});

describe("eventos del hilo del chat", () => {
  const dto = (over: Partial<RecordatorioDto> = {}): RecordatorioDto => ({
    id: "crem_1",
    contactId: "ct_1",
    reason: "Llamarla",
    dueDate: "2026-10-30",
    createdAt: "2026-10-26T12:00:00Z",
    authorName: "Lía",
    doneAt: null,
    doneByName: null,
    ...over,
  });

  it("notas, contactos y recordatorios salen en orden cronológico, con el autor", () => {
    const eventos = eventosDelHilo(
      [
        { id: "a2", at: "2026-10-26T14:00:00Z", kind: "contacto_whatsapp", body: null, authorName: "Gus" },
        { id: "a1", at: "2026-10-26T11:00:00Z", kind: "nota", body: "Pidió precio", authorName: "Lía" },
      ],
      [dto({ doneAt: "2026-10-27T09:00:00Z", doneByName: "Gus" })]
    );
    expect(eventos.map((e) => e.texto)).toEqual([
      "Lía dejó una nota: Pidió precio",
      "Lía agendó un recordatorio para el 30/10/2026: Llamarla",
      "Gus le escribió por WhatsApp",
      "Gus resolvió el recordatorio: Llamarla",
    ]);
  });

  it("`since` deja solo lo posterior y una cuenta eliminada no rompe la frase", () => {
    const eventos = eventosDelHilo(
      [{ id: "a1", at: "2026-10-26T11:00:00Z", kind: "contacto_email", body: null, authorName: null }],
      [],
      new Date("2026-10-26T10:00:00Z")
    );
    expect(eventos[0]?.texto).toBe("Alguien del equipo le escribió por correo");
    expect(eventosDelHilo([{ id: "a1", at: "2026-10-26T11:00:00Z", kind: "nota", body: "x", authorName: null }], [], new Date("2026-10-26T11:00:00Z"))).toEqual([]);
  });

  it("se mezclan con los mensajes por instante; a igual instante, el mensaje primero", () => {
    const mensajes = [
      { id: "m1", createdAt: "2026-10-26T10:00:00Z" },
      { id: "m2", createdAt: "2026-10-26T12:00:00Z" },
    ];
    const eventos = [
      { id: "e1", at: "2026-10-26T12:00:00Z", texto: "a" },
      { id: "e0", at: "2026-10-26T11:00:00Z", texto: "b" },
    ];
    const orden = mezclarHilo(mensajes, eventos).map((i) => (i.tipo === "mensaje" ? i.mensaje.id : i.evento.id));
    expect(orden).toEqual(["m1", "e0", "m2", "e1"]);
  });
});
