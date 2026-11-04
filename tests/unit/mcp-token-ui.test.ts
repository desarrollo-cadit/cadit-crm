import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SETTINGS_TABS } from "@/lib/nav";
import {
  comandoDeConexion,
  estadoDeToken,
  ordenarTokens,
  textoDeUltimoUso,
} from "@/lib/mcp-token-ui";

const TOKEN = "cadit_mcp_" + "a".repeat(43);

describe("comandoDeConexion", () => {
  it("arma el comando de Claude Code con el origen y el Bearer", () => {
    expect(comandoDeConexion("https://crm.ejemplo.com", TOKEN)).toBe(
      `claude mcp add --transport http cadit https://crm.ejemplo.com/api/mcp --header "Authorization: Bearer ${TOKEN}"`
    );
  });

  it("no duplica la barra final del origen", () => {
    expect(comandoDeConexion("http://localhost:3000/", TOKEN)).toContain(
      "http://localhost:3000/api/mcp "
    );
  });
});

describe("estado y orden", () => {
  it("un token con revokedAt está revocado", () => {
    expect(estadoDeToken({ revokedAt: null })).toBe("vigente");
    expect(estadoDeToken({ revokedAt: "2026-11-03T10:00:00.000Z" })).toBe("revocado");
  });

  it("ordena vigentes primero y, dentro de cada grupo, el más nuevo arriba", () => {
    const orden = ordenarTokens([
      { id: "a", revokedAt: "2026-11-02T00:00:00.000Z", createdAt: "2026-11-01T00:00:00.000Z" },
      { id: "b", revokedAt: null, createdAt: "2026-10-01T00:00:00.000Z" },
      { id: "c", revokedAt: null, createdAt: "2026-11-01T00:00:00.000Z" },
    ]).map((t) => t.id);
    expect(orden).toEqual(["c", "b", "a"]);
  });

  it("no muta la lista que recibe", () => {
    const original = [
      { revokedAt: "x", createdAt: "1" },
      { revokedAt: null, createdAt: "2" },
    ];
    ordenarTokens(original);
    expect(original[0]!.revokedAt).toBe("x");
  });

  it("dice «Nunca» si el token no se usó", () => {
    expect(textoDeUltimoUso(null, () => "fecha")).toBe("Nunca");
    expect(textoDeUltimoUso("2026-11-03T10:00:00.000Z", () => "fecha")).toBe("fecha");
  });
});

describe("pantalla /settings/mcp", () => {
  it("está en la barra de Configuración con accesos.gestionar, la misma capacidad que la API", () => {
    const tab = SETTINGS_TABS.find((t) => t.href === "/settings/mcp");
    expect(tab).toMatchObject({ label: "Conexión con Claude", capability: "accesos.gestionar" });
  });

  it("la página tiene su propio gate y el cliente no importa el módulo con node:crypto", () => {
    const raiz = path.resolve(__dirname, "../..");
    const pagina = readFileSync(path.join(raiz, "src/app/(app)/settings/mcp/page.tsx"), "utf8");
    expect(pagina).toContain("accesos.gestionar");
    const cliente = readFileSync(path.join(raiz, "src/components/settings/mcp-tokens-client.tsx"), "utf8");
    expect(cliente).not.toMatch(/from "@\/lib\/mcp-token"/);
    expect(cliente).not.toMatch(/from "@\/server\//);
  });
});
