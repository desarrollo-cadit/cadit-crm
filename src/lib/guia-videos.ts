import type { Capability } from "@/lib/capabilities";
import { GUIA_VIDEOS } from "@/lib/guia-videos.data";

/**
 * Los mini-tutoriales en video de la guía. Puro: no toca el disco.
 *
 * El manifiesto (`guia-videos.data.ts`) se genera desde el catálogo de
 * `scripts/demos/guia/`. Qué archivos hay publicados lo decide el volumen en
 * tiempo de ejecución (`src/server/guia-videos.ts`), no este módulo: un video
 * del manifiesto sin archivo simplemente no se ofrece.
 */

export type AudienciaDeVideo = "staff" | "profesor" | "alumno" | "publico";

export type GuiaVideo = {
  id: string;
  titulo: string;
  /** Sección de la guía: "Comercial", "Portal del alumno"… */
  grupo: string;
  audiencia: AudienciaDeVideo;
  /** Capacidades que enseña el video; quien no las tiene no lo ve (staff). */
  requiere: readonly Capability[];
  orden: number;
};

export { GUIA_VIDEOS };

export function videoPorId(id: string): GuiaVideo | undefined {
  return GUIA_VIDEOS.find((v) => v.id === id);
}

/**
 * Los videos del staff que esta cuenta puede usar: los que no exigen nada y
 * los que exigen capacidades que SÍ tiene. Se decide con las capacidades de la
 * sesión (nunca con el nombre del rol: los roles se editan en `/settings/roles`).
 */
export function videosParaStaff(capacidades: readonly string[], disponibles?: ReadonlySet<string>): GuiaVideo[] {
  return GUIA_VIDEOS.filter(
    (v) =>
      v.audiencia === "staff" &&
      v.requiere.every((c) => capacidades.includes(c)) &&
      (!disponibles || disponibles.has(v.id))
  );
}

export function videosDeAudiencia(audiencia: "alumno" | "profesor", disponibles?: ReadonlySet<string>): GuiaVideo[] {
  return GUIA_VIDEOS.filter((v) => v.audiencia === audiencia && (!disponibles || disponibles.has(v.id)));
}

/** Agrupa preservando el orden del catálogo y descarta los grupos vacíos. */
export function agruparVideos(videos: readonly GuiaVideo[]): { grupo: string; videos: GuiaVideo[] }[] {
  const grupos: { grupo: string; videos: GuiaVideo[] }[] = [];
  for (const v of [...videos].sort((a, b) => a.orden - b.orden)) {
    const g = grupos.find((x) => x.grupo === v.grupo);
    if (g) g.videos.push(v);
    else grupos.push({ grupo: v.grupo, videos: [v] });
  }
  return grupos;
}
