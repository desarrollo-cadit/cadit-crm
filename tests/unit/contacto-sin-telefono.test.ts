import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  FALTA_TELEFONO_O_CORREO,
  contactoNuevoSchema,
  correoNullable,
  destinoDeWhatsApp,
  esIdentidadProvisional,
  identidadProvisional,
  mensajeDeDuplicado,
  normalizarCorreo,
  planDeTelefono,
  quedaSinCanal,
} from "@/lib/contact-identity";

/**
 * Contactos sin teléfono (2026-10-21) — el panel puede dar de alta a una
 * persona con solo su correo. `wa_identity` sigue siendo NOT NULL y única: la
 * persona recibe una identidad PROVISIONAL (`sinwa:<id>`) que no puede chocar
 * con una de WhatsApp (teléfono = solo dígitos, o `bsuid:<id>`), y que jamás
 * se usa para mandar un mensaje.
 */

describe("contactoNuevoSchema — teléfono o correo, al menos uno", () => {
  it("acepta solo teléfono, normalizado", () => {
    const r = contactoNuevoSchema.parse({ firstName: "Ana", phone: "099 123 456" });
    expect(r.phone).toBe("59899123456");
    expect(r.email).toBeUndefined();
  });

  it("acepta solo correo, normalizado a minúsculas y sin espacios", () => {
    const r = contactoNuevoSchema.parse({ firstName: "Ana", email: "  Ana.Perez@Mail.COM " });
    expect(r.email).toBe("ana.perez@mail.com");
    expect(r.phone).toBeUndefined();
  });

  it("un campo vacío cuenta como ausente", () => {
    const r = contactoNuevoSchema.parse({ firstName: "Ana", phone: "", email: "a@b.uy" });
    expect(r.phone).toBeUndefined();
  });

  it("sin teléfono ni correo: rechaza con un mensaje claro", () => {
    const r = contactoNuevoSchema.safeParse({ firstName: "Ana", phone: "", email: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.message)).toContain(FALTA_TELEFONO_O_CORREO);
    }
  });

  it("un teléfono mal escrito sigue siendo un error del teléfono, no se ignora", () => {
    const r = contactoNuevoSchema.safeParse({ firstName: "Ana", phone: "12", email: "a@b.uy" });
    expect(r.success).toBe(false);
  });

  it("un correo inválido se rechaza", () => {
    const r = contactoNuevoSchema.safeParse({ firstName: "Ana", email: "no-es-correo" });
    expect(r.success).toBe(false);
  });
});

describe("normalizarCorreo / correoNullable", () => {
  it("recorta y pasa a minúsculas", () => {
    expect(normalizarCorreo("  Ana@CadIT.UY ")).toBe("ana@cadit.uy");
  });
  it("vacío o nulo es null", () => {
    expect(normalizarCorreo("   ")).toBeNull();
    expect(normalizarCorreo(null)).toBeNull();
    expect(normalizarCorreo(undefined)).toBeNull();
  });
  it("correoNullable: '' → null, válido → minúsculas, inválido → error", () => {
    const s = z.object({ email: correoNullable });
    expect(s.parse({ email: "" }).email).toBeNull();
    expect(s.parse({ email: null }).email).toBeNull();
    expect(s.parse({ email: "X@Y.UY" }).email).toBe("x@y.uy");
    expect(s.parse({}).email).toBeUndefined();
    expect(s.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("identidad provisional", () => {
  it("tiene un prefijo que no puede ser un teléfono ni un BSUID", () => {
    const id = identidadProvisional("ct_abc123");
    expect(id).toBe("sinwa:ct_abc123");
    expect(id).not.toMatch(/^\d+$/);
    expect(id.startsWith("bsuid:")).toBe(false);
  });

  it("esIdentidadProvisional distingue las tres formas", () => {
    expect(esIdentidadProvisional("sinwa:ct_1")).toBe(true);
    expect(esIdentidadProvisional("59899123456")).toBe(false);
    expect(esIdentidadProvisional("bsuid:UY.123")).toBe(false);
    expect(esIdentidadProvisional(null)).toBe(false);
    expect(esIdentidadProvisional("")).toBe(false);
  });
});

describe("planDeTelefono — agregar un teléfono después", () => {
  it("contacto provisional sin teléfono: guarda el teléfono Y cambia la identidad", () => {
    expect(
      planDeTelefono({ phone: null, waIdentity: "sinwa:ct_1" }, "59899123456")
    ).toEqual({ tipo: "agregar", phone: "59899123456", waIdentity: "59899123456" });
  });

  it("contacto de WhatsApp por BSUID: guarda el teléfono pero NO toca la identidad", () => {
    expect(
      planDeTelefono({ phone: null, waIdentity: "bsuid:UY.9" }, "59899123456")
    ).toEqual({ tipo: "agregar", phone: "59899123456", waIdentity: "bsuid:UY.9" });
  });

  it("el mismo teléfono que ya tiene: no hay nada que hacer", () => {
    expect(
      planDeTelefono({ phone: "59899123456", waIdentity: "59899123456" }, "59899123456")
    ).toEqual({ tipo: "sin_cambio" });
  });

  it("cambiar un teléfono que ya existe: bloqueado (es su identidad de WhatsApp)", () => {
    const plan = planDeTelefono({ phone: "59899123456", waIdentity: "59899123456" }, "59899000000");
    expect(plan.tipo).toBe("bloqueado");
  });
});

describe("quedaSinCanal — no se puede borrar el único dato de contacto", () => {
  it("borrar el correo de alguien sin teléfono: queda sin canal", () => {
    expect(quedaSinCanal({ phone: null, email: null })).toBe(true);
  });
  it("con teléfono o con correo, tiene canal", () => {
    expect(quedaSinCanal({ phone: "59899123456", email: null })).toBe(false);
    expect(quedaSinCanal({ phone: null, email: "a@b.uy" })).toBe(false);
  });
});

describe("destinoDeWhatsApp — la guarda del emisor", () => {
  const sinCambio = (p: string) => p;

  it("con teléfono, manda al teléfono normalizado", () => {
    expect(
      destinoDeWhatsApp({ phone: "5215512345678", waUserId: null, waIdentity: "525512345678" }, (p) =>
        p.replace(/^521/, "52")
      )
    ).toEqual({ ok: true, to: "525512345678" });
  });

  it("sin teléfono pero con BSUID, manda al BSUID", () => {
    expect(
      destinoDeWhatsApp({ phone: null, waUserId: "UY.9", waIdentity: "bsuid:UY.9" }, sinCambio)
    ).toEqual({ ok: true, to: "UY.9" });
  });

  it("identidad provisional: se niega, y lo dice", () => {
    const r = destinoDeWhatsApp({ phone: null, waUserId: null, waIdentity: "sinwa:ct_1" }, sinCambio);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("sin_whatsapp");
      expect(r.mensaje).toMatch(/sin teléfono/i);
    }
  });

  it("identidad provisional nunca se usa como destinatario, aunque llegara con BSUID", () => {
    const r = destinoDeWhatsApp({ phone: null, waUserId: "UY.9", waIdentity: "sinwa:ct_1" }, sinCambio);
    expect(r.ok).toBe(false);
  });

  it("sin nada utilizable: se niega", () => {
    const r = destinoDeWhatsApp({ phone: null, waUserId: null, waIdentity: "bsuid:x" }, sinCambio);
    expect(r.ok).toBe(false);
  });
});

describe("mensajeDeDuplicado — nombra al contacto que ya existe", () => {
  it("correo", () => {
    expect(mensajeDeDuplicado("correo", "Ana Pérez")).toBe(
      "Ya existe un contacto con ese correo: Ana Pérez"
    );
  });
  it("teléfono", () => {
    expect(mensajeDeDuplicado("telefono", "Ana Pérez")).toBe(
      "Ya existe un contacto con ese teléfono: Ana Pérez"
    );
  });
});

describe("los emisores de WhatsApp pasan por la guarda", () => {
  const leer = (p: string) =>
    readFileSync(path.resolve(__dirname, "../..", p), "utf8");

  it.each(["src/server/inbox/send.ts", "src/server/whatsapp/templates.ts"])(
    "%s resuelve el destinatario con destinoDeWhatsApp",
    (archivo) => {
      const src = leer(archivo);
      expect(src).toContain("destinoDeWhatsApp(");
      // Nadie arma el destinatario a mano con el BSUID: eso saltearía la guarda.
      expect(src).not.toMatch(/:\s*row\.contact\.waUserId/);
    }
  );
});
