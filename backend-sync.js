const API_BASE_KEY = "ponteDulceApiBase";
const API_BASE = obtenerApiBase();
let productosRemotos = [];
let turnoRemotoCache = null;
let ventasTurnoRemotas = [];

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

function adaptarTurnoRemoto(remoto) {
  if (!remoto) return null;
  const fecha = new Date(remoto.abierto_en || remoto.created_at || Date.now());
  return {
    id: remoto.id,
    estado: remoto.estado || "abierto",
    usuario: remoto.usuario || "Sin usuario",
    efectivoInicial: Number(remoto.efectivo_inicial || 0),
    fecha: fecha.toLocaleDateString("es-AR"),
    hora: fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
    gastos: [],
    refuerzos: [],
    backend: { guardado: true }
  };
}

async function cargarTurnoAbiertoBackend() {
  const remoto = await apiJson("/turnos/abierto");
  turnoRemotoCache = adaptarTurnoRemoto(remoto);
  ventasTurnoRemotas = [];
  if (!turnoRemotoCache) return null;

  const [movimientos, ventas] = await Promise.all([
    apiJson(`/turnos/${turnoRemotoCache.id}/movimientos`),
    apiJson("/ventas")
  ]);
  turnoRemotoCache.gastos = movimientos
    .filter((movimiento) => movimiento.tipo === "gasto")
    .map((movimiento) => ({ detalle: movimiento.detalle, importe: Number(movimiento.importe || 0), fecha: movimiento.creado_en }));
  turnoRemotoCache.refuerzos = movimientos
    .filter((movimiento) => movimiento.tipo === "refuerzo")
    .map((movimiento) => ({ detalle: movimiento.detalle, importe: Number(movimiento.importe || 0), fecha: movimiento.creado_en }));
  ventasTurnoRemotas = ventas.filter((venta) => Number(venta.turno_id) === Number(turnoRemotoCache.id) && venta.estado !== "cancelada");
  return turnoRemotoCache;
}

obtenerTurno = function obtenerTurno() {
  return turnoRemotoCache;
};

guardarTurno = function guardarTurno(turno) {
  turnoRemotoCache = turno;
};

turnoAbierto = function turnoAbierto() {
  return turnoRemotoCache && turnoRemotoCache.estado === "abierto" ? turnoRemotoCache : null;
};

totalesTurno = function totalesTurno(turno) {
  const ventas = ventasTurnoRemotas.length ? ventasTurnoRemotas : [];
  const efectivoVentas = ventas.reduce((total, venta) => total + Number(venta.pago?.netoEfectivo ?? (Number(venta.pago?.efectivo || 0) - Number(venta.pago?.vuelto || 0))), 0);
  const digitalVentas = ventas.reduce((total, venta) => total + Number(venta.pago?.digital || 0), 0);
  const gastos = (turno.gastos || []).reduce((total, item) => total + Number(item.importe || 0), 0);
  const refuerzos = (turno.refuerzos || []).reduce((total, item) => total + Number(item.importe || 0), 0);
  return { efectivoInicial: Number(turno.efectivoInicial || 0), gastos, refuerzos, efectivoVentas, digitalVentas, efectivoTeorico: Number(turno.efectivoInicial || 0) + refuerzos + efectivoVentas - gastos };
};

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

abrirCobro = async function abrirCobro() {
  if (!turnoAbierto()) {
    try { await cargarTurnoAbiertoBackend(); } catch {}
  }
  if (!turnoAbierto()) { alert("Primero abra un turno de caja."); mostrarTurno(); return; }
  if (modoActual === "cafeteria" && !mesaActual) return alert("Seleccione una mesa.");
  const total = modoActual === "panaderia" ? calcularTotalPedido(carritoPanaderia) : calcularTotal(mesas[mesaActual]);
  if (total <= 0) return alert("No hay productos para cobrar.");
  totalCobroActual = total;
  document.getElementById("totalModal").textContent = formatoPrecio(total);
  document.getElementById("pagoEfectivo").value = 0;
  document.getElementById("pagoDigital").value = 0;
  actualizarEstadoPago();
  document.getElementById("modalPago").classList.add("abierto");
};

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
    await cargarTurnoAbiertoBackend().catch(() => null);
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
  await cargarTurnoAbiertoBackend().catch(() => null);
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

mostrarTurno = async function mostrarTurno() {
  try { await cargarTurnoAbiertoBackend(); } catch (error) { alert(`No se pudo consultar el turno en Supabase: ${error.message}`); }
  renderizarTurno();
  document.getElementById("modalTurno").classList.add("abierto");
};

abrirTurnoCaja = async function abrirTurnoCaja() {
  try {
    const remoto = await apiJson("/turnos/abrir", { method: "POST", body: { usuario: obtenerUsuarioActual(), efectivo_inicial: leerImporte("efectivoInicialTurno") } });
    guardarTurno(adaptarTurnoRemoto(remoto));
    await cargarTurnoAbiertoBackend();
    if (remoto?.ya_abierto) alert("Ya habia un turno abierto. Se va a usar ese mismo turno en todos los equipos.");
  } catch (error) {
    alert(`No se pudo abrir el turno en Supabase: ${error.message}`);
  }
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
  try {
    await apiJson("/turnos/movimiento", { method: "POST", body: { turno_id: turno.id, tipo: esGasto ? "gasto" : "refuerzo", detalle, importe } });
    await cargarTurnoAbiertoBackend();
  } catch (error) {
    alert(`No se pudo guardar el movimiento en Supabase: ${error.message}`);
  }
  renderizarTurno();
};

cerrarCaja = async function cerrarCaja() {
  const turno = turnoAbierto();
  if (!turno) return;
  const totales = totalesTurno(turno);
  if (!confirm(`Cerrar caja con efectivo teorico de $${formatoPrecio(totales.efectivoTeorico)}?`)) return;
  try {
    await apiJson("/turnos/cerrar", { method: "POST", body: { turno_id: turno.id } });
    turnoRemotoCache = null;
    ventasTurnoRemotas = [];
    alert("Caja cerrada en Supabase.");
  } catch (error) {
    alert(`No se pudo cerrar la caja en Supabase: ${error.message}`);
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
cargarTurnoAbiertoBackend().catch(() => null);
