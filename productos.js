const PRODUCTOS_KEY = "ponteDulceProductos";
const STOCK_KEY = "ponteDulceStockIngredientes";

const productosBase = [
  { id: 1, nombre: "Combo desayuno", precio: 3500, categoria: "combos", tipo: "comprado", ingredientes: [] },
  { id: 2, nombre: "Cafe con leche", precio: 1400, categoria: "bebidas", tipo: "preparado", ingredientes: [{ nombre: "Cafe", gramos: 50 }] },
  { id: 3, nombre: "Te", precio: 1100, categoria: "bebidas", tipo: "preparado", ingredientes: [{ nombre: "Te", gramos: 5 }] },
  { id: 4, nombre: "Exprimido naranja", precio: 1800, categoria: "exprimidos", tipo: "preparado", ingredientes: [{ nombre: "Naranja", gramos: 250 }] },
  { id: 5, nombre: "Tostado", precio: 2600, categoria: "salado", tipo: "comprado", ingredientes: [] },
  { id: 6, nombre: "Medialuna", precio: 700, categoria: "dulce", tipo: "comprado", ingredientes: [] }
];

function obtenerProductos() {
  const guardados = localStorage.getItem(PRODUCTOS_KEY);
  if (!guardados) {
    guardarProductos(productosBase);
    return productosBase;
  }
  try {
    return JSON.parse(guardados).map((producto) => { const base = productosBase.find((item) => item.id === producto.id || item.nombre === producto.nombre); return producto.tipo ? { tipo: "comprado", ingredientes: [], ...producto } : { ...(base || {}), ...producto, tipo: (base && base.tipo) || "comprado", ingredientes: (base && base.ingredientes) || [] }; });
  } catch {
    guardarProductos(productosBase);
    return productosBase;
  }
}

function guardarProductos(productos) {
  localStorage.setItem(PRODUCTOS_KEY, JSON.stringify(productos));
}

function formatoPrecio(valor) {
  return Number(valor).toLocaleString("es-AR");
}

function formatoGramos(gramos) {
  if (gramos >= 1000) return `${(gramos / 1000).toLocaleString("es-AR")} kg`;
  return `${Number(gramos).toLocaleString("es-AR")} g`;
}

function nombreCategoria(categoria) {
  return { combos: "Combos", bebidas: "Café / Té", exprimidos: "Exprimidos", salado: "Salado", dulce: "Dulce", panaderia: "Panaderia", almacen: "Almacen", otros: "Otros" }[categoria] || categoria;
}

function agregarFilaIngrediente(nombre = "", gramos = "") {
  const fila = document.createElement("div");
  fila.className = "fila-ingrediente";
  fila.innerHTML = `<input class="ingrediente-nombre" type="text" placeholder="Ingrediente" value="${nombre}"><input class="ingrediente-gramos" type="number" min="0.001" step="0.001" placeholder="Gramos" value="${gramos}"><button type="button" class="boton-secundario" onclick="this.parentElement.remove()">Quitar</button>`;
  document.getElementById("filasIngredientes").appendChild(fila);
}

function leerIngredientes() {
  return [...document.querySelectorAll(".fila-ingrediente")]
    .map((fila) => ({
      nombre: fila.querySelector(".ingrediente-nombre").value.trim(),
      gramos: Number(fila.querySelector(".ingrediente-gramos").value)
    }))
    .filter((ingrediente) => ingrediente.nombre && ingrediente.gramos > 0);
}

function renderizarProductos() {
  const lista = document.getElementById("listaProductos");
  const productos = obtenerProductos();
  if (!productos.length) {
    lista.innerHTML = '<p class="pedido-vacio">Todavia no hay productos cargados.</p>';
    return;
  }
  lista.innerHTML = productos.map((producto) => {
    const receta = producto.tipo === "preparado" && producto.ingredientes.length
      ? producto.ingredientes.map((ingrediente) => `${ingrediente.nombre}: ${formatoGramos(ingrediente.gramos)}`).join("<br>")
      : "Se compra hecho, no descuenta ingredientes.";
    return `<article class="producto-card"><strong>${producto.nombre}</strong><span class="producto-categoria">${nombreCategoria(producto.categoria)} - ${producto.tipo === "preparado" ? "Preparado" : "Comprado"}</span><span>$${formatoPrecio(producto.precio)}</span><small>${receta}</small><button onclick="eliminarProducto(${producto.id})">Eliminar</button></article>`;
  }).join("");
}

function eliminarProducto(id) {
  guardarProductos(obtenerProductos().filter((producto) => producto.id !== id));
  renderizarProductos();
}

document.getElementById("tipoProducto").addEventListener("change", (evento) => {
  document.getElementById("recetaProducto").style.display = evento.target.value === "preparado" ? "grid" : "none";
});

document.getElementById("formProducto").addEventListener("submit", (evento) => {
  evento.preventDefault();
  const tipo = document.getElementById("tipoProducto").value;
  const productos = obtenerProductos();
  productos.push({
    id: Date.now(),
    nombre: document.getElementById("nombreProducto").value.trim(),
    precio: Number(document.getElementById("precioProducto").value),
    categoria: document.getElementById("categoriaProducto").value,
    tipo,
    ingredientes: tipo === "preparado" ? leerIngredientes() : []
  });
  guardarProductos(productos);
  evento.target.reset();
  document.getElementById("filasIngredientes").innerHTML = "";
  agregarFilaIngrediente();
  renderizarProductos();
});

agregarFilaIngrediente();
renderizarProductos();
