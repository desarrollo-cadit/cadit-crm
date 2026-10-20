"""Pruebas de las partes puras de respaldo-zoom.py.

Correr en el host (o donde haya python3):  python3 -m unittest test_respaldo_zoom
"""

import importlib.util
import pathlib
import unittest
from datetime import date

_spec = importlib.util.spec_from_file_location(
    "respaldo_zoom", pathlib.Path(__file__).with_name("respaldo-zoom.py")
)
rz = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rz)


class Tramos(unittest.TestCase):
    def test_parte_en_tramos_contiguos_de_30_dias(self):
        t = rz.tramos(date(2026, 1, 1), date(2026, 3, 5))
        self.assertEqual(t[0], ("2026-01-01", "2026-01-30"))
        self.assertEqual(t[1], ("2026-01-31", "2026-03-01"))
        self.assertEqual(t[-1], ("2026-03-02", "2026-03-05"))

    def test_un_solo_dia(self):
        self.assertEqual(rz.tramos(date(2026, 5, 1), date(2026, 5, 1)), [("2026-05-01", "2026-05-01")])


class Nombres(unittest.TestCase):
    def test_limpia_caracteres_que_sharepoint_rechaza(self):
        self.assertEqual(rz.limpiar('Revit: "MEP" / clase #3?'), "Revit MEP clase 3")

    def test_tema_vacio(self):
        self.assertEqual(rz.limpiar(""), "sin-tema")
        self.assertEqual(rz.limpiar("..."), "sin-tema")

    def test_recorta_largos(self):
        self.assertLessEqual(len(rz.limpiar("x" * 300)), 80)

    def test_ruta_lleva_cuenta_fecha_local_tema_e_id_del_archivo(self):
        reunion = {"topic": "Revit Básico", "id": 812345, "start_time": "2026-10-06T21:30:00Z"}
        archivo = {"id": "abc-123", "file_type": "MP4", "file_extension": "MP4", "recording_type": "shared_screen_with_speaker_view"}
        ruta = rz.ruta_del_archivo("Cuenta (aula-1@cadit.edu.uy)", reunion, archivo)
        # 21:30 UTC es 18:30 en Montevideo: la carpeta usa la hora local.
        self.assertEqual(
            ruta,
            "Cuenta (aula-1@cadit.edu.uy)/2026/2026-10/2026-10-06 1830 Revit Básico (812345)/"
            "shared_screen_with_speaker_view__zid-abc-123.mp4",
        )

    def test_sin_extension_usa_el_tipo(self):
        reunion = {"topic": "t", "id": 1, "start_time": "2026-01-01T12:00:00Z"}
        archivo = {"id": "z", "file_type": "CHAT"}
        self.assertTrue(rz.ruta_del_archivo("c", reunion, archivo).endswith("chat__zid-z.chat"))


class YaRespaldados(unittest.TestCase):
    def test_extrae_ids_de_un_listado_recursivo(self):
        listado = [
            "Cuenta/2026/2026-10/2026-10-06 1830 Revit (1)/shared_screen__zid-abc-123.mp4",
            "Cuenta/2026/2026-10/2026-10-06 1830 Revit (1)/audio_only__zid-def.m4a",
            "_corridas/20261020.log",
        ]
        self.assertEqual(rz.ids_respaldados(listado), {"abc-123", "def"})

    def test_el_id_sigue_valiendo_si_cambio_el_tema(self):
        # La dedupe es por id, no por ruta: renombrar la reunión en Zoom no duplica.
        listado = ["c/2026/2026-10/2026-10-06 1830 Tema viejo (1)/x__zid-abc.mp4"]
        self.assertIn("abc", rz.ids_respaldados(listado))


class Tamano(unittest.TestCase):
    def test_solo_video_y_audio_exigen_tamano_exacto(self):
        self.assertTrue(rz.exige_tamano_exacto({"file_type": "MP4"}))
        self.assertTrue(rz.exige_tamano_exacto({"file_type": "m4a"}))
        self.assertFalse(rz.exige_tamano_exacto({"file_type": "SUMMARY"}))
        self.assertFalse(rz.exige_tamano_exacto({"file_type": "TRANSCRIPT"}))


class Pendientes(unittest.TestCase):
    def test_solo_los_completos_que_faltan(self):
        reunion = {
            "recording_files": [
                {"id": "ya", "status": "completed"},
                {"id": "nuevo", "status": "completed"},
                {"id": "procesando", "status": "processing"},
                {"status": "completed"},  # sin id: no se puede deduplicar, se saltea
            ]
        }
        self.assertEqual([a["id"] for a in rz.pendientes(reunion, {"ya"})], ["nuevo"])


if __name__ == "__main__":
    unittest.main()
