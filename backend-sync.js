const API_BASE_KEY = "ponteDulceApiBase";
const API_BASE = obtenerApiBase();
let productosRemotos = [];

function obtenerApiBase() {
  const parametros = new URLSearchParams(window.location.search);
  const apiUrl = parametros.get("api");
  if (apiUrl) {
    const limpia = apiUrl.replace(/\/$/, "");
    localStorage.setItem(API_BASE_KEY, limpia);
    return limpia;
  }
  return localStorage.getItem(API_BASE_KEY) || "https://cafeteria-josue.onrender.com/api";
}

async function apiJson(ruta, opciones = {}) {
  const respuesta = await fetch(`${API_BASE}${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", ...(opciones.headers || {}) },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined
  });
  const data = await respuesta.json().catch(() => null);
  if (!respuesta.ok || data?.ok === false) throw new Error(data?.error || data?.mensaje || "Error del backend");
  return data;
}

function ventaParaBackend(venta) {
  return {
    turno_id: venta.turnoId,
    usuario: venta.usuario,
    origen: venta.origen,
    total: venta.total,
    pago: venta.pago,
    items: (venta.detalle || []).map((item) => ({
      producto_id: item.id || item.producto_id || null,
      nombre: item.nombre,
      cantidad: item.cantidad,
      precio_unitario: item.precio,
      subtotal: item.subtotal,
      ingredientes: item.ingredientes || []
    }))
  };
}

async function guardarVentaEnBackend(venta) {
  const resultado = await apiJson("/ventas", { method: "POST", body: ventaParaBackend(venta) });
  venta.backend = { guardada: true, ventaId: resultado.venta_id, numero: resultado.numero };
  venta.numero = resultado.numero;
  return resultado;
}

function fechaHoraDesdeSupabase(venta) {
  const valor = venta.creada_en || venta.creado_en || venta.created_at || venta.fecha || venta.inserted_at;
  const fecha = valor ? new Date(valor) : new Date();
  return {
    fecha: fecha.toLocaleDateString("es-AR"),
    hora: fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
  };
}

function ventaRemotaParaCuaderno(venta) {
  const fechaHora = fechaHoraDesdeSupabase(venta);
  const pago = {
    efectivo: Number(venta.efectivo || 0),
    digital: Number(venta.digital || 0),
    vuelto: Number(venta.vuelto || 0),
    netoEfectivo: Math.max(0, Number(venta.efectivo || 0) - Number(venta.vuelto || 0))
  };
  return {
    numero: Number(venta.numero || venta.id),
    turnoId: venta.turno_id,
    usuario: venta.usuario || "Sin usuario",
    origen: venta.origen || "",
    total: Number(venta.total || 0),
    pago,
    medio: resumenMedioPago(pago),
    estado: venta.estado || "activa",
    facturada: Boolean(venta.facturada),
    fecha: fechaHora.fecha,
    hora: fechaHora.hora,
    remoto: true,
    detalle: (venta.venta_items || []).map((item) => ({
      id: item.producto_id || null,
      nombre: item.nombre,
      cantidad: Number(item.cantidad || 1),
      precio: Number(item.precio_unitario || 0),
      subtotal: Number(item.subtotal || 0),
      ingredientes: []
    }))
  };
}

function construirVentaActual({ origen, pedido, total, pago }) {
  const ahora = new Date();
  const turno = turnoAbierto();
  return {
    numero: null,
    turnoId: turno ? turno.id : null,
    usuario: obtenerUsuarioActual(),
    origen,
    medio: resumenMedioPago(pago),
    pago,
    total,
    estado: "activa",
    facturada: false,
    fecha: ahora.toLocaleDateString("es-AR"),
    hora: ahora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
    detalle: pedido.map((item) => ({
      id: item.id || null,
      nombre: item.nombre,
      cantidad: item.cantidad,
      precio: item.precio,
      subtotal: item.precio * item.cantidad,
      ingredientes: item.ingredientes || []
    }))
  };
}

confirmarPago = async function confirmarPago() {
  if (modoActual === "cafeteria" && !mesaActual) return;
  const pedido = modoActual === "panaderia" ? carritoPanaderia : mesas[mesaActual].pedido;
  const total = calcularTotalPedido(pedido);
  const origen = modoActual === "panaderia" ? "Panaderia" : `Mesa ${mesaActual}`;
  const efectivo = leerImporte("pagoEfectivo");
  const digital = leerImporte("pagoDigital");
  if (!pedido.length) return;
  if (digital > total) return alert("La transferencia / QR no puede superar el total de la venta.");
  if (efectivo + digital < total) return alert(`Faltan $${formatoPrecio(total - efectivo - digital)} para completar el pago.`);
  const efectivoNecesario = Math.max(0, total - digital);
  const pago = { efectivo, digital, vuelto: Math.max(0, efectivo - efectivoNecesario), netoEfectivo: Math.min(efectivo, efectivoNecesario) };
  const venta = construirVentaActual({ origen, pedido, total, pago });
  try {
    const resultado = await guardarVentaEnBackend(venta);
    alert(`Venta N° ${resultado.numero} guardada en Supabase. Total: $${formatoPrecio(total)}`);
  } catch (error) {
    alert(`No se pudo guardar la venta en Supabase: ${error.message}. El pedido sigue en pantalla para reintentar.`);
    return;
  }
  if (modoActual === "panaderia") { carritoPanaderia = []; cerrarModalPago(); actualizarVistaPanaderia(); renderizarMesas(); return; }
  mesas[mesaActual] = { estado: "libre", pedido: [], creada: 0 };
  cerrarModalPago(); actualizarVistaMesa();
};

mostrarCuaderno = async function mostrarCuaderno() {
  const lista = document.getElementById("listaCuaderno");
  const turno = turnoAbierto();
  document.getElementById("tituloCuaderno").textContent = "Cuaderno";
  lista.innerHTML = '<p class="pedido-vacio">Cargando ventas desde Supabase...</p>';
  document.getElementById("modalCuaderno").classList.add("abierto");
  try {
    const ventas = (await apiJson("/ventas")).map(ventaRemotaParaCuaderno);
    const ventasVisibles = turno ? ventas.filter((venta) => Number(venta.turnoId) === Number(turno.id)) : ventas;
    lista.innerHTML = `<p class="pedido-vacio">Historial guardado en Supabase. <small>Fuente: Supabase.</small></p>${ventasVisibles.length ? ventasVisibles.map((venta) => `<div class="venta-cuaderno ${venta.estado === "cancelada" ? "cancelada" : ""}"><div><strong>Venta ${venta.numero}</strong><small>${venta.fecha}, ${venta.hora} | ${venta.usuario || "Sin usuario"} | ${venta.medio}${venta.origen ? ` | ${venta.origen}` : ""}${venta.estado === "cancelada" ? " | Cancelada" : ""}${venta.facturada ? " | Facturada" : ""}</small></div><strong>$${formatoPrecio(venta.total)}</strong><button class="boton-facturar" onclick="facturarVenta(${venta.numero})" ${venta.estado === "cancelada" || venta.facturada ? "disabled" : ""}>Facturar</button></div>`).join("") : '<p class="pedido-vacio">Todavia no hay ventas en este turno.</p>'}`;
  } catch (error) {
    lista.innerHTML = `<p class="pedido-vacio">No se pudo leer Supabase: ${error.message}</p>`;
  }
};

abrirTurnoCaja = async function abrirTurnoCaja() {
  const ahora = new Date();
  const turno = { id: Date.now(), estado: "abierto", usuario: obtenerUsuarioActual(), efectivoInicial: leerImporte("efectivoInicialTurno"), fecha: ahora.toLocaleDateString("es-AR"), hora: ahora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }), gastos: [], refuerzos: [] };
  try {
    const remoto = await apiJson("/turnos/abrir", { method: "POST", body: { usuario: turno.usuario, efectivo_inicial: turno.efectivoInicial } });
    if (remoto?.id) turno.id = remoto.id;
    turno.backend = { guardado: true };
  } catch (error) {
    alert(`No se pudo abrir el turno en Supabase: ${error.message}. El turno queda abierto solo en este equipo.`);
    turno.backend = { guardado: false, error: error.message };
  }
  guardarTurno(turno);
  renderizarTurno();
};

agregarMovimientoCaja = async function agregarMovimientoCaja(tipo) {
  const turno = turnoAbierto();
  if (!turno) return;
  const esGasto = tipo === "gastos";
  const detalleId = esGasto ? "detalleGasto" : "detalleRefuerzo";
  const importeId = esGasto ? "importeGasto" : "importeRefuerzo";
  const detalle = document.getElementById(detalleId).value.trim();
  const importe = leerImporte(importeId);
  if (!detalle || importe <= 0) return alert("Complete detalle e importe.");
  turno[tipo].push({ detalle, importe, fecha: new Date().toLocaleString("es-AR") });
  guardarTurno(turno);
  try {
    await apiJson("/turnos/movimiento", { method: "POST", body: { turno_id: turno.id, tipo: esGasto ? "gasto" : "refuerzo", detalle, importe } });
  } catch (error) {
    alert(`El movimiento quedo en este equipo, pero no se envio a Supabase: ${error.message}`);
  }
  renderizarTurno();
};

facturarVenta = async function facturarVenta(numeroVenta) {
  alert("Falta conectar el backend de ARCA. El boton ya queda preparado para facturar automaticamente cuando exista /api/facturar.");
};

obtenerProductos = function obtenerProductos() {
  return productosRemotos.length ? productosRemotos : productosBase;
};

async function cargarProductosRemotos() {
  try {
    productosRemotos = await apiJson("/productos");
    renderizarCategorias();
    renderizarProductos();
    renderizarMesas();
  } catch (error) {
    alert(`No se pudieron cargar productos desde Supabase: ${error.message}`);
  }
}

cargarProductosRemotos();
