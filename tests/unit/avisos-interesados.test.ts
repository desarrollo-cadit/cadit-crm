import { describe, expect, it } from "vitest";
import {
  armarAvisoInteresado,
  claveDeInteresado,
  destinatariosDeInteresados,
  sujetoDeInteresado,
  type InteresadoNuevo,
} from "@/lib/lead-notices";
import { claveDeAviso, columnasDelSujeto, STAFF_NOTICE_KINDS, sujetoDeRegistro } from "@/lib/staff-notices";

/**
 * Avisos de nuevos interesados: cada vez que alguien deja sus datos en un
 * formulario público (de un curso, de una campaña o de un taller) le llega un
 * correo a quien la organización configure en Ajustes › Áreas › Nuevos
 * interesados. Acá se prueban las reglas puras: la llave, los destinatarios y
 * el contenido del correo.
 */

const base: InteresadoNuevo = {
  contactId: "ct_1",
  nombre: "Ana",
  apellido: "Pérez",
  telefono: "59899123456",
  email: "ana@example.com",
  mensaje: "Quiero saber los horarios <b>de noche</b>",
  interes: { tipo: "curso", nombre: "Revit", inicio: null, horario: null, cohorte: null },
  origen: "formulario:Revit",
  contactoNuevo: true,
  recibidoEn: "2026-10-20T15:30:00.000Z",
};

describe("la llave del aviso (una por persona, interés y día)", () => {
  it("cambia con el interés y con el día, no con la hora", () => {
    const a = claveDeInteresado({ contactId: "ct_1", ref: "curso:crs_1", recibidoEn: new Date("2026-10-20T10:00:00Z") });
    const b = claveDeInteresado({ contactId: "ct_1", ref: "curso:crs_1", recibidoEn: new Date("2026-10-20T22:00:00Z") });
    const otroCurso = claveDeInteresado({ contactId: "ct_1", ref: "curso:crs_2", recibidoEn: new Date("2026-10-20T10:00:00Z") });
    const otroDia = claveDeInteresado({ contactId: "ct_1", ref: "curso:crs_1", recibidoEn: new Date("2026-10-21T10:00:00Z") });
    expect(a).toBe(b);
    expect(a).not.toBe(otroCurso);
    expect(a).not.toBe(otroDia);
    expect(a).toBe("curso:crs_1:2026-10-20");
  });

  it("es un tipo más de `staff_notice`, con su llave y su columna de contacto", () => {
    expect(STAFF_NOTICE_KINDS).toContain("interesado_nuevo");
    const sujeto = sujetoDeInteresado("ct_1", "taller:coh_9:2026-10-20");
    expect(claveDeAviso(sujeto)).toBe("interesado_nuevo:ct_1:taller:coh_9:2026-10-20");
    expect(columnasDelSujeto(sujeto)).toEqual({
      cohortId: null,
      enrollmentId: null,
      paymentId: null,
      periodKey: null,
      contactId: "ct_1",
    });
  });

  it("se reconstruye desde la fila (para la periódica)", () => {
    const sujeto = sujetoDeInteresado("ct_1", "curso:crs_1:2026-10-20");
    const fila = {
      kind: "interesado_nuevo" as const,
      ...columnasDelSujeto(sujeto),
      dedupKey: claveDeAviso(sujeto),
    };
    expect(sujetoDeRegistro(fila)).toEqual(sujeto);
    expect(sujetoDeRegistro({ ...fila, contactId: null })).toBeNull();
    expect(sujetoDeRegistro({ ...fila, dedupKey: "otra:cosa" })).toBeNull();
  });
});

describe("destinatarios", () => {
  const sellers = [
    { id: "sel_1", name: "Beto", email: "beto@academia.test", archivedAt: null },
    { id: "sel_2", name: "Caro", email: "caro@academia.test", archivedAt: new Date() },
    { id: "sel_3", name: "Dani", email: null, archivedAt: null },
  ];

  it("To = la casilla; CC = copias ∪ vendedores activos con correo, sin repetidos", () => {
    const r = destinatariosDeInteresados(
      {
        enabled: true,
        mailbox: "leads@academia.test",
        ccEmails: ["jefa@academia.test", "LEADS@academia.test", "beto@academia.test"],
        ccSellerIds: ["sel_1", "sel_2", "sel_3", "sel_x"],
      },
      sellers
    );
    expect(r).toEqual({ to: ["leads@academia.test"], cc: ["jefa@academia.test", "beto@academia.test"] });
  });

  it("área apagada, sin fila o sin casilla → nadie (el aviso se omite)", () => {
    const cfg = { enabled: true, mailbox: "leads@academia.test", ccEmails: [], ccSellerIds: [] };
    expect(destinatariosDeInteresados(null, sellers)).toBeNull();
    expect(destinatariosDeInteresados({ ...cfg, enabled: false }, sellers)).toBeNull();
    expect(destinatariosDeInteresados({ ...cfg, mailbox: null }, sellers)).toBeNull();
  });
});

describe("el correo", () => {
  const opts = { baseUrl: "https://crm.academia.test/", timeZone: "America/Montevideo" };

  it("asunto con el nombre y el curso", () => {
    expect(armarAvisoInteresado(base, opts).subject).toBe("Nuevo interesado: Ana Pérez — Revit");
  });

  it("trae los datos, el enlace al contacto y escapa lo que escribió la persona", () => {
    const { html } = armarAvisoInteresado(base, opts);
    expect(html).toContain("Ana Pérez");
    expect(html).toContain("59899123456");
    expect(html).toContain("ana@example.com");
    expect(html).toContain("&lt;b&gt;de noche&lt;/b&gt;");
    expect(html).not.toContain("<b>de noche</b>");
    expect(html).toContain("https://crm.academia.test/contacts/ct_1");
    expect(html).toContain("Contacto nuevo");
    // 15:30 UTC = 12:30 en Montevideo.
    expect(html).toContain("12:30");
    expect(html).toContain("Formulario «Revit»");
  });

  it("dice si la persona ya existía en el CRM", () => {
    const { html } = armarAvisoInteresado({ ...base, contactoNuevo: false }, opts);
    expect(html).toContain("ya existía");
    expect(html).not.toContain("Contacto nuevo");
  });

  it("taller con edición: dice la fecha de la edición y si quedó anotado", () => {
    const taller: InteresadoNuevo = {
      ...base,
      interes: {
        tipo: "taller",
        nombre: "Taller de Dynamo",
        cohorte: "Noviembre",
        inicio: "2026-11-05T00:00:00.000Z",
        horario: "19:00",
      },
      resultado: "anotado",
    };
    const { subject, html } = armarAvisoInteresado(taller, opts);
    expect(subject).toBe("Nuevo interesado: Ana Pérez — Taller de Dynamo — Noviembre");
    expect(html).toContain("jueves 5 de noviembre de 2026");
    expect(html).toContain("19:00 (hora de Uruguay)");
    expect(html).toContain("Quedó anotado");
  });

  it("taller lleno: el interesado igual llega, con el motivo", () => {
    const { html } = armarAvisoInteresado(
      {
        ...base,
        interes: { tipo: "taller", nombre: "Dynamo", cohorte: null, inicio: null, horario: null },
        resultado: "No quedan lugares.",
      },
      opts
    );
    expect(html).toContain("No quedó anotado");
    expect(html).toContain("No quedan lugares.");
  });

  it("formulario sin curso: el asunto usa el nombre del formulario; sin apellido, sin correo, sin mensaje", () => {
    const r = armarAvisoInteresado(
      {
        ...base,
        apellido: null,
        email: null,
        mensaje: null,
        interes: { tipo: "general", nombre: null, cohorte: null, inicio: null, horario: null },
        origen: "formulario:Feria 2026",
      },
      opts
    );
    expect(r.subject).toBe("Nuevo interesado: Ana — Feria 2026");
    expect(r.html).toContain("Sin curso indicado");
  });
});
