/**
 * Recorrido por el panel y la Guía.
 *
 * «Ver como» solo aparece en una cuenta que además es profesor con portal; ninguna
 * cuenta de demostración con sesión guardada lo es, así que no se muestra.
 */

export const rol = "coordinacion";
export const ruta = "/";

export async function guion(g) {
  const { page } = g;

  await g.paso("La barra lateral agrupa las pantallas por equipo y muestra solo las que el rol permite", page.locator("aside nav"), { sostener: 4 });

  await g.paso("El botón de la luna cambia al tema oscuro", page.getByRole("button", { name: "Cambiar a tema oscuro" }), {
    accion: "clic",
    sostener: 3.4,
  });

  await g.paso("Un segundo clic vuelve al tema claro; la elección se recuerda", page.getByRole("button", { name: "Cambiar a tema claro" }), {
    accion: "clic",
    sostener: 3.8,
  });

  await g.paso("La Guía, al pie del menú, está disponible para todas las cuentas", page.getByRole("link", { name: "Guía", exact: true }), {
    accion: "clic",
    sostener: 3.6,
    despues: async () => {
      await page.getByRole("heading", { level: 1 }).first().waitFor({ state: "visible", timeout: 20000 });
      await page.locator("details summary").first().waitFor({ state: "visible", timeout: 20000 });
    },
  });

  await g.paso("Allí se enumera lo que esta cuenta puede hacer y en qué parte del menú", page.locator("section").first(), {
    sostener: 4.2,
  });

  await g.paso("«Esto lo hace otro rol» despliega las funciones que la cuenta no incluye", page.locator("details summary").first(), {
    accion: "clic",
    sostener: 4.2,
  });

  await g.paso("Cada función indica qué rol la tiene, para saber a quién pedirla", page.locator("details").first(), {
    sostener: 4.4,
  });
}
