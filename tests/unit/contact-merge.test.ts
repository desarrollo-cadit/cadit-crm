import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COLUMNAS_DE_CONSULTA,
  consultaGeneralVacia,
  datosVacios,
  elegirQuienQueda,
  planDeCorreos,
  planDeUnificacion,
  telefonoUnificado,
  type ConsultaGeneral,
  type ContactoAUnificar,
  type DatosDeUnificacion,
} from "@/lib/contact-merge";

/**
 * 2026-10-26 — Unificar contactos: las reglas, sin base.
 *
 * El caso real: «Patricia» se cargó con solo el correo (identidad
 * provisional `sinwa:`) y después no se le pudo agregar el teléfono porque
 * otro contacto —el que llegó por WhatsApp— ya lo tenía. Dos contactos, la
 * misma persona. Unificar es irreversible: estas reglas deciden qué queda.
 */

const contacto = (over: Partial<ContactoAUnificar> = {}): ContactoAUnificar => ({
  id: "ct_x",
  firstName: "X",
  lastName: null,
  email: null,
  secondaryEmail: null,
  phone: null,
  waIdentity: "sinwa:ct_x",
  waUserId: null,
  nationalId: null,
  companyId: null,
  notes: null,
  source: null,
  utmCampaign: null,
  archivedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

/** El de WhatsApp: identidad real (el teléfono). */
const whatsapp = (over: Partial<ContactoAUnificar> = {}) =>
  contacto({
    id: "ct_wa",
    firstName: "Patri",
    phone: "59899123456",
    waIdentity: "59899123456",
    createdAt: new Date("2026-03-01T00:00:00Z"),
    ...over,
  });

/** La cargada a mano con solo el correo: identidad provisional. */
const patricia = (over: Partial<ContactoAUnificar> = {}) =>
  contacto({
    id: "ct_pat",
    firstName: "Patricia",
    lastName: "Gómez",
    email: "patricia@ejemplo.com",
    waIdentity: "sinwa:ct_pat",
    nationalId: "1.234.567-8",
    createdAt: new Date("2026-02-01T00:00:00Z"),
    ...over,
  });

const datos = (over: Partial<DatosDeUnificacion> = {}): DatosDeUnificacion => ({
  ...datosVacios(),
  ...over,
});

describe("quién queda", () => {
  it("el de identidad REAL queda siempre, lo pida quien lo pida", () => {
    const e = elegirQuienQueda(patricia(), whatsapp(), "ct_pat");
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.survivor.id).toBe("ct_wa");
    expect(e.absorbed.id).toBe("ct_pat");
    expect(e.puedeElegir).toBe(false);
  });

  it("también un `bsuid:` cuenta como identidad real", () => {
    const e = elegirQuienQueda(patricia(), whatsapp({ waIdentity: "bsuid:UY.123", phone: null }));
    expect(e.ok && e.survivor.id).toBe("ct_wa");
  });

  it("dos identidades reales: BLOQUEA (pueden ser dos personas)", () => {
    const e = elegirQuienQueda(
      whatsapp(),
      whatsapp({ id: "ct_otro", phone: "59899000000", waIdentity: "59899000000" })
    );
    expect(e.ok).toBe(false);
    if (e.ok) return;
    expect(e.bloqueo.code).toBe("identidades_reales");
    expect(e.bloqueo.mensaje).toMatch(/No se puede unificar/);
  });

  it("dos provisionales: por defecto el más viejo", () => {
    const viejo = contacto({ id: "ct_viejo", createdAt: new Date("2025-01-01Z") });
    const nuevo = contacto({ id: "ct_nuevo", createdAt: new Date("2026-01-01Z") });
    const e = elegirQuienQueda(nuevo, viejo);
    expect(e.ok && e.survivor.id).toBe("ct_viejo");
    expect(e.ok && e.puedeElegir).toBe(true);
  });

  it("dos provisionales: la persona puede elegir", () => {
    const viejo = contacto({ id: "ct_viejo", createdAt: new Date("2025-01-01Z") });
    const nuevo = contacto({ id: "ct_nuevo", createdAt: new Date("2026-01-01Z") });
    const e = elegirQuienQueda(nuevo, viejo, "ct_nuevo");
    expect(e.ok && e.survivor.id).toBe("ct_nuevo");
    expect(e.ok && e.absorbed.id).toBe("ct_viejo");
  });

  it("dos provisionales: un pedido que no es ninguno de los dos se ignora", () => {
    const viejo = contacto({ id: "ct_viejo", createdAt: new Date("2025-01-01Z") });
    const nuevo = contacto({ id: "ct_nuevo", createdAt: new Date("2026-01-01Z") });
    const e = elegirQuienQueda(nuevo, viejo, "ct_ajeno");
    expect(e.ok && e.survivor.id).toBe("ct_viejo");
  });
});

describe("los correos: el principal del que queda no se toca", () => {
  it("el del absorbido completa el principal vacío", () => {
    const c = planDeCorreos(whatsapp(), patricia());
    expect(c.primary).toBe("patricia@ejemplo.com");
    expect(c.secondary).toBeNull();
    expect(c.descartados).toEqual([]);
    expect(c.requiereEleccion).toBe(false);
  });

  it("con principal propio, el del absorbido va al secundario vacío", () => {
    const c = planDeCorreos(whatsapp({ email: "patri@trabajo.com" }), patricia());
    expect(c.primary).toBe("patri@trabajo.com");
    expect(c.secondary).toBe("patricia@ejemplo.com");
  });

  it("el mismo correo (sin mayúsculas) no se cuenta dos veces", () => {
    const c = planDeCorreos(
      whatsapp({ email: "Patricia@Ejemplo.com" }),
      patricia({ secondaryEmail: "otro@ejemplo.com" })
    );
    expect(c.opciones).toEqual(["patricia@ejemplo.com", "otro@ejemplo.com"]);
    expect(c.primary).toBe("patricia@ejemplo.com");
    expect(c.secondary).toBe("otro@ejemplo.com");
    expect(c.requiereEleccion).toBe(false);
  });

  it("más de dos distintos: hay que elegir, y la sugerencia conserva los del que queda", () => {
    const c = planDeCorreos(
      whatsapp({ email: "a@x.com", secondaryEmail: "b@x.com" }),
      patricia({ email: "c@x.com" })
    );
    expect(c.requiereEleccion).toBe(true);
    expect(c.faltaElegir).toBe(true);
    expect(c.opciones).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(c.primary).toBe("a@x.com");
    expect(c.secondary).toBe("b@x.com");
    expect(c.descartados).toEqual(["c@x.com"]);
  });

  it("más de dos: la elección manda y los otros se descartan", () => {
    const c = planDeCorreos(
      whatsapp({ email: "a@x.com", secondaryEmail: "b@x.com" }),
      patricia({ email: "c@x.com", secondaryEmail: "d@x.com" }),
      { primary: "c@x.com", secondary: "a@x.com" }
    );
    expect(c.faltaElegir).toBe(false);
    expect(c.error).toBeNull();
    expect(c.primary).toBe("c@x.com");
    expect(c.secondary).toBe("a@x.com");
    expect(c.descartados).toEqual(["b@x.com", "d@x.com"]);
  });

  it("una elección con un correo ajeno o repetido es un error", () => {
    const s = whatsapp({ email: "a@x.com", secondaryEmail: "b@x.com" });
    const a = patricia({ email: "c@x.com" });
    expect(planDeCorreos(s, a, { primary: "z@x.com", secondary: null }).error).toMatch(/correo/);
    expect(planDeCorreos(s, a, { primary: "a@x.com", secondary: "a@x.com" }).error).toMatch(/distint/);
  });
});

describe("el teléfono", () => {
  it("completa el que falta y, si la identidad era provisional, pasa a ser la identidad", () => {
    const t = telefonoUnificado(
      contacto({ id: "ct_s", waIdentity: "sinwa:ct_s" }),
      contacto({ id: "ct_a", phone: "59899111111" })
    );
    expect(t).toEqual({ phone: "59899111111", waIdentity: "59899111111", descartado: null });
  });

  it("nunca pisa el del que queda; el otro queda anotado como descartado", () => {
    const t = telefonoUnificado(whatsapp(), contacto({ phone: "59899000000" }));
    expect(t.phone).toBe("59899123456");
    expect(t.descartado).toBe("59899000000");
  });

  it("no pone un teléfono distinto del que es la identidad de WhatsApp", () => {
    const t = telefonoUnificado(
      whatsapp({ phone: null }),
      contacto({ phone: "59899000000" })
    );
    expect(t.phone).toBeNull();
    expect(t.waIdentity).toBe("59899123456");
    expect(t.descartado).toBe("59899000000");
  });
});

describe("los datos personales: se completan, nunca se pisan", () => {
  it("el caso Patricia: queda el de WhatsApp con el apellido, la cédula y el correo de ella", () => {
    const p = planDeUnificacion(patricia(), whatsapp(), datos());
    expect(p.bloqueos).toEqual([]);
    expect(p.survivorId).toBe("ct_wa");
    expect(p.absorbedId).toBe("ct_pat");
    expect(p.contacto).toMatchObject({
      lastName: "Gómez",
      nationalId: "1.234.567-8",
      email: "patricia@ejemplo.com",
    });
    // El nombre del que queda no se toca: solo se completa si está vacío.
    expect(p.contacto.firstName).toBeUndefined();
    // Ni el teléfono ni la identidad cambian.
    expect(p.contacto.phone).toBeUndefined();
    expect(p.contacto.waIdentity).toBeUndefined();
  });

  it("un dato que el que queda ya tiene no se pisa", () => {
    const p = planDeUnificacion(
      patricia({ nationalId: "9.999.999-9", lastName: "Otra" }),
      whatsapp({ lastName: "Gómez", nationalId: "1.234.567-8" }),
      datos()
    );
    expect(p.contacto.lastName).toBeUndefined();
    expect(p.contacto.nationalId).toBeUndefined();
  });

  it("empresa: se completa si falta", () => {
    const p = planDeUnificacion(patricia({ companyId: "co_1" }), whatsapp(), datos());
    expect(p.empresaDelAbsorbido).toBe("co_1");
    expect(p.empresaDescartada).toBeNull();
  });

  it("empresas distintas: queda la del que queda y la otra va a la nota", () => {
    const p = planDeUnificacion(
      patricia({ companyId: "co_1" }),
      whatsapp({ companyId: "co_2" }),
      datos({ empresas: { co_1: "Constructora Uno", co_2: "Estudio Dos" } })
    );
    expect(p.empresaDescartada).toBe("co_1");
    expect(p.nota).toContain("empresa descartada: Constructora Uno");
    const campo = p.campos.find((c) => c.campo === "empresa");
    expect(campo?.resultado).toBe("Estudio Dos");
  });

  it("las notas se juntan, no se reemplazan", () => {
    const p = planDeUnificacion(
      patricia({ notes: "Pidió factura" }),
      whatsapp({ notes: "Llamar de tarde" }),
      datos()
    );
    expect(p.contacto.notes).toBe("Llamar de tarde\n\nPidió factura");
  });

  it("los correos descartados quedan en la nota", () => {
    const p = planDeUnificacion(
      patricia({ email: "c@x.com" }),
      whatsapp({ email: "a@x.com", secondaryEmail: "b@x.com" }),
      datos(),
      { correos: { primary: "a@x.com", secondary: "c@x.com" } }
    );
    expect(p.contacto.secondaryEmail).toBe("c@x.com");
    expect(p.nota).toContain("correos descartados: b@x.com");
  });

  it("más de dos correos sin elegir: no es un bloqueo, pero falta elegir", () => {
    const p = planDeUnificacion(
      patricia({ email: "c@x.com" }),
      whatsapp({ email: "a@x.com", secondaryEmail: "b@x.com" }),
      datos()
    );
    expect(p.bloqueos).toEqual([]);
    expect(p.correos.faltaElegir).toBe(true);
  });
});

describe("bloqueos", () => {
  it("los dos inscriptos en el mismo grupo: bloquea nombrando el grupo", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        inscripciones: [
          { id: "en_1", contactId: "ct_pat", cohortId: "co_rev", grupo: "Revit Marzo", dependientes: 3 },
          { id: "en_2", contactId: "ct_wa", cohortId: "co_rev", grupo: "Revit Marzo", dependientes: 0 },
        ],
      })
    );
    expect(p.bloqueos).toHaveLength(1);
    expect(p.bloqueos[0]!.code).toBe("mismo_grupo");
    expect(p.bloqueos[0]!.mensaje).toBe(
      "No se puede unificar: los dos están inscriptos en el grupo Revit Marzo. Primero dá de baja o corregí una de las inscripciones."
    );
  });

  it("los dos con cuenta del portal: bloquea", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        cuentasDelPortal: [
          { id: "al_1", contactId: "ct_pat" },
          { id: "al_2", contactId: "ct_wa" },
        ],
      })
    );
    expect(p.bloqueos.map((b) => b.code)).toEqual(["dos_cuentas_portal"]);
  });

  it("solo el absorbido tiene cuenta del portal: se mueve", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({ cuentasDelPortal: [{ id: "al_1", contactId: "ct_pat" }] })
    );
    expect(p.bloqueos).toEqual([]);
    expect(p.conteos.cuentaDelPortal).toBe(1);
  });

  it("dos identidades reales: bloquea", () => {
    const p = planDeUnificacion(
      whatsapp({ id: "ct_otro", phone: "59899000000", waIdentity: "59899000000" }),
      whatsapp(),
      datos()
    );
    expect(p.bloqueos.map((b) => b.code)).toEqual(["identidades_reales"]);
  });
});

describe("inscripciones", () => {
  it("las de grupos distintos se mueven todas", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        inscripciones: [
          { id: "en_1", contactId: "ct_pat", cohortId: "co_a", grupo: "A", dependientes: 2 },
          { id: "en_2", contactId: "ct_pat", cohortId: "co_b", grupo: "B", dependientes: 0 },
          { id: "en_3", contactId: "ct_wa", cohortId: "co_c", grupo: "C", dependientes: 0 },
        ],
      })
    );
    expect(p.inscripcionesMovidas).toEqual(["en_1", "en_2"]);
    expect(p.inscripcionABorrar).toBeNull();
    expect(p.conteos.inscripciones).toBe(2);
  });

  it("dos consultas generales: queda la del que queda y se borra la vacía del absorbido", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        inscripciones: [
          { id: "en_a", contactId: "ct_pat", cohortId: null, grupo: null, dependientes: 0 },
          { id: "en_s", contactId: "ct_wa", cohortId: null, grupo: null, dependientes: 0 },
        ],
      })
    );
    expect(p.inscripcionABorrar).toBe("en_a");
    expect(p.inscripcionesMovidas).toEqual([]);
  });

  it("dos consultas generales y solo la del absorbido tiene datos: queda esa", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        inscripciones: [
          { id: "en_a", contactId: "ct_pat", cohortId: null, grupo: null, dependientes: 2 },
          { id: "en_s", contactId: "ct_wa", cohortId: null, grupo: null, dependientes: 0 },
        ],
      })
    );
    expect(p.inscripcionABorrar).toBe("en_s");
    expect(p.inscripcionesMovidas).toEqual(["en_a"]);
  });

  it("dos consultas generales con datos las dos: bloquea (no se borra nada con cuotas o pagos)", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        inscripciones: [
          { id: "en_a", contactId: "ct_pat", cohortId: null, grupo: null, dependientes: 1 },
          { id: "en_s", contactId: "ct_wa", cohortId: null, grupo: null, dependientes: 1 },
        ],
      })
    );
    expect(p.bloqueos.map((b) => b.code)).toEqual(["dos_consultas_generales"]);
  });
});

describe("conversaciones", () => {
  const conv = (over: Partial<DatosDeUnificacion["conversaciones"][number]>) => ({
    id: "cv",
    contactId: "ct_wa",
    isTest: false,
    lastInboundAt: null,
    lastMessageAt: null,
    unreadCount: 0,
    mensajes: 0,
    ...over,
  });

  it("las dos reales: se unen en la del que queda, con los totales recalculados", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        conversaciones: [
          conv({
            id: "cv_s",
            contactId: "ct_wa",
            lastInboundAt: new Date("2026-05-01Z"),
            lastMessageAt: new Date("2026-05-02Z"),
            unreadCount: 2,
            mensajes: 10,
          }),
          conv({
            id: "cv_a",
            contactId: "ct_pat",
            lastInboundAt: new Date("2026-06-01Z"),
            lastMessageAt: new Date("2026-04-01Z"),
            unreadCount: 1,
            mensajes: 4,
          }),
        ],
      })
    );
    expect(p.conversacion).toEqual({
      destinoId: "cv_s",
      origenId: "cv_a",
      lastInboundAt: new Date("2026-06-01Z"),
      lastMessageAt: new Date("2026-05-02Z"),
      unreadCount: 3,
    });
    expect(p.conteos.mensajes).toBe(4);
  });

  it("solo el absorbido tiene una real, o son de prueba: se mueven sin unir", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        conversaciones: [
          conv({ id: "cv_a", contactId: "ct_pat" }),
          conv({ id: "cv_t", contactId: "ct_pat", isTest: true }),
          conv({ id: "cv_s", contactId: "ct_wa", isTest: true }),
        ],
      })
    );
    expect(p.conversacion).toBeNull();
    expect(p.conteos.conversaciones).toBe(2);
  });
});

describe("cursos offline, progreso, intentos y reconocimientos", () => {
  it("accesos directos activos al mismo curso: queda la fecha más tarde, el otro se revoca", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        accesosOffline: [
          { id: "g_a", contactId: "ct_pat", offlineCourseId: "oc_1", accessUntil: new Date("2026-12-31Z"), activo: true },
          { id: "g_s", contactId: "ct_wa", offlineCourseId: "oc_1", accessUntil: new Date("2026-11-30Z"), activo: true },
          { id: "g_b", contactId: "ct_pat", offlineCourseId: "oc_2", accessUntil: new Date("2026-11-30Z"), activo: true },
        ],
      })
    );
    expect(p.accesosARevocar).toEqual(["g_s"]);
  });

  it("progreso del mismo tema: queda el terminado o el de más avance", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        progreso: [
          { id: "p_a1", contactId: "ct_pat", topicId: "t1", watchedRatio: 0.4, completedAt: null },
          { id: "p_s1", contactId: "ct_wa", topicId: "t1", watchedRatio: 0.9, completedAt: null },
          { id: "p_a2", contactId: "ct_pat", topicId: "t2", watchedRatio: 0.1, completedAt: new Date("2026-01-01Z") },
          { id: "p_s2", contactId: "ct_wa", topicId: "t2", watchedRatio: 0.8, completedAt: null },
        ],
      })
    );
    expect(p.progresoABorrar.sort()).toEqual(["p_a1", "p_s2"]);
  });

  it("intentos del mismo cuestionario: los del absorbido se renumeran después del último", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        intentos: [
          { id: "i_s1", contactId: "ct_wa", quizId: "q1", attemptNumber: 1 },
          { id: "i_s2", contactId: "ct_wa", quizId: "q1", attemptNumber: 2 },
          { id: "i_a2", contactId: "ct_pat", quizId: "q1", attemptNumber: 2 },
          { id: "i_a1", contactId: "ct_pat", quizId: "q1", attemptNumber: 1 },
          { id: "i_b1", contactId: "ct_pat", quizId: "q2", attemptNumber: 1 },
        ],
      })
    );
    expect(p.intentosARenumerar).toEqual([
      { id: "i_a1", attemptNumber: 3 },
      { id: "i_a2", attemptNumber: 4 },
    ]);
  });

  it("reconocimientos activos repetidos: se revoca el del absorbido", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        reconocimientos: [
          { id: "r_a", contactId: "ct_pat", courseId: "oc_1", lessonId: null, activo: true },
          { id: "r_s", contactId: "ct_wa", courseId: "oc_1", lessonId: null, activo: true },
          { id: "r_al", contactId: "ct_pat", courseId: "oc_1", lessonId: "l_1", activo: true },
          { id: "r_x", contactId: "ct_pat", courseId: "oc_2", lessonId: null, activo: false },
        ],
      })
    );
    expect(p.reconocimientosARevocar).toEqual(["r_a"]);
  });
});

describe("historial importado", () => {
  it("la llave se recalcula con el que queda; si choca, la fila del absorbido sobra", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        historial: [
          { id: "h_s", contactId: "ct_wa", dedupKey: "ct_wa|curso:c1|2021-03-01" },
          { id: "h_a1", contactId: "ct_pat", dedupKey: "ct_pat|curso:c1|2021-03-01" },
          { id: "h_a2", contactId: "ct_pat", dedupKey: "ct_pat|texto:autocad|2022-05-01" },
        ],
      })
    );
    expect(p.historialABorrar).toEqual(["h_a1"]);
    expect(p.historialAReclavar).toEqual([
      { id: "h_a2", dedupKey: "ct_wa|texto:autocad|2022-05-01" },
    ]);
  });
});

describe("la nota en el que queda", () => {
  it("dice con quién se unificó y qué se movió", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        inscripciones: [
          { id: "en_1", contactId: "ct_pat", cohortId: "co_a", grupo: "A", dependientes: 0 },
          { id: "en_2", contactId: "ct_pat", cohortId: "co_b", grupo: "B", dependientes: 0 },
        ],
      })
    );
    expect(p.nota).toMatch(/^Unificado con Patricia Gómez \(patricia@ejemplo\.com\): /);
    expect(p.nota).toContain("se movieron 2 inscripciones");
  });
});

/**
 * 2026-10-26 — La consulta general que se borra tiene datos PROPIOS (etapa,
 * vendedor, monto, curso de interés, fechas del checklist…). Antes de
 * borrarla se completan los vacíos de la que queda; lo que difiere y se
 * pierde va a la nota ("Interés descartado: …") y a la vista previa.
 */
describe("consulta general: completa, nunca pisa", () => {
  const lead = (over: Partial<ConsultaGeneral> = {}): ConsultaGeneral => ({
    ...consultaGeneralVacia(),
    id: "en_x",
    contactId: "ct_x",
    stageId: "st_nuevo",
    ...over,
  });
  const inscripcion = (id: string, contactId: string, dependientes = 0) => ({
    id,
    contactId,
    cohortId: null,
    grupo: null,
    dependientes,
  });
  const nombres = {
    etapas: { st_nuevo: "Nuevo", st_contactado: "Contactado" },
    vendedores: { sl_ana: "Ana", sl_beto: "Beto" },
    cursos: { cu_revit: "Revit", cu_autocad: "AutoCAD" },
  };

  it("los vacíos de la que queda se llenan con los de la que se borra", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        inscripciones: [inscripcion("en_a", "ct_pat"), inscripcion("en_s", "ct_wa")],
        consultasGenerales: [
          lead({
            id: "en_a",
            contactId: "ct_pat",
            sellerId: "sl_ana",
            interestCourseId: "cu_revit",
            amount: 150000,
            currency: "USD",
            installments: 3,
            paymentNotes: "Paga la empresa",
            licenseEmail: "lic@x.com",
            companyId: "co_1",
            termsEmailSentAt: new Date("2026-04-01Z"),
            hadOwnLicense: true,
            lastActivityAt: new Date("2026-06-01Z"),
          }),
          lead({ id: "en_s", contactId: "ct_wa", lastActivityAt: new Date("2026-05-01Z") }),
        ],
        nombres,
      })
    );
    expect(p.inscripcionABorrar).toBe("en_a");
    expect(p.consultaGeneral).not.toBeNull();
    expect(p.consultaGeneral!.conservadaId).toBe("en_s");
    expect(p.consultaGeneral!.set).toEqual({
      sellerId: "sl_ana",
      interestCourseId: "cu_revit",
      amount: 150000,
      currency: "USD",
      installments: 3,
      paymentNotes: "Paga la empresa",
      licenseEmail: "lic@x.com",
      companyId: "co_1",
      termsEmailSentAt: new Date("2026-04-01Z"),
      hadOwnLicense: true,
      lastActivityAt: new Date("2026-06-01Z"),
    });
    expect(p.consultaGeneral!.descartados).toEqual([]);
    expect(p.nota).not.toContain("Interés descartado");
  });

  it("lo que la que queda ya tiene no se pisa, y lo distinto que se pierde va a la nota", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        inscripciones: [inscripcion("en_a", "ct_pat"), inscripcion("en_s", "ct_wa")],
        consultasGenerales: [
          lead({ id: "en_a", contactId: "ct_pat", stageId: "st_contactado", sellerId: "sl_beto", interestCourseId: "cu_autocad", amount: 1000, currency: "UYU" }),
          lead({ id: "en_s", contactId: "ct_wa", stageId: "st_nuevo", sellerId: "sl_ana", interestCourseId: "cu_autocad", amount: 2000, currency: "USD" }),
        ],
        nombres,
      })
    );
    const c = p.consultaGeneral!;
    expect(c.set).toEqual({});
    expect(c.descartados).toEqual(["etapa Contactado", "monto UYU 10", "vendedor Beto"]);
    expect(p.nota).toContain("Interés descartado: etapa Contactado, monto UYU 10, vendedor Beto");
    // La vista previa lo muestra, campo por campo.
    const vendedor = c.campos.find((f) => f.campo === "vendedor");
    expect(vendedor).toMatchObject({ queda: "Ana", absorbido: "Beto", resultado: "Ana" });
  });

  it("las notas de pago se juntan; el monto viaja con su moneda", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        inscripciones: [inscripcion("en_a", "ct_pat"), inscripcion("en_s", "ct_wa")],
        consultasGenerales: [
          lead({ id: "en_a", contactId: "ct_pat", paymentNotes: "Transferencia", amount: 500, currency: "USD" }),
          lead({ id: "en_s", contactId: "ct_wa", paymentNotes: "Pidió descuento" }),
        ],
        nombres,
      })
    );
    expect(p.consultaGeneral!.set).toMatchObject({
      paymentNotes: "Pidió descuento\n\nTransferencia",
      amount: 500,
      currency: "USD",
    });
  });

  it("si queda la del absorbido (la otra estaba vacía de filas), se completa con la del que queda", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        inscripciones: [inscripcion("en_a", "ct_pat", 2), inscripcion("en_s", "ct_wa", 0)],
        consultasGenerales: [
          lead({ id: "en_a", contactId: "ct_pat" }),
          lead({ id: "en_s", contactId: "ct_wa", sellerId: "sl_ana" }),
        ],
        nombres,
      })
    );
    expect(p.inscripcionABorrar).toBe("en_s");
    expect(p.consultaGeneral!.conservadaId).toBe("en_a");
    expect(p.consultaGeneral!.set).toEqual({ sellerId: "sl_ana" });
  });

  it("las dos con filas: sigue bloqueando y no arma consulta", () => {
    const p = planDeUnificacion(
      patricia(),
      whatsapp(),
      datos({
        inscripciones: [inscripcion("en_a", "ct_pat", 1), inscripcion("en_s", "ct_wa", 1)],
        consultasGenerales: [lead({ id: "en_a", contactId: "ct_pat" }), lead({ id: "en_s", contactId: "ct_wa" })],
      })
    );
    expect(p.bloqueos.map((b) => b.code)).toEqual(["dos_consultas_generales"]);
    expect(p.consultaGeneral).toBeNull();
  });

  it("cubre TODAS las columnas propias de la inscripción", () => {
    const schemaSrc = readFileSync(path.join(process.cwd(), "src/lib/db/schema.ts"), "utf8");
    const bloque = schemaSrc.split("export const enrollment = pgTable(")[1]!.split("\n  (t) =>")[0]!;
    const columnas = [...bloque.matchAll(/^    (\w+): (?:text|timestamp|integer|bigint|boolean|numeric|jsonb)\(/gm)].map((m) => m[1]!);
    // Las que no son datos de la consulta: identidad, dueño, grupo, orden en el tablero y marcas de tiempo.
    const fuera = ["id", "organizationId", "contactId", "cohortId", "parentEnrollmentId", "position", "createdAt", "updatedAt"];
    const propias = columnas.filter((c) => !fuera.includes(c));
    expect(propias.length).toBeGreaterThan(25);
    expect(Object.keys(consultaGeneralVacia()).sort()).toEqual(
      [...propias, "id", "contactId"].sort()
    );
    for (const c of propias) expect(COLUMNAS_DE_CONSULTA, c).toContain(c);
  });
});
