import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  CORREO_SECUNDARIO_IGUAL,
  campoDeDuplicado,
  correoSecundarioRepetido,
  mensajeDeDuplicado,
} from "@/lib/contact-identity";
import { coincideConBusqueda } from "@/lib/contact-search";
import { condicionDeCorreoTomado } from "@/server/contact-duplicates";

/**
 * Correo secundario del contacto (2026-10-26) — el laboral y el personal, en
 * cualquier orden. Se busca y se chequea contra duplicados; NUNCA es un
 * destino: no manda nada, no es login, no es identidad de WhatsApp.
 */

const raiz = process.cwd();
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");

describe("correoSecundarioRepetido", () => {
  it("igual al principal es un error (ya normalizados)", () => {
    expect(correoSecundarioRepetido("ana@x.com", "ana@x.com")).toBe(true);
  });

  it("compara sin mayúsculas por si el principal es un correo viejo sin normalizar", () => {
    expect(correoSecundarioRepetido("Ana@X.com", "ana@x.com")).toBe(true);
  });

  it("distinto, o alguno vacío, está bien", () => {
    expect(correoSecundarioRepetido("ana@x.com", "ana@casa.com")).toBe(false);
    expect(correoSecundarioRepetido(null, "ana@casa.com")).toBe(false);
    expect(correoSecundarioRepetido("ana@x.com", null)).toBe(false);
  });

  it("el mensaje es en voseo institucional", () => {
    expect(CORREO_SECUNDARIO_IGUAL).toMatch(/distinto del principal/);
  });
});

describe("duplicados por correo secundario", () => {
  it("el mensaje nombra al otro contacto igual que con el principal", () => {
    expect(mensajeDeDuplicado("correo_secundario", "Ana Pérez")).toBe(
      "Ya existe un contacto con ese correo: Ana Pérez"
    );
  });

  it("el 409 apunta al campo que chocó", () => {
    expect(campoDeDuplicado("correo")).toBe("email");
    expect(campoDeDuplicado("correo_secundario")).toBe("secondaryEmail");
    expect(campoDeDuplicado("telefono")).toBe("phone");
  });

  it("un correo está tomado si es el principal O el secundario de otro", () => {
    const q = new PgDialect().sqlToQuery(condicionDeCorreoTomado("ana@x.com"));
    expect(q.sql).toContain('lower("contact"."email")');
    expect(q.sql).toContain('"contact"."secondary_email"');
    expect(q.sql).toMatch(/\bor\b/i);
    expect(q.params.filter((p) => p === "ana@x.com")).toHaveLength(2);
  });
});

describe("búsqueda", () => {
  it("encuentra por el correo secundario", () => {
    expect(
      coincideConBusqueda("ana@casa", { texto: ["Ana", "Pérez", "ana@trabajo.com", "ana@casa.com"] })
    ).toBe(true);
  });

  it("GET /api/contacts busca también en secondary_email", () => {
    expect(leer("src/app/api/contacts/route.ts")).toMatch(/schema\.contact\.secondaryEmail/);
  });
});

describe("nunca es un destino ni viaja fuera del staff", () => {
  const prohibidos = [
    "src/lib/license-email.ts",
    "src/lib/terminos-licencia.ts",
    "src/server/student-portal.ts",
    "src/server/teacher-portal.ts",
    "src/server/access.ts",
    "src/lib/auth/portal.ts",
    "src/server/inbox/identity.ts",
    "src/server/marketing/audiences.ts",
    "src/server/email/enrollment-emails.ts",
  ];
  for (const archivo of prohibidos) {
    it(`${archivo} no lo nombra`, () => {
      expect(leer(archivo)).not.toMatch(/secondaryEmail|secondary_email/);
    });
  }

  it("la migración solo agrega la columna y su índice (sin RLS nueva: la tabla ya la tiene)", () => {
    const sql = leer("drizzle/0077_correo_secundario.sql");
    expect(sql).toMatch(/add column if not exists "secondary_email" text/i);
    expect(sql).toMatch(/create unique index if not exists "contact_org_secondary_email_uq"/i);
    expect(sql).not.toMatch(/create policy|create table/i);
  });
});
