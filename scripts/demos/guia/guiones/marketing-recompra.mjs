/** Marketing: la pestaña Recompra (tasa, tiempo entre cursos y qué curso lleva a cuál). */

export const rol = "coordinacion";
export const ruta = "/marketing?tab=recompra";

export async function guion(g) {
  const { page } = g;
  const vista = page.getByRole("region", { name: "Recompra" });
  const tarjeta = (titulo) => page.getByText(titulo, { exact: true }).locator("xpath=..");

  await g.paso("Recompra mide cuánta gente vuelve a comprar después de cursar", vista, { sostener: 3.4 });

  await g.paso(
    "El período se elige arriba: últimos 12 meses, este año, todo o a medida",
    page.getByRole("group", { name: "Período" }),
    {
      accion: "clic",
      sostener: 4,
      despues: async () => {
        await page.getByRole("button", { name: "Todo", exact: true }).click();
        await page.getByText(/volvieron a comprar/).waitFor();
        await g.pausa(1);
      },
    }
  );

  await g.paso("La tasa indica qué parte de quienes cursaron volvió a comprar", tarjeta("Tasa de recompra"), { sostener: 4 });

  await g.paso("El tiempo entre cursos es el promedio de días hasta la siguiente compra", tarjeta("Tiempo entre cursos"), {
    sostener: 4,
  });

  await g.paso("La tabla muestra qué curso lleva a cuál", page.getByRole("table"), { sostener: 4.4 });

  await g.paso(
    "Solo cuenta lo que se dictó, y no se muestran montos",
    page.getByText(/Cuenta lo que se dictó/),
    { sostener: 4 }
  );
}
