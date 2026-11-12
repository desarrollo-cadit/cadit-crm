import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import {
  CAPABILITIES,
  sessionCapabilities,
  type Capability,
} from "@/lib/capabilities";
import {
  GuiaClient,
  type GrupoAjeno,
  type GrupoDeFunciones,
  type SeccionDeVideos,
} from "@/components/guia/guia-client";
import {
  agruparCapacidades,
  caminoVisible,
  GUIA_CAPACIDADES,
  hrefDeLaGuia,
} from "@/lib/guia";
import { agruparVideos, videosParaStaff } from "@/lib/guia-videos";
import { PESTANAS_GUIA, type PestanaGuia } from "@/lib/pestanas";
import { leerPestana } from "@/lib/tab-param";
import { videosDisponibles } from "@/server/guia-videos";
import { listRoles } from "@/server/roles";

export const dynamic = "force-dynamic";

/**
 * 027 (US1) — La guía del staff: qué puedo hacer y dónde está cada cosa.
 *
 * El sistema ya sabía perfectamente qué puede hacer cada persona —lo decide en
 * cada request, con `requireCapability`— y no se lo decía a nadie. La
 * información existía, estaba tipada, y sólo se usaba para negar.
 *
 * Se arma con las capacidades REALES de la sesión, no con el nombre del rol:
 * los roles se renombran y se editan desde `/settings/roles`, y una guía que
 * dijera "si sos Coordinación podés…" miente en cuanto alguien toca esa
 * pantalla.
 *
 * FR-005 — El filtro corre acá, en el servidor, con la MISMA fuente que
 * alimenta el menú (`sessionCapabilities`). No se manda el mapa entero al
 * navegador para filtrarlo ahí: el filtro tiene que vivir donde vive la
 * decisión. Al cliente llegan solo textos ya filtrados, nunca capacidades.
 *
 * FR-008 — No exige capacidad. Un manual que hay que tener permiso para leer
 * no es un manual, y quien menos permisos tiene es justamente quien más
 * necesita saber dónde termina lo suyo.
 *
 * La presentación vive en `GuiaClient` (el mismo lenguaje que Académico y
 * Contactos); esta página decide QUÉ se muestra, no cómo.
 */
export default async function GuiaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");

  const mias = sessionCapabilities(session);
  const propias = CAPABILITIES.filter((c) => mias.includes(c));
  const ajenas = CAPABILITIES.filter((c) => !mias.includes(c));

  /**
   * FR-007/FR-014 — La ÚNICA lectura de la pantalla, y no es de dominio: los
   * roles de la organización, para poder decir quién hace lo que yo no hago.
   * Se leen de la base y no del código, así que si el dueño le mueve las
   * capacidades a un rol la guía lo refleja sin que nadie la toque (FR-019).
   */
  const roles = await listRoles(session.organizationId, session.role);
  const rolesCon = (c: Capability) =>
    roles.filter((r) => r.capabilities.includes(c)).map((r) => r.name);

  /**
   * Los tutoriales en video, con la MISMA regla que el resto de la guía: los
   * que enseñan capacidades que esta sesión tiene. Solo se ofrecen los que
   * están publicados en el volumen; sin videos, la pestaña no aparece. La ruta
   * que los sirve vuelve a comprobar las capacidades.
   */
  const videos: SeccionDeVideos[] = agruparVideos(videosParaStaff(mias, await videosDisponibles())).map((s) => ({
    grupo: s.grupo,
    videos: s.videos.map((v) => ({ id: v.id, titulo: v.titulo })),
  }));

  // El «dónde» se DERIVA de la declaración del menú (FR-004): dice «CRM → Bandeja», que es lo
  // que la persona ve en la barra, y no una URL. El enlace «Abrir» solo existe si puede abrirla.
  const funciones: GrupoDeFunciones[] = agruparCapacidades(propias).map((g) => ({
    titulo: g.titulo,
    items: g.capacidades.map((c) => ({
      clave: c,
      que: mayuscula(GUIA_CAPACIDADES[c].que),
      donde: caminoVisible(GUIA_CAPACIDADES[c].donde),
      href: hrefDeLaGuia(GUIA_CAPACIDADES[c].donde, mias),
    })),
  }));

  // FR-007 — Dice QUÉ se puede hacer y QUÉ ROL lo tiene, y nada más. Sin enlace, sin nombres de personas.
  const deOtroRol: GrupoAjeno[] = agruparCapacidades(ajenas).map((g) => ({
    titulo: g.titulo,
    items: g.capacidades.map((c) => ({
      clave: c,
      que: mayuscula(GUIA_CAPACIDADES[c].que),
      roles: rolesCon(c),
    })),
  }));

  const { tab } = await searchParams;
  const visibles: readonly PestanaGuia[] = videos.length > 0 ? PESTANAS_GUIA : ["funciones"];
  const inicial = leerPestana(tab, visibles, visibles[0] ?? "funciones");

  return (
    <div className="h-full">
      <GuiaClient
        inicial={inicial}
        videos={videos}
        baseVideos="/api/guia/videos"
        funciones={funciones}
        ajenas={deOtroRol}
      />
    </div>
  );
}

/**
 * Las descripciones se escriben en infinitivo y en minúscula ("emitir el
 * certificado…") porque así se leen bien adentro de una frase; en una lista
 * arrancan la línea, y ahí una minúscula parece un error de tipeo.
 */
function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
