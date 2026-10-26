import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  coincideConBusqueda,
  digitosDeTelefonoBuscado,
  escaparLike,
  normalizarBusqueda,
  tokensDeBusqueda,
} from "@/lib/contact-search";
import { condicionDeBusqueda } from "@/lib/contact-search-sql";
import { schema } from "@/lib/db";

/**
 * Búsqueda de contactos (2026-10-26) — "Juan Pérez" no encontraba a nadie:
 * el término entero se comparaba contra UNA columna por vez, y el nombre y el
 * apellido viven en columnas distintas. La regla nueva: cada palabra tiene que
 * aparecer en ALGÚN campo, en cualquier orden, sin importar tildes ni
 * mayúsculas.
 */

describe("normalizarBusqueda", () => {
  it("pasa a minúsculas y saca tildes, diéresis, ñ y ç", () => {
    expect(normalizarBusqueda("PÉREZ Güemes Muñoz Çelik")).toBe("perez guemes munoz celik");
  });

  it("trata igual una tilde compuesta (NFD) que una precompuesta", () => {
    expect(normalizarBusqueda("Pérez")).toBe("perez");
  });
});

describe("tokensDeBusqueda", () => {
  it("parte por espacios, normaliza y descarta vacíos", () => {
    expect(tokensDeBusqueda("  Juan   Pérez ")).toEqual(["juan", "perez"]);
  });

  it("no repite palabras", () => {
    expect(tokensDeBusqueda("ana Ana ÁNA")).toEqual(["ana"]);
  });

  it("vacío o solo espacios no es una búsqueda", () => {
    expect(tokensDeBusqueda("   ")).toEqual([]);
  });

  it("tiene tope de palabras (una consulta no crece sin límite)", () => {
    expect(tokensDeBusqueda("a b c d e f g h i j").length).toBeLessThanOrEqual(6);
  });
});

describe("escaparLike", () => {
  it("escapa %, _ y la barra invertida", () => {
    expect(escaparLike("50%_a\\b")).toBe("50\\%\\_a\\\\b");
  });
});

describe("digitosDeTelefonoBuscado", () => {
  it("un número escrito con espacios y ceros locales queda en sus dígitos sin el 0", () => {
    expect(digitosDeTelefonoBuscado("099 123 456")).toBe("99123456");
    expect(digitosDeTelefonoBuscado("+598 99 123 456")).toBe("59899123456");
  });

  it("con letras, o con menos de 3 dígitos, no es un teléfono", () => {
    expect(digitosDeTelefonoBuscado("Juan 099")).toBeNull();
    expect(digitosDeTelefonoBuscado("09")).toBeNull();
  });
});

describe("coincideConBusqueda (en memoria)", () => {
  const juan = { texto: ["Juan", "Pérez", "juan@x.com"], telefono: "59899123456" };

  it("nombre + apellido, en cualquier orden, sin tildes ni mayúsculas", () => {
    expect(coincideConBusqueda("Juan Pérez", juan)).toBe(true);
    expect(coincideConBusqueda("perez juan", juan)).toBe(true);
    expect(coincideConBusqueda("JUAN PEREZ", juan)).toBe(true);
  });

  it("todas las palabras tienen que aparecer", () => {
    expect(coincideConBusqueda("Juan Gómez", juan)).toBe(false);
  });

  it("una palabra puede caer en el correo", () => {
    expect(coincideConBusqueda("juan@x", juan)).toBe(true);
  });

  it("el teléfono se encuentra como se escribe a mano", () => {
    expect(coincideConBusqueda("099 123 456", juan)).toBe(true);
    expect(coincideConBusqueda("99123", juan)).toBe(true);
  });

  it("los campos nulos no rompen", () => {
    expect(coincideConBusqueda("juan", { texto: ["Juan", null, undefined], telefono: null })).toBe(true);
  });

  it("una búsqueda vacía deja pasar todo", () => {
    expect(coincideConBusqueda("  ", juan)).toBe(true);
  });
});

describe("condicionDeBusqueda (SQL)", () => {
  const columnas = {
    texto: [
      schema.contact.firstName,
      schema.contact.lastName,
      schema.contact.email,
    ],
    telefono: schema.contact.phone,
  };
  const render = (q: string) => {
    const cond = condicionDeBusqueda(q, columnas);
    return cond ? new PgDialect().sqlToQuery(cond) : null;
  };

  it("sin palabras no hay condición", () => {
    expect(condicionDeBusqueda("  ", columnas)).toBeUndefined();
  });

  it("una condición por palabra, unidas por AND, y cada una mira todos los campos", () => {
    const q = render("Juan Pérez")!;
    expect(q.params).toContain("%juan%");
    expect(q.params).toContain("%perez%");
    expect(q.sql).toMatch(/\band\b/i);
    expect(q.sql).toContain('"first_name"');
    expect(q.sql).toContain('"last_name"');
    expect(q.sql).toContain('"email"');
  });

  it("compara sin tildes ni mayúsculas (lower + translate, sin extensiones)", () => {
    const q = render("perez")!;
    expect(q.sql).toMatch(/translate\(lower\(/i);
    expect(q.sql).not.toMatch(/unaccent/i);
  });

  it("los comodines del usuario viajan escapados como parámetro", () => {
    const q = render("50%")!;
    expect(q.params).toContain("%50\\%%");
    expect(q.sql).not.toContain("50%");
  });

  it("un número escrito a mano también busca por los dígitos del teléfono", () => {
    const q = render("099 123 456")!;
    expect(q.sql).toContain('"phone"');
    expect(q.params).toContain("%99123456%");
  });
});
