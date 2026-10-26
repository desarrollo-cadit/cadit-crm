import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { memberPatchSchema } from "@/lib/team-member-patch";

/**
 * Avisos internos por correo, por persona (`member.receives_internal_notices`).
 * La regla de destinatarios vive en `avisos-sin-confirmar.test.ts`; acá, la
 * migración, el pedido de Equipo y la pantalla.
 */

const raiz = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");

describe("PATCH /api/settings/team/[memberId]: rol O avisos, nunca los dos", () => {
  it("acepta cambiar el rol", () => {
    expect(memberPatchSchema.safeParse({ roleId: "rol_1" }).success).toBe(true);
  });

  it("acepta encender o apagar los avisos", () => {
    expect(memberPatchSchema.safeParse({ receivesInternalNotices: false }).success).toBe(true);
    expect(memberPatchSchema.safeParse({ receivesInternalNotices: true }).success).toBe(true);
  });

  it("rechaza los dos juntos, un valor que no es booleano y el cuerpo vacío", () => {
    expect(
      memberPatchSchema.safeParse({ roleId: "rol_1", receivesInternalNotices: false }).success
    ).toBe(false);
    expect(memberPatchSchema.safeParse({ receivesInternalNotices: "no" }).success).toBe(false);
    expect(memberPatchSchema.safeParse({}).success).toBe(false);
  });

  it("la ruta sigue pidiendo accesos.gestionar y usa el esquema compartido", () => {
    const src = leer("src/app/api/settings/team/[memberId]/route.ts");
    expect(src).toMatch(/PATCH = requireCapability\(\s*"accesos\.gestionar"/);
    expect(src).toContain("memberPatchSchema");
    expect(src).toContain("setMemberInternalNotices");
  });

  it("el servidor escribe acotado a la organización (member no tiene RLS)", () => {
    const src = leer("src/server/team.ts");
    const cuerpo = src.slice(src.indexOf("export async function setMemberInternalNotices"));
    expect(cuerpo).toContain("scoped(schema.member.organizationId, organizationId");
  });
});

describe("migración 0079", () => {
  const sql = leer("drizzle/0079_avisos_internos_por_persona.sql");

  it("agrega la columna con default true", () => {
    expect(sql).toMatch(/ADD COLUMN "receives_internal_notices" boolean DEFAULT true NOT NULL/);
  });

  it("apaga Dirección en el MISMO paso que crea la columna (re-ejecutar no pisa elecciones)", () => {
    const guarda = sql.indexOf("IF NOT EXISTS");
    const alta = sql.indexOf("ADD COLUMN");
    const apagado = sql.indexOf(`UPDATE "member" SET "receives_internal_notices" = false`);
    const fin = sql.indexOf("END IF");
    expect(guarda).toBeGreaterThan(-1);
    expect(alta).toBeGreaterThan(guarda);
    expect(apagado).toBeGreaterThan(alta);
    expect(fin).toBeGreaterThan(apagado);
    expect(sql).toMatch(/WHERE "role" = 'direccion'/);
  });

  it("está en el journal", () => {
    expect(leer("drizzle/meta/_journal.json")).toContain('"0079_avisos_internos_por_persona"');
  });
});

describe("pantalla de Equipo", () => {
  const src = leer("src/components/settings/team-client.tsx");

  it("ofrece el interruptor por persona con su explicación", () => {
    expect(src).toContain("Recibir avisos internos por correo");
    expect(src).toContain(
      "Por ejemplo, grupos sin confirmar. Las copias por área se configuran en"
    );
    expect(src).toContain("receivesInternalNotices");
    expect(src).toContain(`href="/settings/areas"`);
  });

  it("el GET de Equipo devuelve la preferencia", () => {
    expect(leer("src/app/api/settings/team/route.ts")).toContain(
      "receivesInternalNotices: schema.member.receivesInternalNotices"
    );
  });
});
