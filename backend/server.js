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

const productosBase = [
  { nombre: "Combo desayuno", precio: 3500, categoria: "combos", tipo: "comprado", ingredientes: [] },
  { nombre: "Cafe con leche", precio: 1400, categoria: "bebidas", tipo: "preparado", ingredientes: [{ nombre: "Cafe", gramos: 50 }] },
  { nombre: "Te", precio: 1100, categoria: "bebidas", tipo: "preparado", ingredientes: [{ nombre: "Te", gramos: 5 }] },
  { nombre: "Exprimido naranja", precio: 1800, categoria: "exprimidos", tipo: "preparado", ingredientes: [{ nombre: "Naranja", gramos: 250 }] },
  { nombre: "Tostado", precio: 2600, categoria: "salado", tipo: "comprado", ingredientes: [] },
  { nombre: "Medialuna", precio: 700, categoria: "dulce", tipo: "comprado", ingredientes: [] }
];

function responder(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS,DELETE",
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
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en backend/.env");

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
  if (!respuesta.ok) throw new Error(data?.message || data?.hint || texto || "Error de Supabase");
  return data;
}

function normalizarProducto(producto) {
  return {
    id: producto.id,
    nombre: producto.nombre,
    precio: Number(producto.precio || 0),
    categoria: producto.categoria || "otros",
    tipo: producto.tipo || "comprado",
    ingredientes: (producto.producto_ingredientes || producto.ingredientes || []).map((ingrediente) => ({
      id: ingrediente.id,
      nombre: ingrediente.nombre || ingrediente.ingrediente,
      gramos: Number(ingrediente.gramos || 0)
    }))
  };
}

async function listarProductos() {
  const productos = await supabase("/productos?select=*,producto_ingredientes(*)&order=nombre.asc");
  return productos.map(normalizarProducto);
}

async function crearProducto(producto) {
  const creado = await supabase("/productos", {
    method: "POST",
    body: { nombre: producto.nombre, precio: Number(producto.precio || 0), categoria: producto.categoria || "otros", tipo: producto.tipo || "comprado" }
  });

  const productoId = creado[0].id;
  const ingredientes = producto.tipo === "preparado" ? producto.ingredientes || [] : [];
  if (ingredientes.length) {
    await supabase("/producto_ingredientes", {
      method: "POST",
      body: ingredientes.map((ingrediente) => ({ producto_id: productoId, ingrediente: ingrediente.nombre, gramos: Number(ingrediente.gramos || 0) }))
    });
  }

  const productos = await supabase(`/productos?id=eq.${productoId}&select=*,producto_ingredientes(*)`);
  return normalizarProducto(productos[0]);
}

async function asegurarProductosBase() {
  const productos = await listarProductos();
  for (const productoBase of productosBase) {
    const existente = productos.find((producto) => producto.nombre.toLowerCase() === productoBase.nombre.toLowerCase());
    if (!existente) {
      await crearProducto(productoBase);
      continue;
    }
    if (productoBase.tipo === "preparado" && !existente.ingredientes.length) {
      await supabase("/producto_ingredientes", {
        method: "POST",
        body: productoBase.ingredientes.map((ingrediente) => ({ producto_id: existente.id, ingrediente: ingrediente.nombre, gramos: Number(ingrediente.gramos || 0) }))
      });
    }
  }
  return listarProductos();
}

function agruparStock(movimientos) {
  const stock = new Map();
  for (const movimiento of movimientos) {
    const nombre = movimiento.ingrediente;
    if (!nombre) continue;
    const clave = nombre.trim().toLowerCase();
    const actual = stock.get(clave) || { nombre, gramos: 0 };
    actual.nombre = nombre;
    actual.gramos += Number(movimiento.gramos || 0);
    stock.set(clave, actual);
  }
  return [...stock.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

async function manejar(req, res) {
  if (req.method === "OPTIONS") return responder(res, 200, { ok: true });
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") return responder(res, 200, { ok: true, servicio: "cafeteria-backend" });
    if (req.method === "GET" && url.pathname === "/api/productos") return responder(res, 200, await asegurarProductosBase());
    if (req.method === "POST" && url.pathname === "/api/productos") {
      const body = await leerJson(req);
      if (!body.nombre || !Number(body.precio)) return responder(res, 400, { ok: false, error: "Complete nombre y precio del producto." });
      return responder(res, 201, await crearProducto(body));
    }

    const productoMatch = url.pathname.match(/^\/api\/productos\/(\d+)$/);
    if (req.method === "DELETE" && productoMatch) {
      const productoId = productoMatch[1];
      await supabase(`/producto_ingredientes?producto_id=eq.${productoId}`, { method: "DELETE" });
      await supabase(`/productos?id=eq.${productoId}`, { method: "DELETE" });
      return responder(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/stock") {
      const movimientos = await supabase("/stock_movimientos?select=ingrediente,gramos,tipo&order=creado_en.desc");
      return responder(res, 200, agruparStock(movimientos));
    }

    if (req.method === "POST" && url.pathname === "/api/stock/compra") {
      const body = await leerJson(req);
      const nombre = String(body.nombre || "").trim();
      const gramos = Number(body.gramos || 0);
      if (!nombre || gramos <= 0) return responder(res, 400, { ok: false, error: "Complete ingrediente y cantidad." });
      const movimiento = await supabase("/stock_movimientos", { method: "POST", body: { ingrediente: nombre, gramos, tipo: "compra" } });
      return responder(res, 201, movimiento[0]);
    }

    if (req.method === "POST" && url.pathname === "/api/turnos/abrir") {
      const body = await leerJson(req);
      const turno = await supabase("/turnos", { method: "POST", body: { usuario: body.usuario || "Sin usuario", efectivo_inicial: Number(body.efectivo_inicial || 0), estado: "abierto" } });
      return responder(res, 201, turno[0]);
    }

    if (req.method === "GET" && url.pathname === "/api/turnos/abierto") {
      const turnos = await supabase("/turnos?estado=eq.abierto&order=abierto_en.desc&limit=1");
      return responder(res, 200, turnos[0] || null);
    }

    if (req.method === "GET" && url.pathname === "/api/ventas") return responder(res, 200, await supabase("/ventas?select=*,venta_items(*)&order=id.desc&limit=200"));

    const movimientosMatch = url.pathname.match(/^\/api\/turnos\/(\d+)\/movimientos$/);
    if (req.method === "GET" && movimientosMatch) return responder(res, 200, await supabase(`/movimientos_caja?turno_id=eq.${movimientosMatch[1]}&order=creado_en.desc`));

    if (req.method === "POST" && url.pathname === "/api/turnos/movimiento") {
      const body = await leerJson(req);
      const movimiento = await supabase("/movimientos_caja", { method: "POST", body: { turno_id: body.turno_id, tipo: body.tipo, detalle: body.detalle, importe: Number(body.importe || 0) } });
      return responder(res, 201, movimiento[0]);
    }

    if (req.method === "POST" && url.pathname === "/api/ventas") {
      const venta = await leerJson(req);
      return responder(res, 201, await supabase("/rpc/registrar_venta_completa", { method: "POST", body: { payload: venta } }));
    }

    if (req.method === "POST" && url.pathname === "/api/facturar") return responder(res, 501, { ok: false, mensaje: "Facturacion ARCA pendiente. Este endpoint queda reservado para la integracion." });
    return responder(res, 404, { ok: false, error: "Ruta no encontrada" });
  } catch (error) {
    return responder(res, 500, { ok: false, error: error.message });
  }
}

http.createServer(manejar).listen(PORT, () => {
  console.log(`Backend cafeteria escuchando en http://localhost:${PORT}`);
});
