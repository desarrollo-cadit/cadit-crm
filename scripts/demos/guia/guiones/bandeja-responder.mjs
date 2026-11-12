/** Bandeja: responder, adjuntar y pasar a una persona. */
export const rol = "coordinacion";
export const ruta = "/inbox";

export async function guion(g) {
  const { page } = g;
  await page.locator("li button", { hasText: "Santiago" }).first().click();
  const caja = page.getByPlaceholder(/Escribí una respuesta/);
  await caja.waitFor({ state: "visible", timeout: 15000 });
  await g.pausa(1);
  g.comenzar();
  await g.paso("Con la conversación abierta, la respuesta se escribe en el compositor", caja, {
    sostener: 4, despues: async () => { await g.escribir(caja, "Hola, con gusto le ayudamos"); },
  });
  await g.paso("El indicador inferior muestra cuánto queda de la ventana de 24 horas", page.getByText(/Ventana abierta/), { sostener: 3.8 });
  await g.paso("Enter o el botón enviar manda el mensaje; si WhatsApp no responde, se muestra el error", page.getByRole("button", { name: "Enviar", exact: true }), {
    accion: "clic", sostener: 4.4,
  });
  await g.paso("El clip adjunta imagen, video, audio o documento; también hay ubicación y contacto", page.getByRole("button", { name: "Adjuntar archivo" }).locator("xpath=.."), { sostener: 4 });
  await g.paso("Fuera de las 24 horas solo se puede enviar una plantilla aprobada", page.getByText(/Ventana abierta/), { sostener: 3.8 });
  await g.paso("El interruptor pausa la IA en esta conversación para atender a una persona", page.getByRole("switch", { name: "IA en esta conversación" }).locator("xpath=ancestor::div[2]"), { sostener: 4.4 });
  await g.paso("Si el agente pasó la conversación a una persona, «Reactivar IA» se la devuelve", page.getByRole("switch", { name: "IA en esta conversación" }), { sostener: 4 });
}
