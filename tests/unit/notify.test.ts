import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Toasts — el aviso de un EVENTO ("se guardó", "no se pudo enviar").
 *
 * `notify` es la única puerta a `sonner`: duraciones, botón de cierre y
 * enlace de acción se deciden en un solo lugar, y el resto de la app no
 * conoce la librería.
 */

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

import { notify, setNotifyNavigator, TOAST_DURATION } from "@/lib/notify";

beforeEach(() => {
  for (const fn of Object.values(toast)) fn.mockReset();
  setNotifyNavigator(null);
});

describe("notify — duraciones por gravedad", () => {
  it("éxito ~4s, advertencia ~6s, error ~8s", () => {
    expect(TOAST_DURATION.success).toBe(4000);
    expect(TOAST_DURATION.info).toBe(4000);
    expect(TOAST_DURATION.warning).toBe(6000);
    expect(TOAST_DURATION.error).toBe(8000);
  });

  it("cada tipo llama a sonner con su duración", () => {
    notify.success("Guardado");
    notify.warning("Ojo");
    notify.error("Falló");
    notify.info("Dato");
    expect(toast.success).toHaveBeenCalledWith(
      "Guardado",
      expect.objectContaining({ duration: 4000 })
    );
    expect(toast.warning).toHaveBeenCalledWith(
      "Ojo",
      expect.objectContaining({ duration: 6000 })
    );
    expect(toast.error).toHaveBeenCalledWith(
      "Falló",
      expect.objectContaining({ duration: 8000 })
    );
    expect(toast.info).toHaveBeenCalledWith(
      "Dato",
      expect.objectContaining({ duration: 4000 })
    );
  });

  it("los errores y advertencias se pueden cerrar a mano", () => {
    notify.error("Falló");
    notify.warning("Ojo");
    expect(toast.error.mock.calls[0]![1]).toMatchObject({ closeButton: true });
    expect(toast.warning.mock.calls[0]![1]).toMatchObject({ closeButton: true });
  });

  it("un error puede quedarse hasta que lo cierren", () => {
    notify.error("Falló", { persist: true });
    expect(toast.error.mock.calls[0]![1]).toMatchObject({ duration: Infinity });
  });

  it("pasa descripción e id (para no apilar el mismo aviso)", () => {
    notify.success("Listo", { description: "3 clases", id: "sync" });
    expect(toast.success.mock.calls[0]![1]).toMatchObject({
      description: "3 clases",
      id: "sync",
    });
  });
});

describe("notify — enlace de acción", () => {
  it("navega con el navegador registrado por el Toaster", () => {
    const go = vi.fn();
    setNotifyNavigator(go);
    notify.warning("No hay aulas vinculadas a Zoom", {
      action: { label: "Configurar", href: "/settings/zoom" },
    });
    const opts = toast.warning.mock.calls[0]![1] as {
      action: { label: string; onClick: () => void };
    };
    expect(opts.action.label).toBe("Configurar");
    opts.action.onClick();
    expect(go).toHaveBeenCalledWith("/settings/zoom");
  });

  it("sin acción no manda `action`", () => {
    notify.success("Listo");
    expect(toast.success.mock.calls[0]![1]).not.toHaveProperty("action");
  });
});

describe("notify — sonner tiene una sola puerta", () => {
  /**
   * Si una pantalla importa `sonner` directo, las duraciones, el cierre y el
   * estilo por tokens dejan de ser una garantía: alcanza un `toast("…")`
   * suelto para que aparezca un aviso con la piel por defecto de la librería.
   */
  it("solo el wrapper y el Toaster importan sonner", () => {
    const PERMITIDOS = ["src/lib/notify.ts", "src/components/ui/toaster.tsx"];
    const infractores: string[] = [];
    const recorrer = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) recorrer(full);
        else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) {
          const rel = path.relative(process.cwd(), full).replace(/\\/g, "/");
          if (PERMITIDOS.includes(rel)) continue;
          if (/from\s+["']sonner["']|import\(\s*["']sonner["']\s*\)|require\(\s*["']sonner["']\s*\)/.test(
            readFileSync(full, "utf8")
          )) {
            infractores.push(rel);
          }
        }
      }
    };
    recorrer(path.join(process.cwd(), "src"));
    expect(infractores, `importan sonner directo:\n${infractores.join("\n")}`).toEqual([]);
  });

  it("el Toaster está montado en los tres caparazones", () => {
    for (const layout of [
      "src/app/(app)/layout.tsx",
      "src/app/(portal)/layout.tsx",
      "src/app/(auth)/layout.tsx",
    ]) {
      const src = readFileSync(path.join(process.cwd(), layout), "utf8");
      expect(src, layout).toMatch(/<AppToaster\b/);
    }
  });

  it("el Toaster usa la piel por tokens, no la de la librería", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/ui/toaster.tsx"),
      "utf8"
    );
    expect(src).toMatch(/unstyled:\s*true/);
    expect(src).not.toMatch(/richColors/);
  });
});
