import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOGO, RUTAS_SIN_VIDEO } from "../../scripts/demos/guia/catalogo.mjs";
import { construirManifiesto } from "../../scripts/demos/guia/generar-manifiesto.mjs";
import { CAPABILITIES } from "@/lib/capabilities";
import { GUIA_VIDEOS, videosDeAudiencia, videosParaStaff } from "@/lib/guia-videos";

type Video = {
  id: string;
  grupo: string;
  titulo: string;
  audiencia: "staff" | "profesor" | "alumno" | "publico";
  requiere: string[];
  rutas: string[];
  cubre: string;
  estado: string;
};

const videos = CATALOGO as Video[];
const RAIZ = path.resolve(__dirname, "../../src/app");

/** Todas las `page.tsx` de la app, en la forma de ruta (sin grupos de rutas). */
function pantallas(dir = RAIZ, prefijo = ""): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const completo = path.join(dir, nombre);
    if (statSync(completo).isDirectory()) {
      const esGrupo = /^\(.+\)$/.test(nombre);
      salida.push(...pantallas(completo, esGrupo ? prefijo : `${prefijo}/${nombre}`));
    } else if (nombre === "page.tsx") {
      salida.push(prefijo === "" ? "/" : prefijo);
    }
  }
  return salida;
}

describe("catálogo de videos de la guía", () => {
  it("cada video tiene id único, título y qué cubre", () => {
    const ids = videos.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of videos) {
      expect(v.titulo.length, v.id).toBeGreaterThan(5);
      expect(v.cubre.length, v.id).toBeGreaterThan(20);
      expect(v.rutas.length, v.id).toBeGreaterThan(0);
    }
  });

  it("toda pantalla de la app aparece en algún video", () => {
    const cubiertas = new Set(videos.flatMap((v) => v.rutas));
    const sinVideo = pantallas().filter((r) => !cubiertas.has(r) && !(RUTAS_SIN_VIDEO as string[]).includes(r));
    expect(sinVideo, `pantallas sin video: ${sinVideo.join(", ")}`).toEqual([]);
  });

  it("todo video apunta a una pantalla que existe", () => {
    const existentes = new Set(pantallas());
    const inventadas = videos.flatMap((v) => v.rutas.filter((r) => !existentes.has(r)).map((r) => `${v.id}: ${r}`));
    expect(inventadas, `rutas que no existen: ${inventadas.join(", ")}`).toEqual([]);
  });

  it("toda capacidad tiene al menos un video que la enseña", () => {
    const enseñadas = new Set(videos.filter((v) => v.audiencia === "staff").flatMap((v) => v.requiere));
    const sinVideo = CAPABILITIES.filter((c) => !enseñadas.has(c));
    expect(sinVideo, `capacidades sin video: ${sinVideo.join(", ")}`).toEqual([]);
  });

  it("todo video exige capacidades que existen", () => {
    const validas = new Set<string>(CAPABILITIES);
    const malas = videos.flatMap((v) => v.requiere.filter((c) => !validas.has(c)).map((c) => `${v.id}: ${c}`));
    expect(malas).toEqual([]);
  });
});

describe("manifiesto de videos de la app", () => {
  it("está sincronizado con el catálogo (correr scripts/demos/guia/generar-manifiesto.mjs)", () => {
    const esperado = (construirManifiesto() as { id: string; titulo: string; grupo: string; audiencia: string; requiere: string[]; orden: number }[]).map(
      ({ id, titulo, grupo, audiencia, requiere, orden }) => ({ id, titulo, grupo, audiencia, requiere, orden })
    );
    expect(GUIA_VIDEOS.map((v) => ({ ...v, requiere: [...v.requiere] }))).toEqual(esperado);
  });

  it("una cuenta sin capacidades solo ve los videos que no exigen ninguna", () => {
    const vistos = videosParaStaff([]);
    expect(vistos.length).toBeGreaterThan(0);
    expect(vistos.every((v) => v.requiere.length === 0)).toBe(true);
  });

  it("un video de plata no llega a quien no tiene cobranza", () => {
    const sinCobranza = videosParaStaff(CAPABILITIES.filter((c) => !c.startsWith("cobranza.")));
    expect(sinCobranza.some((v) => v.requiere.some((c) => c.startsWith("cobranza.")))).toBe(false);
  });

  it("los videos del portal no entran en la guía del staff y viceversa", () => {
    const staff = new Set(videosParaStaff(CAPABILITIES).map((v) => v.id));
    for (const v of [...videosDeAudiencia("alumno"), ...videosDeAudiencia("profesor")]) {
      expect(staff.has(v.id), v.id).toBe(false);
    }
  });

  it("solo se ofrecen los videos publicados en el volumen", () => {
    const publicados = new Set(["inicio-dashboard"]);
    expect(videosParaStaff(CAPABILITIES, publicados).map((v) => v.id)).toEqual(["inicio-dashboard"]);
  });
});
