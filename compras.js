const STOCK_KEY = "ponteDulceStockIngredientes";

function normalizar(texto) {
  return texto.trim().toLowerCase();
}

function obtenerStock() {
  try {
    return JSON.parse(localStorage.getItem(STOCK_KEY)) || {};
  } catch {
    return {};
  }
}

function guardarStock(stock) {
  localStorage.setItem(STOCK_KEY, JSON.stringify(stock));
}

function formatoGramos(gramos) {
  if (gramos >= 1000) return `${(gramos / 1000).toLocaleString("es-AR")} kg`;
  return `${Number(gramos).toLocaleString("es-AR")} g`;
}

function renderizarStock() {
  const lista = document.getElementById("listaStock");
  const ingredientes = Object.values(obtenerStock()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (!ingredientes.length) {
    lista.innerHTML = '<p class="pedido-vacio">Todavia no hay ingredientes cargados.</p>';
    return;
  }
  lista.innerHTML = ingredientes.map((ingrediente) => `<article class="producto-card"><strong>${ingrediente.nombre}</strong><span>${formatoGramos(ingrediente.gramos)}</span></article>`).join("");
}

document.getElementById("formCompra").addEventListener("submit", (evento) => {
  evento.preventDefault();
  const nombre = document.getElementById("nombreIngrediente").value.trim();
  const cantidad = Number(document.getElementById("cantidadIngrediente").value);
  const unidad = document.getElementById("unidadIngrediente").value;
  const gramos = unidad === "kg" ? cantidad * 1000 : cantidad;
  const clave = normalizar(nombre);
  const stock = obtenerStock();
  stock[clave] = stock[clave] || { nombre, gramos: 0 };
  stock[clave].nombre = nombre;
  stock[clave].gramos += gramos;
  guardarStock(stock);
  evento.target.reset();
  renderizarStock();
});

renderizarStock();
