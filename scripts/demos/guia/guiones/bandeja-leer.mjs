/** Bandeja: leer conversaciones de WhatsApp. */
export const rol = "coordinacion";
export const ruta = "/inbox";

export async function guion(g) {
  const { page } = g;
  const fila = (n) => page.locator("li button", { hasText: n }).first();
  await g.paso("La Bandeja lista las conversaciones de WhatsApp, la más reciente arriba", page.locator("section").first(), { sostener: 3.6 });
  await g.paso("El número azul de cada fila indica los mensajes sin leer", fila("Valentina"), { sostener: 3.4 });
  await g.paso("«No leídas» deja solo las conversaciones pendientes", page.getByRole("button", { name: /^No leídas/ }), {
    accion: "clic", sostener: 3.6,
  });
  await g.paso("«Todas» vuelve a mostrar la lista completa", page.getByRole("button", { name: /^Todas/ }), { accion: "clic", sostener: 3 });
  const buscar = page.getByPlaceholder("Buscar conversación…");
  await g.paso("El buscador filtra por nombre, texto del mensaje o teléfono", buscar, {
    sostener: 3.6, despues: async () => { await g.escribir(buscar, "Santiago"); await g.pausa(1); },
  });
  await g.paso("Al elegir una conversación se abre el hilo de mensajes", fila("Santiago"), {
    accion: "clic", sostener: 3.6,
    despues: async () => { await page.getByPlaceholder(/Escribí una respuesta/).waitFor({ state: "visible", timeout: 15000 }); },
  });
  await g.paso("A la derecha, los datos del contacto, su etapa y sus notas", page.getByRole("heading", { name: "Detalles" }).locator("xpath=ancestor::div[2]"), { sostener: 4 });
}
