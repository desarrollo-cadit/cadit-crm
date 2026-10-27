import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TABLAS_SIMPLES, lineasDeConteos } from "@/lib/contact-merge";

/**
 * 0080 — Asistencia sugerida desde Zoom: la migración y lo que la acompaña.
 */

const raiz = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(raiz, p), "utf8").replace(/\r\n/g, "\n");
const sql = leer("drizzle/0080_asistencia_zoom.sql");

const TABLAS = [
  "zoom_attendance_fetch",
  "zoom_participant_segment",
  "zoom_participant_alias",
  "zoom_attendance_settings",
];

describe("migración 0080", () => {
  it.each(TABLAS)("%s nace con RLS y tenant_isolation", (tabla) => {
    expect(sql).toContain(`alter table "${tabla}" enable row level security`);
    expect(sql).toContain(`create policy tenant_isolation on "${tabla}"`);
  });

  it("es re-ejecutable: nada de CREATE TABLE / ADD COLUMN sin guarda", () => {
    expect(sql).not.toMatch(/create table "(?!.*if not exists)/i);
    expect(sql).not.toMatch(/CREATE TABLE "/);
    expect(sql).toMatch(/add column if not exists "source" text/);
    expect(sql).toMatch(/add column if not exists "zoom_minutes" integer/);
  });

  it("la marca guarda de dónde vino: manual o zoom (NULL = histórico)", () => {
    expect(sql).toContain(`check ("source" is null or "source" in ('manual','zoom'))`);
  });

  it("re-traer no duplica tramos y un alias es único por llave en la organización", () => {
    expect(sql).toContain(
      `"zoom_participant_segment_fetch_uq" on "zoom_participant_segment" using btree ("fetch_id","zoom_participant_id","join_time")`
    );
    expect(sql).toContain(
      `"zoom_participant_alias_org_key_uq" on "zoom_participant_alias" using btree ("organization_id","key_kind","key")`
    );
  });

  it("los tramos crudos no guardan IP, ubicación ni dispositivo", () => {
    const tabla = sql.slice(
      sql.indexOf(`create table if not exists "zoom_participant_segment"`),
      sql.indexOf(`alter table "attendance"`)
    );
    for (const prohibido of ["ip_address", "location", "device", "pc_name", "mac", "version"]) {
      expect(tabla).not.toContain(prohibido);
    }
  });

  it("umbrales de fábrica: 50 % con piso de 20 minutos y sin tarde", () => {
    expect(sql).toContain(`"min_pct" integer default 50 not null`);
    expect(sql).toContain(`"min_minutes" integer default 20 not null`);
    expect(sql).toMatch(/"late_minutes" integer,/);
  });

  it("borrar el contacto borra lo aprendido; ignorar nunca apunta a alguien", () => {
    expect(sql).toMatch(
      /zoom_participant_alias_contact_id_contact_id_fk"\n\s+foreign key \("contact_id"\) references "public"\."contact"\("id"\) on delete cascade/
    );
    expect(sql).toContain(`check (not "ignorar" or "contact_id" is null)`);
  });
});

describe("unificar contactos mueve lo aprendido de Zoom", () => {
  it("zoom_participant_alias es una tabla simple (solo cambia de contacto)", () => {
    expect(TABLAS_SIMPLES).toContain("zoom_participant_alias");
  });

  it("la vista previa lo cuenta", () => {
    const base = {
      inscripciones: 0,
      conversaciones: 0,
      mensajes: 0,
      cuentaDelPortal: 0,
      accesosOffline: 0,
      progreso: 0,
      intentos: 0,
      reconocimientos: 0,
      historial: 0,
      seguimiento: 0,
      campanas: 0,
      bajas: 0,
      avisos: 0,
      derivaciones: 0,
      registro: 0,
      nombresDeZoom: 2,
    };
    expect(lineasDeConteos(base)).toEqual(["2 nombres aprendidos de Zoom"]);
  });
});
