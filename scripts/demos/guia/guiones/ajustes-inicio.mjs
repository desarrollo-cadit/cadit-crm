/** Configuración: qué pestañas ve cada rol (Dirección frente a Coordinación). */

import { cookiesDeRol } from "../sesiones.mjs";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3006";

export const rol = "direccion";
export const ruta = "/settings";

export async function guion(g) {
  const { page } = g;
  // La segunda sesión se prepara antes de empezar el video útil.
  const coordinacion = await cookiesDeRol("coordinacion");
  g.comenzar();

  const nav = page.locator("nav.w-44");

  await g.paso(
    "Configuración reúne los ajustes de la instancia, en pestañas a la izquierda",
    page.locator("header").filter({ hasText: "Configuración" }),
    { sostener: 3.4 }
  );

  await g.paso("Con rol Dirección se ven todas las pestañas, de WhatsApp a Conexión con Claude", nav, { sostener: 4 });

  await g.paso("Cada pestaña abre su propia pantalla; por ejemplo, Equipo", nav.getByRole("link", { name: "Equipo", exact: true }), {
    accion: "clic",
    despues: async () => {
      await page.getByRole("heading", { name: "Crear cuenta de equipo" }).waitFor({ timeout: 15000 });
    },
    sostener: 3.2,
  });

  await g.paso("Cada pestaña exige un permiso: la lista depende del rol de la cuenta", nav, { sostener: 3.4 });

  await g.paso("Con una cuenta de Coordinación, la lista cambia", null, {
    despues: async () => {
      await page.context().clearCookies();
      await page.context().addCookies(coordinacion);
      await page.goto(`${BASE}/settings`, { waitUntil: "load" });
      await nav.getByRole("link", { name: "Vendedores" }).waitFor({ timeout: 15000 });
    },
    sostener: 3.2,
  });

  await g.paso("Solo quedan Equipo, Vendedores, Recesos y Conexión con Claude", nav, { sostener: 4 });

  await g.paso("Sin ninguna de esas capacidades, el rol no entra a Configuración", null, { sostener: 3.4 });
}
