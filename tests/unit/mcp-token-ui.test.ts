import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SETTINGS_TABS } from "@/lib/nav";
import {
  comandoDeConexion,
  datosDeConectorClaudeAi,
  estadoDeToken,
  etiquetaDePerfil,
  nombreDeServidor,
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

describe("tokens de perfil (0095)", () => {
  it("la etiqueta es «Persona» sin rol y el nombre del rol con rol", () => {
    expect(etiquetaDePerfil({ roleName: null })).toBe("Persona");
    expect(etiquetaDePerfil({ roleName: "Ventas" })).toBe("Ventas");
  });

  it("el servidor de Claude Code es «cadit» para una persona y «cadit-<perfil>» para un rol", () => {
    expect(nombreDeServidor()).toBe("cadit");
    expect(nombreDeServidor(null)).toBe("cadit");
    expect(nombreDeServidor("Ventas")).toBe("cadit-ventas");
    expect(nombreDeServidor("Coordinación Académica")).toBe("cadit-coordinacion-academica");
  });

  it("el comando de un perfil lleva su nombre de servidor", () => {
    expect(comandoDeConexion("https://crm.ejemplo.com", TOKEN, "Ventas")).toBe(
      `claude mcp add --transport http cadit-ventas https://crm.ejemplo.com/api/mcp --header "Authorization: Bearer ${TOKEN}"`
    );
  });

  it("los datos del conector de claude.ai: URL de /api/mcp y un solo encabezado Bearer", () => {
    expect(datosDeConectorClaudeAi("https://crm.ejemplo.com/", TOKEN)).toEqual({
      url: "https://crm.ejemplo.com/api/mcp",
      encabezado: "Authorization",
      valor: `Bearer ${TOKEN}`,
    });
  });
});
