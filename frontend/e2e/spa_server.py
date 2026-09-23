"""
Servidor estático que reescribe las rutas desconocidas a index.html,
igual que debe hacerlo cualquier hosting para una SPA con React Router.
Sin esto, entrar directo a /lugar/ID devuelve 404.
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RAIZ = os.path.abspath(sys.argv[1])
PUERTO = int(sys.argv[2])


class SPA(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        ruta = super().translate_path(path)
        if os.path.exists(ruta) and not os.path.isdir(ruta):
            return ruta
        if os.path.isdir(ruta) and os.path.exists(os.path.join(ruta, "index.html")):
            return os.path.join(ruta, "index.html")
        return os.path.join(RAIZ, "index.html")

    def log_message(self, *a):
        pass


os.chdir(RAIZ)
ThreadingHTTPServer(("0.0.0.0", PUERTO), SPA).serve_forever()
