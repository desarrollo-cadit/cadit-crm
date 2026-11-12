/** Pipeline: mover una tarjeta de etapa. */
export const rol = "direccion";
export const ruta = "/pipeline";

export async function guion(g) {
  const { page } = g;
  const tarjeta = page.locator("div.cursor-grab").first();
  const nombre = (await tarjeta.locator("p").first().innerText()).trim();
  const columna = (n) => page.locator("div.rounded-lg.border.bg-card.w-64", { has: page.getByText(n, { exact: true }) }).first();
  const arrastrar = async (desde, hasta) => {
    const a = await desde.boundingBox();
    const b = await hasta.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2, { steps: 5 });
    await page.mouse.move(b.x + b.width / 2, b.y + 120, { steps: 30 });
    await page.mouse.up();
  };

  await g.paso("Cada tarjeta es un interesado y está en la etapa donde se encuentra", tarjeta, { sostener: 3.4 });
  await g.paso("Para avanzar, se arrastra la tarjeta hasta la columna de la etapa siguiente", columna("En conversación"), {
    sostener: 4.6,
    despues: async () => { await arrastrar(tarjeta, columna("En conversación")); await g.pausa(1.5); },
  });
  await g.paso("El cambio se guarda en el acto y los contadores de las columnas se actualizan", columna("En conversación"), { sostener: 4 });
  await g.paso("Se puede devolver a la etapa anterior de la misma manera", columna("Nuevo"), {
    sostener: 4,
    despues: async () => {
      await arrastrar(columna("En conversación").locator("div.cursor-grab").first(), columna("Nuevo"));
      await g.pausa(1.5);
    },
  });
  await g.paso("Mover tarjetas requiere el permiso de seguimiento; sin él, el tablero es solo de lectura", null, { sostener: 3.8 });
  void nombre;
}
