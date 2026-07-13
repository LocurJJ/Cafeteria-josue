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

function formatoGramos(gramos) {
  if (gramos >= 1000) return `${(gramos / 1000).toLocaleString("es-AR")} kg`;
  return `${Number(gramos).toLocaleString("es-AR")} g`;
}

async function renderizarStock() {
  const lista = document.getElementById("listaStock");
  lista.innerHTML = '<p class="pedido-vacio">Cargando stock desde la base...</p>';
  try {
    const ingredientes = await apiJson("/stock");
    if (!ingredientes.length) {
      lista.innerHTML = '<p class="pedido-vacio">Todavia no hay ingredientes cargados.</p>';
      return;
    }
    lista.innerHTML = ingredientes.map((ingrediente) => `<article class="producto-card"><strong>${ingrediente.nombre}</strong><span>${formatoGramos(ingrediente.gramos)}</span></article>`).join("");
  } catch (error) {
    lista.innerHTML = `<p class="pedido-vacio">No se pudo cargar el stock: ${error.message}</p>`;
  }
}

document.getElementById("formCompra").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const nombre = document.getElementById("nombreIngrediente").value.trim();
  const cantidad = Number(document.getElementById("cantidadIngrediente").value);
  const unidad = document.getElementById("unidadIngrediente").value;
  const gramos = unidad === "kg" ? cantidad * 1000 : cantidad;

  try {
    await apiJson("/stock/compra", { method: "POST", body: { nombre, gramos } });
    evento.target.reset();
    await renderizarStock();
  } catch (error) {
    alert(`No se pudo registrar la compra en la base: ${error.message}`);
  }
});

renderizarStock();
