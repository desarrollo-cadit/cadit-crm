import { z } from "zod";
import { buscarEmpresaPorNombre } from "@/lib/company";
import { esIdentidadProvisional, planDeTelefono } from "@/lib/contact-identity";
import type { FilaHistorica } from "@/lib/historial-import/planilla";
import { claveDeCursoTexto, plano } from "@/lib/recorrido-comercial";

/**
 * 046 US6 (FR-015…FR-019; DV-013, DV-014) — El plan de importación del
 * historial, PURO.
 *
 * Es el MISMO para la vista previa (sobre todas las filas, sin escribir) y
 * para cada tanda (sobre sus filas, con el estado de la base en ese momento):
 * lo que la vista previa promete es exactamente lo que se aplica.
 *
 * - Contacto: por correo normalizado; si no, por teléfono; si no, nuevo (una
 *   sola vez aunque aparezca en varias filas).
 * - Completa, nunca pisa: apellido, correo, teléfono y empresa solo si están
 *   vacíos, y un correo o teléfono que ya es de otra persona no se le pone.
 * - Empresa: `buscarEmpresaPorNombre` (igualdad exacta normalizada) o nueva.
 * - Cursada: una por persona, curso (o texto) y día (`dedupKey`).
 */

export const ORIGEN_IMPORTACION = "importacion:planilla-2020-2024";
export const ETIQUETA_FUENTE = "planilla 2020–2024";
export const FILAS_POR_TANDA = 300;

const id = z.string().trim().min(1).max(200);

/** Curso de la planilla → curso del catálogo (null = dejar como texto); vendedor → vendedor (null = sin vendedor). */
export const MapeoSchema = z
  .object({
    cursos: z.record(z.string(), id.nullable()),
    vendedores: z.record(z.string(), id.nullable()),
  })
  .strict();

export type Mapeo = z.infer<typeof MapeoSchema>;

/* ============================================================
 * Sugerencias del paso 1
 * ============================================================ */

/** El curso del catálogo con el mismo nombre (sin tildes ni mayúsculas), si hay uno solo. */
export function sugerirCurso(label: string, catalogo: readonly { id: string; name: string }[]): string | null {
  const buscado = plano(label);
  const iguales = catalogo.filter((c) => plano(c.name) === buscado);
  return iguales.length === 1 ? iguales[0]!.id : null;
}

const unico = (ids: string[]): string | null => (ids.length === 1 ? ids[0]! : null);

/**
 * El vendedor de la planilla: nombre igual, primer nombre igual, o iniciales
 * ("CP" = Cristina Pérez), siempre que sea uno solo. Si hay dudas, nada: lo
 * elige una persona.
 */
export function sugerirVendedor(raw: string, sellers: readonly { id: string; name: string }[]): string | null {
  const buscado = plano(raw);
  if (!buscado) return null;
  const porNombre = unico(sellers.filter((s) => plano(s.name) === buscado).map((s) => s.id));
  if (porNombre) return porNombre;
  const porPrimerNombre = unico(
    sellers.filter((s) => plano(s.name).split(" ")[0] === buscado).map((s) => s.id)
  );
  if (porPrimerNombre) return porPrimerNombre;
  if (/^[a-z]{2,3}$/.test(buscado)) {
    const iniciales = (nombre: string) =>
      plano(nombre)
        .split(" ")
        .map((p) => p[0] ?? "")
        .join("");
    return unico(sellers.filter((s) => iniciales(s.name) === buscado).map((s) => s.id));
  }
  return null;
}

/**
 * Cada curso y cada vendedor distinto de las filas tiene destino, y todo
 * destino es de esta organización. `null` = válido; si no, el motivo.
 */
export function validarMapeo(
  filas: readonly FilaHistorica[],
  mapeo: Mapeo,
  ids: { cursos: ReadonlySet<string>; sellers: ReadonlySet<string> }
): string | null {
  for (const curso of new Set(filas.map((f) => f.curso))) {
    if (!(curso in mapeo.cursos)) return `Falta elegir qué hacer con el curso «${curso}».`;
    const destino = mapeo.cursos[curso];
    if (destino && !ids.cursos.has(destino)) return `El curso elegido para «${curso}» no existe.`;
  }
  for (const vendedor of new Set(filas.map((f) => f.vendedor).filter(Boolean))) {
    if (!(vendedor in mapeo.vendedores)) return `Falta elegir qué hacer con el vendedor «${vendedor}».`;
    const destino = mapeo.vendedores[vendedor];
    if (destino && !ids.sellers.has(destino)) return `El vendedor elegido para «${vendedor}» no existe.`;
  }
  return null;
}

/* ============================================================
 * El plan
 * ============================================================ */

export function dedupKey(contactId: string, courseId: string | null, label: string, fecha: string): string {
  return `${contactId}|${courseId ? `curso:${courseId}` : claveDeCursoTexto(label)}|${fecha}`;
}

export type ContactoParaPlan = {
  id: string;
  firstName: string;
  lastName: string | null;
  /** Normalizado. */
  email: string | null;
  phone: string | null;
  waIdentity: string;
  companyId: string | null;
};

export type EstadoParaPlan = {
  contactos: readonly ContactoParaPlan[];
  empresas: readonly { id: string; legalName: string; tradeName: string | null }[];
  /** Las `dedup_key` que ya existen en la organización. */
  cursadasExistentes: ReadonlySet<string>;
};

/** Una referencia: un id que ya existe, o `nuevo:N` / `empresa:N` a crear. */
export type Ref = string;

export type ContactoNuevo = {
  clave: Ref;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  companyRef: Ref | null;
  source: string;
};

export type CambiosDeContacto = {
  lastName?: string;
  email?: string;
  phone?: string;
  waIdentity?: string;
  companyRef?: Ref;
};

export type CursadaPlaneada = {
  contactRef: Ref;
  courseId: string | null;
  courseLabel: string;
  originalLabel: string | null;
  fecha: string;
  companyRef: Ref | null;
  sellerId: string | null;
  isStudent: boolean;
  edition: string | null;
  note: string | null;
  sourceRow: number;
};

export type PlanDeImportacion = {
  empresasNuevas: { clave: Ref; nombre: string }[];
  contactosNuevos: ContactoNuevo[];
  completar: { contactId: string; cambios: CambiosDeContacto }[];
  cursadas: CursadaPlaneada[];
  conteo: {
    contactos: { crear: number; completar: number; sinCambios: number };
    empresas: { crear: number };
    cursadas: { nuevas: number; yaPresentes: number };
  };
};

export function planDeImportacion(
  filas: readonly FilaHistorica[],
  mapeo: Mapeo,
  estado: EstadoParaPlan
): PlanDeImportacion {
  // Índices de dueños: quién tiene cada correo y cada teléfono (existentes y nuevos).
  const porCorreo = new Map<string, Ref>();
  const porTelefono = new Map<string, Ref>();
  const actuales = new Map<string, ContactoParaPlan>();
  for (const c of estado.contactos) {
    actuales.set(c.id, { ...c });
    if (c.email) porCorreo.set(c.email, c.id);
    if (c.phone) porTelefono.set(c.phone, c.id);
    if (!esIdentidadProvisional(c.waIdentity) && /^\d+$/.test(c.waIdentity)) {
      porTelefono.set(c.waIdentity, c.id);
    }
  }

  const empresasNuevas: { clave: Ref; nombre: string }[] = [];
  const empresaNuevaPorNombre = new Map<string, Ref>();
  const empresaRef = (nombre: string | null): Ref | null => {
    if (!nombre) return null;
    const existente = buscarEmpresaPorNombre(estado.empresas, nombre);
    if (existente) return existente;
    const k = plano(nombre);
    const ya = empresaNuevaPorNombre.get(k);
    if (ya) return ya;
    const clave = `empresa:${empresasNuevas.length + 1}`;
    empresasNuevas.push({ clave, nombre: nombre.trim() });
    empresaNuevaPorNombre.set(k, clave);
    return clave;
  };

  const nuevos = new Map<Ref, ContactoNuevo>();
  const cambios = new Map<string, CambiosDeContacto>();
  const reconocidos = new Set<string>();
  const vistas = new Set<string>(estado.cursadasExistentes);
  const cursadas: CursadaPlaneada[] = [];
  let yaPresentes = 0;

  for (const f of filas) {
    const empresa = empresaRef(f.empresa);
    let ref = (f.correo && porCorreo.get(f.correo)) || (f.telefono && porTelefono.get(f.telefono)) || null;

    if (!ref) {
      ref = `nuevo:${nuevos.size + 1}`;
      nuevos.set(ref, {
        clave: ref,
        firstName: f.nombre,
        lastName: f.apellido,
        email: f.correo,
        phone: f.telefono,
        companyRef: empresa,
        source: ORIGEN_IMPORTACION,
      });
      if (f.correo) porCorreo.set(f.correo, ref);
      if (f.telefono) porTelefono.set(f.telefono, ref);
    } else if (nuevos.has(ref)) {
      // Otra fila de alguien que esta misma importación crea: completa lo vacío.
      const n = nuevos.get(ref)!;
      if (!n.lastName && f.apellido) n.lastName = f.apellido;
      if (!n.email && f.correo && !porCorreo.has(f.correo)) {
        n.email = f.correo;
        porCorreo.set(f.correo, ref);
      }
      if (!n.phone && f.telefono && !porTelefono.has(f.telefono)) {
        n.phone = f.telefono;
        porTelefono.set(f.telefono, ref);
      }
      if (!n.companyRef && empresa) n.companyRef = empresa;
    } else {
      // Un contacto que ya existía: completa, nunca pisa.
      reconocidos.add(ref);
      const c = actuales.get(ref)!;
      const cc = cambios.get(ref) ?? {};
      if (!c.lastName && f.apellido) {
        c.lastName = cc.lastName = f.apellido;
      }
      if (!c.email && f.correo && !porCorreo.has(f.correo)) {
        c.email = cc.email = f.correo;
        porCorreo.set(f.correo, ref);
      }
      if (!c.phone && f.telefono && !porTelefono.has(f.telefono)) {
        const tel = planDeTelefono({ phone: c.phone, waIdentity: c.waIdentity }, f.telefono);
        if (tel.tipo === "agregar") {
          c.phone = cc.phone = tel.phone;
          if (tel.waIdentity !== c.waIdentity) c.waIdentity = cc.waIdentity = tel.waIdentity;
          porTelefono.set(f.telefono, ref);
        }
      }
      if (!c.companyId && empresa) {
        c.companyId = empresa;
        cc.companyRef = empresa;
      }
      if (Object.keys(cc).length > 0) cambios.set(ref, cc);
    }

    const courseId = mapeo.cursos[f.curso] ?? null;
    const clave = dedupKey(ref, courseId, f.curso, f.fecha);
    if (vistas.has(clave)) {
      yaPresentes++;
      continue;
    }
    vistas.add(clave);
    cursadas.push({
      contactRef: ref,
      courseId,
      courseLabel: f.curso,
      originalLabel: f.cursoOriginal,
      fecha: f.fecha,
      companyRef: empresa,
      sellerId: f.vendedor ? (mapeo.vendedores[f.vendedor] ?? null) : null,
      isStudent: f.estudiante,
      edition: f.edicion,
      note: f.nota,
      sourceRow: f.fila,
    });
  }

  const completar = [...cambios.entries()].map(([contactId, c]) => ({ contactId, cambios: c }));
  return {
    empresasNuevas,
    contactosNuevos: [...nuevos.values()],
    completar,
    cursadas,
    conteo: {
      contactos: {
        crear: nuevos.size,
        completar: completar.length,
        sinCambios: [...reconocidos].filter((idc) => !cambios.has(idc)).length,
      },
      empresas: { crear: empresasNuevas.length },
      cursadas: { nuevas: cursadas.length, yaPresentes },
    },
  };
}
