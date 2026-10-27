import { count, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { Umbrales } from "@/lib/zoom-attendance";
import { progresoDeTraidas, type ProgresoDeTraidas } from "@/lib/zoom-attendance-estado";
import { currentRun } from "./lease";
import { umbralesDeLaOrganizacion } from "./attendance-review";

/**
 * Asistencia sugerida desde Zoom — Configuración › Zoom: umbrales, el avance
 * de "clases pasadas sin asistencia" y los nombres aprendidos (con
 * "Olvidar"). Todo por organización (`scoped()` + RLS).
 */

export type AjustesDeAsistenciaDto = {
  umbrales: Umbrales;
  progreso: ProgresoDeTraidas;
  enCurso: boolean;
};

export async function ajustesDeAsistencia(organizationId: string): Promise<AjustesDeAsistenciaDto> {
  const f = schema.zoomAttendanceFetch;
  const filas = await getDb()
    .select({ status: f.status, confirmada: sql<boolean>`${f.reviewedAt} is not null`, n: count() })
    .from(f)
    .where(scoped(f.organizationId, organizationId))
    .groupBy(f.status, sql`${f.reviewedAt} is not null`);
  const progreso = progresoDeTraidas(
    filas.map((r) => ({ status: r.status, confirmada: Boolean(r.confirmada), n: Number(r.n) }))
  );
  return {
    umbrales: await umbralesDeLaOrganizacion(organizationId),
    progreso,
    enCurso: (await currentRun(organizationId)) !== null,
  };
}

export async function guardarUmbrales(organizationId: string, userId: string, u: Umbrales): Promise<Umbrales> {
  const t = schema.zoomAttendanceSettings;
  const valores = {
    minPct: u.minPct,
    minMinutes: u.minMinutes,
    lateMinutes: u.lateMinutes,
    updatedBy: userId,
    updatedAt: new Date(),
  };
  await getDb()
    .insert(t)
    .values({ organizationId, ...valores })
    .onConflictDoUpdate({ target: t.organizationId, set: valores });
  return { minPct: u.minPct, minMinutes: u.minMinutes, lateMinutes: u.lateMinutes };
}

export type NombreAprendidoDto = {
  id: string;
  tipo: "correo" | "usuario_zoom" | "registrante" | "nombre";
  /** Lo que se muestra: el nombre visible con el que apareció. */
  nombreEnZoom: string;
  /** La llave (correo o nombre normalizado; el id de Zoom no se muestra entero). */
  llave: string;
  contactId: string | null;
  contacto: string | null;
  ignorar: boolean;
  confirmaciones: number;
  rechazos: number;
  ultimoUso: string | null;
};

const LIMITE = 200;

export async function nombresAprendidos(
  organizationId: string,
  opts: { q?: string } = {}
): Promise<NombreAprendidoDto[]> {
  const a = schema.zoomParticipantAlias;
  const c = schema.contact;
  const q = opts.q?.trim();
  const filtro = q
    ? or(
        ilike(a.label, `%${q}%`),
        ilike(a.key, `%${q}%`),
        ilike(c.firstName, `%${q}%`),
        ilike(c.lastName, `%${q}%`)
      )
    : undefined;
  const filas = await getDb()
    .select({
      id: a.id,
      keyKind: a.keyKind,
      key: a.key,
      label: a.label,
      contactId: a.contactId,
      firstName: c.firstName,
      lastName: c.lastName,
      ignorar: a.ignorar,
      confirmations: a.confirmations,
      rejections: a.rejections,
      lastUsedAt: a.lastUsedAt,
    })
    .from(a)
    .leftJoin(c, eq(c.id, a.contactId))
    // Solo lo que dice algo: a quién apunta o que se ignora (las filas que
    // solo recuerdan a quién NO es no se listan).
    .where(scoped(a.organizationId, organizationId, or(eq(a.ignorar, true), isNotNull(a.contactId)), filtro))
    .orderBy(desc(a.lastUsedAt))
    .limit(LIMITE);
  return filas.map((f) => ({
      id: f.id,
      tipo: f.keyKind,
      nombreEnZoom: f.label,
      llave: f.keyKind === "usuario_zoom" || f.keyKind === "registrante" ? `…${f.key.slice(-4)}` : f.key,
      contactId: f.contactId,
      contacto: f.firstName ? [f.firstName, f.lastName].filter(Boolean).join(" ") : null,
      ignorar: f.ignorar,
      confirmaciones: f.confirmations,
      rechazos: f.rejections,
      ultimoUso: f.lastUsedAt?.toISOString() ?? null,
    }));
}

/** "Olvidar": borra lo aprendido de esa llave. */
export async function olvidarNombre(organizationId: string, id: string): Promise<boolean> {
  const a = schema.zoomParticipantAlias;
  const borradas = await getDb()
    .delete(a)
    .where(scoped(a.organizationId, organizationId, eq(a.id, id)))
    .returning({ id: a.id });
  return borradas.length > 0;
}
