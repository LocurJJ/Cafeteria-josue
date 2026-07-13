const API_BASE_KEY = "ponteDulceApiBase";
const API_BASE_DEFAULT = "https://cafeteria-josue.onrender.com/api";

function obtenerApiBase() {
  const params = new URLSearchParams(location.search);
  const api = params.get("api");
  if (api) {
    const limpia = api.replace(/\/$/, "");
    localStorage.setItem(API_BASE_KEY, limpia);
    return limpia;
  }
  return localStorage.getItem(API_BASE_KEY) || API_BASE_DEFAULT;
}

const API_BASE = obtenerApiBase();

const formatoMoneda = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});

function dinero(valor) {
  return formatoMoneda.format(Number(valor || 0));
}

function fechaHora(valor) {
  if (!valor) return "-";
  return new Date(valor).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

async function apiJson(ruta) {
  const respuesta = await fetch(`${API_BASE}${ruta}`);
  const data = await respuesta.json();
  if (!respuesta.ok || data?.ok === false) {
    throw new Error(data?.error || "No se pudo cargar la informacion.");
  }
  return data;
}

function ventaActiva(venta) {
  return venta.estado !== "cancelada";
}

function medioPago(venta) {
  const efectivo = Number(venta.efectivo || 0);
  const digital = Number(venta.digital || 0);
  if (efectivo > 0 && digital > 0) return `Mixto: ${dinero(efectivo)} efectivo + ${dinero(digital)} digital`;
  if (digital > 0) return `Transferencia / QR ${dinero(digital)}`;
  return `Efectivo ${dinero(efectivo)}`;
}

function renderFila(etiqueta, valor) {
  return `
    <div class="control-fila">
      <span>${etiqueta}</span>
      <strong>${valor}</strong>
    </div>
  `;
}

function renderVentas(ventas) {
  const contenedor = document.getElementById("ventasControl");
  if (!ventas.length) {
    contenedor.innerHTML = '<p class="pedido-vacio">Todavia no hay ventas en este turno.</p>';
    return;
  }

  contenedor.innerHTML = ventas.map((venta) => `
    <article class="venta-cuaderno control-venta">
      <div>
        <h3>Venta ${venta.numero || venta.id}</h3>
        <p class="control-detalle">
          ${fechaHora(venta.creado_en || venta.created_at)} |
          ${venta.usuario || "Sin usuario"} |
          ${medioPago(venta)} |
          ${venta.origen || "Venta"}
        </p>
        ${venta.estado === "cancelada" ? '<span class="control-estado">Cancelada</span>' : ""}
      </div>
      <strong class="control-importe">${dinero(venta.total)}</strong>
    </article>
  `).join("");
}

function calcularMovimiento(movimientos, tipo) {
  return movimientos
    .filter((movimiento) => movimiento.tipo === tipo)
    .reduce((total, movimiento) => total + Number(movimiento.importe || 0), 0);
}

async function cargarMovimientos(turnoId) {
  try {
    return await apiJson(`/turnos/${turnoId}/movimientos`);
  } catch {
    return [];
  }
}

async function actualizarControl() {
  const estado = document.getElementById("estadoControl");
  estado.textContent = "Actualizando...";

  try {
    const [turno, ventas] = await Promise.all([
      apiJson("/turnos/abierto"),
      apiJson("/ventas")
    ]);

    const movimientos = turno?.id ? await cargarMovimientos(turno.id) : [];
    const ventasDelTurno = (turno?.id ? ventas.filter((venta) => Number(venta.turno_id) === Number(turno.id)) : ventas)
      .filter(ventaActiva);

    const totalVentas = ventasDelTurno.reduce((total, venta) => total + Number(venta.total || 0), 0);
    const totalEfectivoBruto = ventasDelTurno.reduce((total, venta) => total + Number(venta.efectivo || 0), 0);
    const totalVuelto = ventasDelTurno.reduce((total, venta) => total + Number(venta.vuelto || 0), 0);
    const totalEfectivo = totalEfectivoBruto - totalVuelto;
    const totalDigital = ventasDelTurno.reduce((total, venta) => total + Number(venta.digital || 0), 0);
    const gastos = calcularMovimiento(movimientos, "gasto");
    const refuerzos = calcularMovimiento(movimientos, "refuerzo");
    const efectivoInicial = Number(turno?.efectivo_inicial || 0);
    const efectivoTeorico = efectivoInicial + refuerzos + totalEfectivo - gastos;

    document.getElementById("totalVentas").textContent = dinero(totalVentas);
    document.getElementById("totalEfectivo").textContent = dinero(totalEfectivo);
    document.getElementById("totalDigital").textContent = dinero(totalDigital);
    document.getElementById("cantidadVentas").textContent = ventasDelTurno.length;
    document.getElementById("ultimaActualizacion").textContent = `Actualizado ${fechaHora(new Date())}`;

    document.getElementById("resumenTurno").innerHTML = turno ? [
      renderFila("Estado", "Abierto"),
      renderFila("Usuario", turno.usuario || "Sin usuario"),
      renderFila("Abierto", fechaHora(turno.abierto_en || turno.created_at)),
      renderFila("Efectivo inicial", dinero(efectivoInicial)),
      renderFila("Gastos", dinero(gastos)),
      renderFila("Refuerzos", dinero(refuerzos)),
      renderFila("Ventas en efectivo", dinero(totalEfectivo)),
      renderFila("Ventas digital", dinero(totalDigital)),
      renderFila("Efectivo teorico en caja", dinero(efectivoTeorico))
    ].join("") : '<p class="pedido-vacio">No hay turno abierto.</p>';

    renderVentas(ventasDelTurno);
    estado.textContent = turno ? "Mirando el turno abierto en Supabase. Esta pantalla no modifica ventas ni caja." : "No hay turno abierto.";
  } catch (error) {
    estado.textContent = `No se pudo cargar el control: ${error.message}`;
  }
}

actualizarControl();
setInterval(actualizarControl, 30000);
