import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function cargarEnv() {
  const envPath = join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  const lineas = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const linea of lineas) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const indice = limpia.indexOf("=");
    if (indice === -1) continue;
    const clave = limpia.slice(0, indice).trim();
    const valor = limpia.slice(indice + 1).trim();
    if (!process.env[clave]) process.env[clave] = valor;
  }
}

cargarEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const PORT = Number(process.env.PORT || 3000);

function responder(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(data));
}

async function leerJson(req) {
  const partes = [];
  for await (const parte of req) partes.push(parte);
  const texto = Buffer.concat(partes).toString("utf8");
  return texto ? JSON.parse(texto) : {};
}

async function supabase(path, { method = "GET", body } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en backend/.env");
  }

  const respuesta = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const texto = await respuesta.text();
  const data = texto ? JSON.parse(texto) : null;
  if (!respuesta.ok) {
    const detalle = data?.message || data?.hint || texto || "Error de Supabase";
    throw new Error(detalle);
  }
  return data;
}

async function manejar(req, res) {
  if (req.method === "OPTIONS") return responder(res, 200, { ok: true });

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      return responder(res, 200, { ok: true, servicio: "cafeteria-backend" });
    }

    if (req.method === "GET" && url.pathname === "/api/productos") {
      const productos = await supabase("/productos?select=*,producto_ingredientes(*)");
      return responder(res, 200, productos);
    }

    if (req.method === "POST" && url.pathname === "/api/turnos/abrir") {
      const body = await leerJson(req);
      const turno = await supabase("/turnos", {
        method: "POST",
        body: {
          usuario: body.usuario || "Sin usuario",
          efectivo_inicial: Number(body.efectivo_inicial || 0),
          estado: "abierto"
        }
      });
      return responder(res, 201, turno[0]);
    }

    if (req.method === "GET" && url.pathname === "/api/turnos/abierto") {
      const turnos = await supabase("/turnos?estado=eq.abierto&order=abierto_en.desc&limit=1");
      return responder(res, 200, turnos[0] || null);
    }

    if (req.method === "POST" && url.pathname === "/api/turnos/movimiento") {
      const body = await leerJson(req);
      const movimiento = await supabase("/movimientos_caja", {
        method: "POST",
        body: {
          turno_id: body.turno_id,
          tipo: body.tipo,
          detalle: body.detalle,
          importe: Number(body.importe || 0)
        }
      });
      return responder(res, 201, movimiento[0]);
    }

    if (req.method === "POST" && url.pathname === "/api/ventas") {
      const venta = await leerJson(req);
      const resultado = await supabase("/rpc/registrar_venta_completa", {
        method: "POST",
        body: venta
      });
      return responder(res, 201, resultado);
    }

    if (req.method === "POST" && url.pathname === "/api/facturar") {
      return responder(res, 501, {
        ok: false,
        mensaje: "Facturacion ARCA pendiente. Este endpoint queda reservado para la integracion."
      });
    }

    return responder(res, 404, { ok: false, error: "Ruta no encontrada" });
  } catch (error) {
    return responder(res, 500, { ok: false, error: error.message });
  }
}

http.createServer(manejar).listen(PORT, () => {
  console.log(`Backend cafeteria escuchando en http://localhost:${PORT}`);
});
