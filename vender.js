const PRODUCTOS_KEY = "ponteDulceProductos";
const STOCK_KEY = "ponteDulceStockIngredientes";
const POSICIONES_KEY = "ponteDulcePosicionesMesas8";
const VENTAS_KEY = "ponteDulceCuadernoVentas";
const NUMERO_VENTA_KEY = "ponteDulceNumeroVenta";
const TURNO_KEY = "ponteDulceTurnoCaja";
const USUARIO_KEY = "ponteDulceUsuario";
const CANTIDAD_MESAS = 8;
const CATEGORIAS_CAFETERIA = ["combos", "bebidas", "exprimidos", "salado", "dulce"];

const productosBase = [
  { id: 1, nombre: "Combo desayuno", precio: 3500, categoria: "combos", tipo: "comprado", ingredientes: [] },
  { id: 2, nombre: "Cafe con leche", precio: 1400, categoria: "bebidas", tipo: "preparado", ingredientes: [{ nombre: "Cafe", gramos: 50 }] },
  { id: 3, nombre: "Te", precio: 1100, categoria: "bebidas", tipo: "preparado", ingredientes: [{ nombre: "Te", gramos: 5 }] },
  { id: 4, nombre: "Exprimido naranja", precio: 1800, categoria: "exprimidos", tipo: "preparado", ingredientes: [{ nombre: "Naranja", gramos: 250 }] },
  { id: 5, nombre: "Tostado", precio: 2600, categoria: "salado", tipo: "comprado", ingredientes: [] },
  { id: 6, nombre: "Medialuna", precio: 700, categoria: "dulce", tipo: "comprado", ingredientes: [] }
];

const posicionesBase = {
  1: { left: 30, top: 28 }, 2: { left: 30, top: 51 }, 3: { left: 52, top: 28 }, 4: { left: 52, top: 51 },
  5: { left: 74, top: 28 }, 6: { left: 74, top: 51 }, 7: { left: 40, top: 76 }, 8: { left: 64, top: 76 }
};

let mesaActual = null;
let categoriaActual = "cafeteria";
let modoActual = "cafeteria";
let editandoMesas = false;
let mesaArrastrando = null;
let carritoPanaderia = [];
let totalCobroActual = 0;
const mesas = {};
for (let i = 1; i <= CANTIDAD_MESAS; i++) mesas[i] = { estado: "libre", pedido: [], creada: 0 };

const normalizar = (texto) => texto.trim().toLowerCase();
const formatoPrecio = (valor) => Number(valor).toLocaleString("es-AR");
const formatoGramos = (gramos) => gramos >= 1000 ? `${(gramos / 1000).toLocaleString("es-AR")} kg` : `${Number(gramos).toLocaleString("es-AR")} g`;
const leerImporte = (id) => Math.max(0, Number(document.getElementById(id)?.value || 0));

function leerJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

function obtenerProductos() {
  const guardados = localStorage.getItem(PRODUCTOS_KEY);
  if (!guardados) {
    localStorage.setItem(PRODUCTOS_KEY, JSON.stringify(productosBase));
    return productosBase;
  }
  try {
    return JSON.parse(guardados).map((producto) => {
      const base = productosBase.find((item) => item.id === producto.id || item.nombre === producto.nombre);
      return producto.tipo ? { tipo: "comprado", ingredientes: [], ...producto } : { ...(base || {}), ...producto, tipo: (base && base.tipo) || "comprado", ingredientes: (base && base.ingredientes) || [] };
    });
  } catch {
    localStorage.setItem(PRODUCTOS_KEY, JSON.stringify(productosBase));
    return productosBase;
  }
}

function obtenerStock() { return leerJson(STOCK_KEY, {}); }
function guardarStock(stock) { localStorage.setItem(STOCK_KEY, JSON.stringify(stock)); }
function obtenerVentas() { return leerJson(VENTAS_KEY, []); }
function guardarVentas(ventas) { localStorage.setItem(VENTAS_KEY, JSON.stringify(ventas)); }
function obtenerTurno() { return leerJson(TURNO_KEY, null); }
function guardarTurno(turno) { localStorage.setItem(TURNO_KEY, JSON.stringify(turno)); }
function turnoAbierto() { const turno = obtenerTurno(); return turno && turno.estado === "abierto" ? turno : null; }
function obtenerUsuarioActual() { return localStorage.getItem(USUARIO_KEY) || "Josue"; }

function obtenerPosiciones() { return { ...posicionesBase, ...leerJson(POSICIONES_KEY, {}) }; }
function guardarPosiciones(posiciones) { localStorage.setItem(POSICIONES_KEY, JSON.stringify(posiciones)); }

function generarNumeroVenta() {
  const siguiente = Number(localStorage.getItem(NUMERO_VENTA_KEY) || 0) + 1;
  localStorage.setItem(NUMERO_VENTA_KEY, String(siguiente));
  return siguiente;
}

function resumenMedioPago(pago) {
  const partes = [];
  if (pago.efectivo > 0) partes.push(`Efectivo $${formatoPrecio(pago.efectivo)}`);
  if (pago.digital > 0) partes.push(`Transferencia / QR $${formatoPrecio(pago.digital)}`);
  return partes.join(" + ") || "Sin pago";
}

function registrarVenta({ origen, pedido, total, pago }) {
  const ahora = new Date();
  const turno = turnoAbierto();
  const venta = {
    numero: generarNumeroVenta(), turnoId: turno ? turno.id : null, usuario: obtenerUsuarioActual(), origen,
    medio: resumenMedioPago(pago), pago, total, estado: "activa", facturada: false,
    fecha: ahora.toLocaleDateString("es-AR"), hora: ahora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
    detalle: pedido.map((item) => ({ nombre: item.nombre, cantidad: item.cantidad, precio: item.precio, subtotal: item.precio * item.cantidad, ingredientes: item.ingredientes || [] }))
  };
  const ventas = obtenerVentas();
  ventas.unshift(venta);
  guardarVentas(ventas);
  return venta;
}

function nombreCategoria(categoria) {
  return { todo: "Todo", cafeteria: "Cafeteria", panaderia: "Panaderia", combos: "Combos", bebidas: "Cafe / Te", exprimidos: "Exprimidos", salado: "Salado", dulce: "Dulce", almacen: "Almacen", otros: "Otros" }[categoria] || categoria;
}

function categoriasDisponibles() {
  const categorias = [...new Set(obtenerProductos().map((producto) => producto.categoria).filter(Boolean))];
  if (modoActual === "panaderia") return ["cafeteria", "todo", ...categorias.filter((categoria) => !CATEGORIAS_CAFETERIA.includes(categoria))];
  return ["cafeteria", ...CATEGORIAS_CAFETERIA];
}

function productosPorCategoria(productos) {
  if (categoriaActual === "todo") return productos;
  if (categoriaActual === "cafeteria") return productos.filter((producto) => CATEGORIAS_CAFETERIA.includes(producto.categoria));
  if (categoriaActual === "panaderia") return productos.filter((producto) => !CATEGORIAS_CAFETERIA.includes(producto.categoria));
  return productos.filter((producto) => producto.categoria === categoriaActual);
}

function renderizarCategorias() {
  document.getElementById("categoriasVenta").innerHTML = categoriasDisponibles().map((categoria) => `<button class="${categoria === categoriaActual ? "activo" : ""}" onclick="mostrarCategoria('${categoria}')">${nombreCategoria(categoria)}</button>`).join("");
}

function actualizarUsuario() { document.getElementById("btnUsuario").textContent = `Usuario: ${obtenerUsuarioActual()}`; }
function mostrarUsuario() { document.getElementById("nombreUsuario").value = obtenerUsuarioActual(); document.getElementById("modalUsuario").classList.add("abierto"); }
function cerrarUsuario() { document.getElementById("modalUsuario").classList.remove("abierto"); }
function guardarUsuarioActual() {
  const nombre = document.getElementById("nombreUsuario").value.trim();
  if (!nombre) return alert("Ingrese un usuario.");
  localStorage.setItem(USUARIO_KEY, nombre);
  actualizarUsuario();
  cerrarUsuario();
}

function ventasDelTurno(turno) {
  if (!turno) return [];
  return obtenerVentas().filter((venta) => venta.turnoId === turno.id && venta.estado !== "cancelada");
}

function totalesTurno(turno) {
  const ventas = ventasDelTurno(turno);
  const efectivoVentas = ventas.reduce((total, venta) => total + Number(venta.pago?.netoEfectivo ?? (Number(venta.pago?.efectivo || 0) - Number(venta.pago?.vuelto || 0))), 0);
  const digitalVentas = ventas.reduce((total, venta) => total + Number(venta.pago?.digital || 0), 0);
  const gastos = (turno.gastos || []).reduce((total, item) => total + Number(item.importe || 0), 0);
  const refuerzos = (turno.refuerzos || []).reduce((total, item) => total + Number(item.importe || 0), 0);
  return { efectivoInicial: Number(turno.efectivoInicial || 0), gastos, refuerzos, efectivoVentas, digitalVentas, efectivoTeorico: Number(turno.efectivoInicial || 0) + refuerzos + efectivoVentas - gastos };
}

function mostrarModo(modo) {
  modoActual = modo;
  categoriaActual = "cafeteria";
  document.querySelector(".contenedor-venta").classList.toggle("panaderia-layout", modo === "panaderia");
  document.getElementById("tituloModo").textContent = modo === "cafeteria" ? "Cafeteria" : "Panaderia";
  document.getElementById("btnCafeteria").classList.toggle("activo", modo === "cafeteria");
  document.getElementById("btnPanaderia").classList.toggle("activo", modo === "panaderia");
  document.querySelector(".panel-central").classList.toggle("modo-panaderia", modo === "panaderia");
  document.querySelector(".panel-izquierdo").classList.toggle("modo-panaderia", modo === "panaderia");
  document.querySelector(".panel-derecho").classList.toggle("compra-panaderia", modo === "panaderia");
  ubicarCatalogoVenta();
  if (modo === "panaderia") {
    mesaActual = null;
    document.getElementById("mesaSeleccionada").textContent = "Venta";
    document.getElementById("estadoMesa").textContent = "Venta directa";
    actualizarVistaPanaderia();
  } else {
    document.getElementById("mesaSeleccionada").textContent = mesaActual ? `Mesa ${mesaActual}` : "Seleccione una mesa";
    actualizarVistaMesa();
  }
  renderizarCategorias();
  renderizarProductos();
  renderizarMesas();
  renderizarOrdenPedidos();
}

function ubicarCatalogoVenta() {
  const catalogo = document.getElementById("catalogoVenta");
  const areaPanaderia = document.getElementById("areaPanaderia");
  const panelDerecho = document.querySelector(".panel-derecho");
  const pedidoTitulo = panelDerecho.querySelector("h3");
  if (modoActual === "panaderia") areaPanaderia.appendChild(catalogo);
  else panelDerecho.insertBefore(catalogo, pedidoTitulo);
}

function seleccionarMesa(numero) { if (!editandoMesas) { modoActual = "cafeteria"; mesaActual = numero; mostrarModo("cafeteria"); } }
function mostrarCategoria(categoria) { categoriaActual = categoria; renderizarCategorias(); renderizarProductos(); }

function renderizarProductos() {
  const contenedor = document.getElementById("productosVenta");
  const productos = productosPorCategoria(obtenerProductos());
  if (!productos.length) { contenedor.innerHTML = '<p class="pedido-vacio">No hay productos en esta categoria.</p>'; return; }
  contenedor.innerHTML = productos.map((producto) => {
    const detalle = producto.tipo === "preparado" && producto.ingredientes.length ? producto.ingredientes.map((ing) => `${ing.nombre}: ${formatoGramos(ing.gramos)}`).join(" | ") : "Comprado hecho";
    const deshabilitado = modoActual === "cafeteria" && !mesaActual;
    return `<article class="producto-card categoria-${producto.categoria}"><strong>${producto.nombre}</strong><span>$${formatoPrecio(producto.precio)}</span><small>${detalle}</small><button onclick="agregarProducto(${producto.id})" ${deshabilitado ? "disabled" : ""}>Añadir</button></article>`;
  }).join("");
}

function agregarProducto(idProducto) {
  const producto = obtenerProductos().find((item) => item.id === idProducto);
  if (!producto) return;
  const pedido = modoActual === "panaderia" ? carritoPanaderia : (mesaActual ? mesas[mesaActual].pedido : null);
  if (!pedido) return alert("Primero seleccione una mesa.");
  const itemExistente = pedido.find((item) => item.id === idProducto);
  if (itemExistente) itemExistente.cantidad += 1;
  else pedido.push({ ...producto, cantidad: 1 });
  if (modoActual === "panaderia") actualizarVistaPanaderia();
  else { mesas[mesaActual].estado = "preparacion"; if (!mesas[mesaActual].creada) mesas[mesaActual].creada = Date.now(); actualizarVistaMesa(); }
}

function quitarProducto(idProducto) {
  const pedido = modoActual === "panaderia" ? carritoPanaderia : (mesaActual ? mesas[mesaActual].pedido : null);
  if (!pedido) return;
  const item = pedido.find((producto) => producto.id === idProducto);
  if (!item) return;
  item.cantidad -= 1;
  if (item.cantidad <= 0) {
    if (modoActual === "panaderia") carritoPanaderia = carritoPanaderia.filter((producto) => producto.id !== idProducto);
    else mesas[mesaActual].pedido = mesas[mesaActual].pedido.filter((producto) => producto.id !== idProducto);
  }
  if (modoActual === "panaderia") actualizarVistaPanaderia();
  else { if (!mesas[mesaActual].pedido.length) mesas[mesaActual].estado = "libre"; actualizarVistaMesa(); }
}

const calcularTotalPedido = (pedido) => pedido.reduce((total, item) => total + item.precio * item.cantidad, 0);
const calcularTotal = (mesa) => calcularTotalPedido(mesa.pedido);
const estadoTexto = (estado) => ({ libre: "Libre", preparacion: "En preparacion", entregado: "Entregado" }[estado] || "Libre");

function actualizarVistaMesa() {
  const pedido = document.getElementById("pedidoActual");
  const total = document.getElementById("totalVenta");
  const estado = document.getElementById("estadoMesa");
  const titulo = document.getElementById("mesaSeleccionada");
  document.querySelectorAll(".mesa").forEach((boton) => {
    const numero = Number(boton.dataset.mesa);
    boton.className = `mesa ${mesas[numero].estado}`;
    boton.classList.toggle("seleccionada", numero === mesaActual);
    boton.classList.toggle("movible", editandoMesas);
  });
  if (!mesaActual) {
    titulo.textContent = "Seleccione una mesa"; estado.textContent = "Sin mesa"; pedido.innerHTML = '<li class="pedido-vacio">Elija una mesa para empezar.</li>'; total.textContent = "0";
    renderizarProductos(); renderizarMesas(); renderizarOrdenPedidos(); return;
  }
  const mesa = mesas[mesaActual];
  titulo.textContent = `Mesa ${mesaActual}`;
  estado.textContent = estadoTexto(mesa.estado);
  pedido.innerHTML = mesa.pedido.length ? mesa.pedido.map((item) => `<li><span>${item.cantidad} x ${item.nombre}</span><strong>$${formatoPrecio(item.precio * item.cantidad)}</strong><button onclick="quitarProducto(${item.id})">-</button></li>`).join("") : '<li class="pedido-vacio">Todavia no hay productos.</li>';
  total.textContent = formatoPrecio(calcularTotal(mesa));
  renderizarProductos(); renderizarMesas(); renderizarOrdenPedidos();
}

function actualizarVistaPanaderia() {
  const pedido = document.getElementById("pedidoActual");
  document.getElementById("mesaSeleccionada").textContent = "Venta";
  document.getElementById("estadoMesa").textContent = "Venta directa";
  pedido.innerHTML = carritoPanaderia.length ? carritoPanaderia.map((item) => `<li><span>${item.nombre}</span><span>${item.cantidad}</span><strong>$${formatoPrecio(item.precio * item.cantidad)}</strong><button onclick="quitarProducto(${item.id})">X</button></li>`).join("") : '<li class="pedido-vacio">Agregue productos para vender.</li>';
  document.getElementById("totalVenta").textContent = formatoPrecio(calcularTotalPedido(carritoPanaderia));
  renderizarProductos();
}

function renderizarMesas() {
  const lista = document.getElementById("listaMesas");
  if (modoActual === "panaderia") { lista.innerHTML = carritoPanaderia.length ? carritoPanaderia.map((item) => `<div class="mesa-resumen venta-directa"><span>${item.cantidad} x ${item.nombre}</span><strong>$${formatoPrecio(item.precio * item.cantidad)}</strong></div>`).join("") : '<p class="pedido-vacio">Venta directa sin mesa.</p>'; return; }
  lista.innerHTML = Object.entries(mesas).map(([numero, mesa]) => `<button class="mesa-resumen" onclick="seleccionarMesa(${numero})"><span>Mesa ${numero}</span><strong>${estadoTexto(mesa.estado)} - $${formatoPrecio(calcularTotal(mesa))}</strong></button>`).join("");
}

function renderizarOrdenPedidos() {
  const lista = document.getElementById("ordenPedidos");
  const pendientes = Object.entries(mesas).filter(([, mesa]) => mesa.estado === "preparacion" && mesa.pedido.length).sort((a, b) => a[1].creada - b[1].creada);
  lista.innerHTML = pendientes.length ? pendientes.map(([numero, mesa], index) => `<button class="orden-card" onclick="seleccionarMesa(${numero})"><strong>${index + 1}. Mesa ${numero}</strong><span>${mesa.pedido.map((item) => `${item.cantidad} x ${item.nombre}`).join(", ")}</span></button>`).join("") : '<p class="pedido-vacio">No hay pedidos en preparación.</p>';
}

function marcarPreparacion() { if (!mesaActual) return alert("Seleccione una mesa."); if (!mesas[mesaActual].pedido.length) return alert("Agregue productos al pedido."); mesas[mesaActual].estado = "preparacion"; if (!mesas[mesaActual].creada) mesas[mesaActual].creada = Date.now(); actualizarVistaMesa(); }
function entregarPedido() { if (!mesaActual) return alert("Seleccione una mesa."); if (!mesas[mesaActual].pedido.length) return alert("Agregue productos al pedido."); mesas[mesaActual].estado = "entregado"; actualizarVistaMesa(); }
function imprimirCompra() {
  const pedido = modoActual === "panaderia" ? carritoPanaderia : (mesaActual ? mesas[mesaActual].pedido : []);
  const origen = modoActual === "panaderia" ? "Panaderia" : `Mesa ${mesaActual}`;
  if (modoActual === "cafeteria" && !mesaActual) return alert("Seleccione una mesa.");
  if (!pedido.length) return alert("No hay productos para imprimir.");
  document.getElementById("ticketImpresion").innerHTML = `<h2>Ponte Dulce</h2><p>${origen}</p><hr>${pedido.map((item) => `<p>${item.cantidad} x ${item.nombre}<br>$${formatoPrecio(item.precio * item.cantidad)}</p>`).join("")}<hr><h3>Total: $${formatoPrecio(calcularTotalPedido(pedido))}</h3>`;
  window.print();
}

function abrirCobro() {
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
}
function cerrarModalPago() { document.getElementById("modalPago").classList.remove("abierto"); }
function actualizarEstadoPago() {
  const efectivo = leerImporte("pagoEfectivo");
  const digital = leerImporte("pagoDigital");
  const estado = document.getElementById("estadoPago");
  if (digital > totalCobroActual) { estado.textContent = "Transferencia / QR supera el total"; estado.className = "estado-pago falta"; return; }
  const diferencia = efectivo + digital - totalCobroActual;
  estado.textContent = diferencia >= 0 ? (diferencia > 0 ? `Vuelto $${formatoPrecio(diferencia)}` : "Pago exacto") : `Faltan $${formatoPrecio(Math.abs(diferencia))}`;
  estado.className = `estado-pago ${diferencia >= 0 ? "pagado" : "falta"}`;
}

function moverIngredientes(pedido, signo) {
  const stock = obtenerStock();
  pedido.forEach((producto) => (producto.ingredientes || []).forEach((ingrediente) => {
    const clave = normalizar(ingrediente.nombre);
    stock[clave] = stock[clave] || { nombre: ingrediente.nombre, gramos: 0 };
    stock[clave].gramos += signo * Number(ingrediente.gramos) * producto.cantidad;
  }));
  guardarStock(stock);
}
const descontarIngredientes = (pedido) => moverIngredientes(pedido, -1);
const devolverIngredientes = (pedido) => moverIngredientes(pedido, 1);

function confirmarPago() {
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
  descontarIngredientes(pedido);
  const venta = registrarVenta({ origen, pedido, total, pago });
  alert(`Venta N° ${venta.numero} guardada. Total: $${formatoPrecio(total)}`);
  if (modoActual === "panaderia") { carritoPanaderia = []; cerrarModalPago(); actualizarVistaPanaderia(); renderizarMesas(); return; }
  mesas[mesaActual] = { estado: "libre", pedido: [], creada: 0 };
  cerrarModalPago(); actualizarVistaMesa();
}

function aplicarPosicionesMesas() { const posiciones = obtenerPosiciones(); document.querySelectorAll(".mesa").forEach((mesa) => { const posicion = posiciones[mesa.dataset.mesa] || posicionesBase[mesa.dataset.mesa]; mesa.style.left = `${posicion.left}%`; mesa.style.top = `${posicion.top}%`; }); }
function alternarEdicionMesas() { editandoMesas = !editandoMesas; document.getElementById("zonaLocal").classList.toggle("editando", editandoMesas); document.getElementById("btnEditarMesas").classList.toggle("activo", editandoMesas); document.getElementById("btnEditarMesas").textContent = editandoMesas ? "Guardar posiciones" : "Posición de mesas"; actualizarVistaMesa(); }
function restaurarPosicionesMesas() { guardarPosiciones(posicionesBase); aplicarPosicionesMesas(); }

function mostrarCuaderno() {
  const lista = document.getElementById("listaCuaderno");
  const ventas = obtenerVentas();
  const turno = turnoAbierto();
  document.getElementById("tituloCuaderno").textContent = "Cuaderno";
  if (!ventas.length) lista.innerHTML = '<p class="pedido-vacio">Todavia no hay ventas guardadas.</p>';
  else {
    const ventasVisibles = turno ? ventas.filter((venta) => venta.turnoId === turno.id) : ventas;
    lista.innerHTML = `<p class="pedido-vacio">${turno ? `Historial del turno abierto desde ${turno.fecha}, ${turno.hora}.` : "Historial de ventas guardadas."}</p>${ventasVisibles.length ? ventasVisibles.map((venta) => `<div class="venta-cuaderno ${venta.estado === "cancelada" ? "cancelada" : ""}"><div><strong>Venta ${venta.numero}</strong><small>${venta.fecha}, ${venta.hora} | ${venta.usuario || "Sin usuario"} | ${venta.medio}${venta.estado === "cancelada" ? " | Cancelada" : ""}${venta.facturada ? " | Facturada" : ""}</small></div><strong>$${formatoPrecio(venta.total)}</strong><button class="boton-facturar" onclick="facturarVenta(${venta.numero})" ${venta.estado === "cancelada" || venta.facturada ? "disabled" : ""}>Facturar</button><button class="boton-redondo" onclick="cancelarVenta(${venta.numero})" ${venta.estado === "cancelada" ? "disabled" : ""}>X</button></div>`).join("") : '<p class="pedido-vacio">Todavia no hay ventas en este turno.</p>'}`;
  }
  document.getElementById("modalCuaderno").classList.add("abierto");
}
function cerrarCuaderno() { document.getElementById("modalCuaderno").classList.remove("abierto"); }
function cancelarVenta(numeroVenta) {
  const ventas = obtenerVentas();
  const venta = ventas.find((item) => item.numero === numeroVenta);
  if (!venta || venta.estado === "cancelada") return;
  if (!confirm(`Cancelar la venta ${numeroVenta}? Va a quedar marcada como cancelada en el cuaderno.`)) return;
  devolverIngredientes(venta.detalle || []);
  venta.estado = "cancelada";
  venta.cancelada = { fecha: new Date().toLocaleDateString("es-AR"), hora: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) };
  guardarVentas(ventas);
  alert(`Venta ${numeroVenta} cancelada. No se borro del cuaderno.`);
  mostrarCuaderno();
}
async function facturarVenta(numeroVenta) {
  const ventas = obtenerVentas();
  const venta = ventas.find((item) => item.numero === numeroVenta);
  if (!venta || venta.estado === "cancelada") return;
  try {
    const respuesta = await fetch("/api/arca/facturar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(venta) });
    if (!respuesta.ok) throw new Error("No se pudo facturar");
    venta.facturada = true; venta.factura = await respuesta.json(); guardarVentas(ventas); alert(`Venta ${numeroVenta} facturada.`); mostrarCuaderno();
  } catch { alert("Falta conectar el backend de ARCA. El boton ya queda preparado para facturar automaticamente cuando exista /api/arca/facturar."); }
}

function mostrarTurno() { renderizarTurno(); document.getElementById("modalTurno").classList.add("abierto"); }
function cerrarTurnoVista() { document.getElementById("modalTurno").classList.remove("abierto"); }
function renderizarTurno() {
  const contenedor = document.getElementById("contenidoTurno");
  const turno = turnoAbierto();
  if (!turno) { contenedor.innerHTML = `<div class="panel-turno"><h3>Abrir caja</h3><p class="pedido-vacio">Cargue el efectivo inicial para empezar el turno.</p><input id="efectivoInicialTurno" type="number" min="0" step="1" placeholder="Efectivo inicial"><button onclick="abrirTurnoCaja()">Abrir turno</button></div>`; return; }
  const t = totalesTurno(turno);
  contenedor.innerHTML = `<div class="turno-layout"><section class="panel-turno"><h3>Resumen</h3><div class="fila-resumen"><span>Usuario</span><strong>${turno.usuario || "Sin usuario"}</strong></div><div class="fila-resumen"><span>Abierto</span><strong>${turno.fecha} ${turno.hora}</strong></div><div class="fila-resumen"><span>Efectivo inicial</span><strong>$${formatoPrecio(t.efectivoInicial)}</strong></div><div class="fila-resumen"><span>Gastos</span><strong>$${formatoPrecio(t.gastos)}</strong></div><div class="fila-resumen"><span>Refuerzos</span><strong>$${formatoPrecio(t.refuerzos)}</strong></div><div class="fila-resumen"><span>Ventas en efectivo</span><strong>$${formatoPrecio(t.efectivoVentas)}</strong></div><div class="fila-resumen"><span>Ventas digital</span><strong>$${formatoPrecio(t.digitalVentas)}</strong></div><div class="fila-resumen"><span>Efectivo teorico en caja</span><strong>$${formatoPrecio(t.efectivoTeorico)}</strong></div><button class="boton-peligro" onclick="cerrarCaja()">Cerrar caja</button></section><aside class="panel-turno"><h3>Movimientos de caja</h3><input id="detalleGasto" placeholder="Detalle del gasto"><input id="importeGasto" type="number" min="0" step="1" placeholder="Importe"><button onclick="agregarMovimientoCaja('gastos')">Agregar gasto</button><input id="detalleRefuerzo" placeholder="Detalle del refuerzo"><input id="importeRefuerzo" type="number" min="0" step="1" placeholder="Importe"><button onclick="agregarMovimientoCaja('refuerzos')">Agregar refuerzo</button><h3>Gastos</h3>${renderizarMovimientos(turno.gastos, "Sin gastos cargados.")}<h3>Refuerzos</h3>${renderizarMovimientos(turno.refuerzos, "Sin refuerzos cargados.")}</aside></div>`;
}
function renderizarMovimientos(movimientos = [], vacio) { return movimientos.length ? `<ul class="movimientos-lista">${movimientos.map((item) => `<li><span>${item.detalle}</span><strong>$${formatoPrecio(item.importe)}</strong></li>`).join("")}</ul>` : `<p class="pedido-vacio">${vacio}</p>`; }
function abrirTurnoCaja() { const ahora = new Date(); guardarTurno({ id: Date.now(), estado: "abierto", usuario: obtenerUsuarioActual(), efectivoInicial: leerImporte("efectivoInicialTurno"), fecha: ahora.toLocaleDateString("es-AR"), hora: ahora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }), gastos: [], refuerzos: [] }); renderizarTurno(); }
function agregarMovimientoCaja(tipo) { const turno = turnoAbierto(); if (!turno) return; const esGasto = tipo === "gastos"; const detalleId = esGasto ? "detalleGasto" : "detalleRefuerzo"; const importeId = esGasto ? "importeGasto" : "importeRefuerzo"; const detalle = document.getElementById(detalleId).value.trim(); const importe = leerImporte(importeId); if (!detalle || importe <= 0) return alert("Complete detalle e importe."); turno[tipo].push({ detalle, importe, fecha: new Date().toLocaleString("es-AR") }); guardarTurno(turno); renderizarTurno(); }
function cerrarCaja() { const turno = turnoAbierto(); if (!turno) return; const totales = totalesTurno(turno); if (!confirm(`Cerrar caja con efectivo teorico de $${formatoPrecio(totales.efectivoTeorico)}?`)) return; turno.estado = "cerrado"; turno.cierre = { fecha: new Date().toLocaleDateString("es-AR"), hora: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }), totales }; guardarTurno(turno); alert("Caja cerrada."); renderizarTurno(); }

function iniciarArrastreMesas() {
  const zona = document.getElementById("zonaLocal");
  document.querySelectorAll(".mesa").forEach((mesa) => mesa.addEventListener("pointerdown", (evento) => { if (!editandoMesas) return; evento.preventDefault(); mesaArrastrando = mesa; mesa.setPointerCapture(evento.pointerId); }));
  zona.addEventListener("pointermove", (evento) => { if (!mesaArrastrando || !editandoMesas) return; const rect = zona.getBoundingClientRect(); const left = Math.max(5, Math.min(90, ((evento.clientX - rect.left) / rect.width) * 100)); const top = Math.max(8, Math.min(90, ((evento.clientY - rect.top) / rect.height) * 100)); mesaArrastrando.style.left = `${left}%`; mesaArrastrando.style.top = `${top}%`; });
  zona.addEventListener("pointerup", () => { if (!mesaArrastrando) return; const posiciones = obtenerPosiciones(); posiciones[mesaArrastrando.dataset.mesa] = { left: parseFloat(mesaArrastrando.style.left), top: parseFloat(mesaArrastrando.style.top) }; guardarPosiciones(posiciones); mesaArrastrando = null; });
}

document.addEventListener("keydown", (evento) => { if (evento.key === "Enter" && document.getElementById("modalPago").classList.contains("abierto")) confirmarPago(); });
aplicarPosicionesMesas();
iniciarArrastreMesas();
actualizarUsuario();
mostrarModo("cafeteria");
