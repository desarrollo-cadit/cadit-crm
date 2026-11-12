import { fechaDeRecordatorio, type RecordatorioDto } from "@/lib/recordatorios";
import type { ActividadDto } from "@/lib/seguimiento";

/**
 * Lo que el equipo hizo con un contacto, dicho como una línea de sistema en el
 * hilo de la bandeja: notas, «le escribí por…» y recordatorios agendados o
 * resueltos. Es solo para el staff y NUNCA es un mensaje: no existe en
 * `message`, no sale por WhatsApp. Puro: la lectura vive en
 * `eventosDeConversacion` (`src/server/seguimiento.ts`).
 */

export type EventoDelHilo = {
  id: string;
  /** ISO. */
  at: string;
  /** La frase ya armada, lista para mostrar centrada y en gris. */
  texto: string;
};

const quien = (nombre: string | null) => nombre ?? "Alguien del equipo";

const TEXTO_DE_ACTIVIDAD: Record<ActividadDto["kind"], (autor: string, cuerpo: string | null) => string> = {
  nota: (autor, cuerpo) => `${autor} dejó una nota: ${cuerpo ?? ""}`.trim(),
  contacto_email: (autor) => `${autor} le escribió por correo`,
  contacto_whatsapp: (autor) => `${autor} le escribió por WhatsApp`,
};

/** Notas y contactos del seguimiento como eventos del hilo. */
export function eventosDeActividades(actividades: readonly ActividadDto[]): EventoDelHilo[] {
  return actividades.map((a) => ({
    id: `act:${a.id}`,
    at: a.at,
    texto: TEXTO_DE_ACTIVIDAD[a.kind](quien(a.authorName), a.body),
  }));
}

/** Cada recordatorio da un evento al agendarse y otro al resolverse. */
export function eventosDeRecordatorios(recordatorios: readonly RecordatorioDto[]): EventoDelHilo[] {
  return recordatorios.flatMap((r): EventoDelHilo[] => [
    {
      id: `rec:${r.id}`,
      at: r.createdAt,
      texto: `${quien(r.authorName)} agendó un recordatorio para el ${fechaDeRecordatorio(r.dueDate)}: ${r.reason}`,
    },
    ...(r.doneAt
      ? [
          {
            id: `rec:${r.id}:resuelto`,
            at: r.doneAt,
            texto: `${quien(r.doneByName)} resolvió el recordatorio: ${r.reason}`,
          },
        ]
      : []),
  ]);
}

/** Cronológico (lo más viejo primero), como los mensajes. `desde` deja solo lo posterior. */
export function eventosDelHilo(
  actividades: readonly ActividadDto[],
  recordatorios: readonly RecordatorioDto[],
  desde?: Date
): EventoDelHilo[] {
  return [...eventosDeActividades(actividades), ...eventosDeRecordatorios(recordatorios)]
    .filter((e) => !desde || Date.parse(e.at) > desde.getTime())
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
}

export type ItemDelHilo<M extends { createdAt: string }> =
  | { tipo: "mensaje"; at: string; mensaje: M }
  | { tipo: "evento"; at: string; evento: EventoDelHilo };

/**
 * Mensajes y eventos en UN orden cronológico. A igual instante el mensaje va
 * primero (el evento es la respuesta del equipo). Estable: respeta el orden de
 * entrada dentro de cada grupo.
 */
export function mezclarHilo<M extends { createdAt: string }>(
  mensajes: readonly M[],
  eventos: readonly EventoDelHilo[]
): ItemDelHilo<M>[] {
  const items: ItemDelHilo<M>[] = [
    ...mensajes.map((m): ItemDelHilo<M> => ({ tipo: "mensaje", at: m.createdAt, mensaje: m })),
    ...eventos.map((e): ItemDelHilo<M> => ({ tipo: "evento", at: e.at, evento: e })),
  ];
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const t = Date.parse(a.item.at) - Date.parse(b.item.at);
      if (t !== 0) return t;
      if (a.item.tipo !== b.item.tipo) return a.item.tipo === "mensaje" ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.item);
}
