import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  contarAjenos,
  type AliasDeCorreo,
  type RefDePersona,
  type TitularParaAjenos,
} from "@/lib/autodesk-import/conciliacion";
import { licenciaDeProfesorOcupada, licenciaOcupada } from "@/lib/license-rules";

/**
 * 0091 — Los asientos que Autodesk tiene ocupados y el campus NO cuenta.
 *
 * La última importación de cada equipo es una foto de Autodesk. Cada fila
 * (correo, programa) que no tiene un titular que ocupe asiento en el campus
 * —un externo, o alguien a quien falta marcarle la licencia— es un asiento real
 * que ya no está libre: se le resta al disponible para que el campus no
 * prometa una licencia que Autodesk ya dio. Es la cuenta de `contarAjenos`.
 *
 * Lo llama `availableLicenses`, que corre en cada asignación. Por eso va por
 * `db.execute` con SQL directo (3 lecturas chicas, y UNA sola, vacía, si el
 * equipo nunca importó nada) y no suma consultas al armado de cada pantalla.
 * Las fechas viajan como milisegundos (`extract(epoch …)`): el driver devuelve
 * los timestamps de `execute` como texto, y una zona mal leída movería el día
 * en que termina un curso.
 *
 * Solo equipos activos: un equipo archivado no resta nada.
 */

type Filas<T> = T[];

function filasDe<T>(resultado: unknown): Filas<T> {
  if (Array.isArray(resultado)) return resultado as T[];
  const rows = (resultado as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

const lista = (valores: readonly string[]): SQL =>
  sql.join(
    valores.map((v) => sql`${v}`),
    sql`, `
  );

const ms = (v: number | string | null | undefined): Date | null =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? null : new Date(Number(v));

/** Cuántos asientos ajenos hay por `claveDeStock(equipo, programa)`. */
export async function asientosAjenos(
  organizationId: string,
  filtro: { teamId?: string; softwareId?: string } = {}
): Promise<Map<string, number>> {
  const db = getDb();

  // 1) La última importación de cada equipo activo.
  const snapshot = filasDe<{ teamId: string; softwareId: string; email: string }>(
    await db.execute(sql`
      select r.team_id as "teamId", r.software_id as "softwareId", r.email as "email"
      from license_import_row r
      join license_import_batch b on b.id = r.batch_id
      join license_team tm on tm.id = r.team_id and tm.archived_at is null
      where r.organization_id = ${organizationId}
        and b.id = (
          select b2.id from license_import_batch b2
          where b2.team_id = b.team_id
          order by b2.uploaded_at desc, b2.id desc
          limit 1
        )
        ${filtro.teamId ? sql`and r.team_id = ${filtro.teamId}` : sql``}
        ${filtro.softwareId ? sql`and r.software_id = ${filtro.softwareId}` : sql``}
    `)
  );
  if (snapshot.length === 0) return new Map();

  const equipos = [...new Set(snapshot.map((s) => s.teamId))];
  const programas = [...new Set(snapshot.map((s) => s.softwareId))];
  const correos = [...new Set(snapshot.map((s) => s.email))];

  // 2) Quién tiene hoy una licencia asignada en esos equipos y programas.
  const tenencias = filasDe<{
    teamId: string;
    softwareId: string;
    teacherId: string | null;
    contactId: string | null;
    expiresMs: number | null;
    startMs: number | null;
    endMs: number | null;
    licenseEmail: string | null;
    parentLicenseEmail: string | null;
    contactEmail: string | null;
    teacherEmail: string | null;
  }>(
    await db.execute(sql`
      select l.team_id as "teamId", l.software_id as "softwareId",
        l.teacher_id as "teacherId", e.contact_id as "contactId",
        (extract(epoch from l.expires_at) * 1000)::float8 as "expiresMs",
        (extract(epoch from ch.start_date) * 1000)::float8 as "startMs",
        (extract(epoch from ch.end_date) * 1000)::float8 as "endMs",
        e.license_email as "licenseEmail", m.license_email as "parentLicenseEmail",
        c.email as "contactEmail", t.email as "teacherEmail"
      from license l
      left join enrollment e on e.id = l.enrollment_id
      left join enrollment m on m.id = e.parent_enrollment_id
      left join contact c on c.id = e.contact_id
      left join teacher t on t.id = l.teacher_id
      left join cohort ch on ch.id = e.cohort_id
      where l.organization_id = ${organizationId}
        and l.assigned = true
        and l.team_id in (${lista(equipos)})
        and l.software_id in (${lista(programas)})
    `)
  );

  // 3) Los correos que alguien vinculó a mano a una persona.
  const alias: AliasDeCorreo[] = filasDe<{
    email: string;
    contactId: string | null;
    teacherId: string | null;
  }>(
    await db.execute(sql`
      select email as "email", contact_id as "contactId", teacher_id as "teacherId"
      from license_email_alias
      where organization_id = ${organizationId} and email in (${lista(correos)})
    `)
  ).flatMap((a): AliasDeCorreo[] => {
    const ref: RefDePersona | null = a.contactId
      ? { tipo: "alumno", contactId: a.contactId }
      : a.teacherId
        ? { tipo: "profesor", teacherId: a.teacherId }
        : null;
    return ref ? [{ email: a.email.toLowerCase(), ref }] : [];
  });

  const ahora = new Date();
  const titulares: TitularParaAjenos[] = tenencias.flatMap((t): TitularParaAjenos[] => {
    const ref: RefDePersona | null = t.teacherId
      ? { tipo: "profesor", teacherId: t.teacherId }
      : t.contactId
        ? { tipo: "alumno", contactId: t.contactId }
        : null;
    if (!ref) return [];
    const vence = ms(t.expiresMs);
    const ocupa = t.teacherId
      ? licenciaDeProfesorOcupada({ assigned: true, expiresAt: vence }, ahora)
      : licenciaOcupada(
          { assigned: true, expiresAt: vence },
          { startDate: ms(t.startMs), endDate: ms(t.endMs) },
          ahora
        );
    return [
      {
        teamId: t.teamId,
        softwareId: t.softwareId,
        ocupa,
        ref,
        correos: [t.licenseEmail, t.parentLicenseEmail, t.contactEmail, t.teacherEmail]
          .filter((c): c is string => Boolean(c))
          .map((c) => c.trim().toLowerCase()),
      },
    ];
  });

  return contarAjenos(
    snapshot.map((s) => ({ ...s, email: s.email.toLowerCase() })),
    titulares,
    alias
  );
}

/** De cuándo es la foto de cada equipo (la última importación), para decirlo en pantalla. */
export async function fotosDeLosEquipos(organizationId: string): Promise<Map<string, Date>> {
  const filas = filasDe<{ teamId: string; uploadedMs: number }>(
    await getDb().execute(sql`
      select b.team_id as "teamId", (extract(epoch from max(b.uploaded_at)) * 1000)::float8 as "uploadedMs"
      from license_import_batch b
      where b.organization_id = ${organizationId}
      group by b.team_id
    `)
  );
  return new Map(filas.map((f) => [f.teamId, new Date(Number(f.uploadedMs))] as const));
}
