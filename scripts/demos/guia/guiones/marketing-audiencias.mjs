/** Marketing: una audiencia, sus filtros, los excluidos por motivo y el tope de 500. */

import { apiComo, exigir, sufijo } from "../datos.mjs";

/* Dato de apoyo: una audiencia por origen, grande a propósito para mostrar excluidos y el tope. */
const suf = sufijo();
const { api } = await apiComo("coordinacion");
const opciones = exigir("opciones de filtros", await api("/api/marketing/audiences/options"));
const origen = opciones.sources.find((x) => x.value.startsWith("importacion:planilla")) ?? opciones.sources[0];
const nombre = `Contactos de la planilla ${suf}`;
exigir(
  "alta de la audiencia",
  await api("/api/marketing/audiences", {
    method: "POST",
    body: JSON.stringify({ name: nombre, filters: { v: 1, sources: [origen.value] } }),
  })
);

export const rol = "coordinacion";
export const ruta = "/marketing?tab=audiencias";

export async function guion(g) {
  const { page } = g;
  const fila = page.getByRole("link", { name: new RegExp(nombre) });
  const resultado = page.locator("section[aria-label='A quién le llegaría']");

  await g.paso(
    "Marketing reúne campañas, audiencias y recompra",
    page.getByRole("navigation", { name: "Secciones de Marketing" }),
    { sostener: 3 }
  );

  await g.paso("Una audiencia es un conjunto de filtros que se recalcula cada vez", fila.locator("xpath=ancestor::ul[1]"), {
    sostener: 3.6,
  });

  await g.paso("Al abrirla, los filtros quedan a la izquierda", fila, {
    accion: "clic",
    sostener: 3,
    despues: async () => {
      await page.getByRole("heading", { name: nombre }).waitFor();
      await resultado.getByText(/persona/).first().waitFor();
    },
  });

  await g.paso(
    "Origen, etapa, grupo, curso y empresa filtran por la ficha del contacto",
    page.locator("section[aria-label='Filtros']"),
    { sostener: 4 }
  );

  await g.paso(
    "El historial de cursos filtra por tipo de contacto y por lo que de verdad cursó",
    page.getByText("Historial de cursos", { exact: true }).locator("xpath=ancestor::fieldset[1]"),
    { sostener: 4.4 }
  );

  await g.paso(
    "A la derecha, a cuántas personas llegaría y cuántas se excluyen y por qué",
    resultado.locator("xpath=./div[1]"),
    { sostener: 4.6 }
  );

  await g.paso(
    "Se excluye a quien se dio de baja, no tiene correo, está archivado, es de prueba o está duplicado",
    resultado.locator("xpath=./div[1]"),
    { sostener: 4.6 }
  );

  await g.paso(
    "Cada campaña admite hasta 500 personas: si la audiencia lo supera, hay que acotar los filtros",
    resultado.getByText(/Supera el tope/),
    { sostener: 4.6 }
  );
}
