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

function formatoPrecio(valor) {
  return Number(valor).toLocaleString("es-AR");
}

function formatoGramos(gramos) {
  if (gramos >= 1000) return `${(gramos / 1000).toLocaleString("es-AR")} kg`;
  return `${Number(gramos).toLocaleString("es-AR")} g`;
}

function nombreCategoria(categoria) {
  return { combos: "Combos", bebidas: "Cafe / Te", exprimidos: "Exprimidos", salado: "Salado", dulce: "Dulce", panaderia: "Panaderia", almacen: "Almacen", otros: "Otros" }[categoria] || categoria;
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

async function obtenerProductos() {
  return apiJson("/productos");
}

async function renderizarProductos() {
  const lista = document.getElementById("listaProductos");
  lista.innerHTML = '<p class="pedido-vacio">Cargando productos desde la base...</p>';
  try {
    const productos = await obtenerProductos();
    if (!productos.length) {
      lista.innerHTML = '<p class="pedido-vacio">Todavia no hay productos cargados.</p>';
      return;
    }
    lista.innerHTML = productos.map((producto) => {
      const ingredientes = producto.ingredientes || [];
      const receta = producto.tipo === "preparado" && ingredientes.length
        ? ingredientes.map((ingrediente) => `${ingrediente.nombre}: ${formatoGramos(ingrediente.gramos)}`).join("<br>")
        : "Se compra hecho, no descuenta ingredientes.";
      return `<article class="producto-card"><strong>${producto.nombre}</strong><span class="producto-categoria">${nombreCategoria(producto.categoria)} - ${producto.tipo === "preparado" ? "Preparado" : "Comprado"}</span><span>$${formatoPrecio(producto.precio)}</span><small>${receta}</small><button onclick="eliminarProducto(${producto.id})">Eliminar</button></article>`;
    }).join("");
  } catch (error) {
    lista.innerHTML = `<p class="pedido-vacio">No se pudieron cargar productos: ${error.message}</p>`;
  }
}

async function eliminarProducto(id) {
  if (!confirm("Eliminar este producto de la base de datos?")) return;
  try {
    await apiJson(`/productos/${id}`, { method: "DELETE" });
    await renderizarProductos();
  } catch (error) {
    alert(`No se pudo eliminar. Si ya fue vendido, conviene desactivarlo en vez de borrarlo. Detalle: ${error.message}`);
  }
}

document.getElementById("tipoProducto").addEventListener("change", (evento) => {
  document.getElementById("recetaProducto").style.display = evento.target.value === "preparado" ? "grid" : "none";
});

document.getElementById("formProducto").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const tipo = document.getElementById("tipoProducto").value;
  const producto = {
    nombre: document.getElementById("nombreProducto").value.trim(),
    precio: Number(document.getElementById("precioProducto").value),
    categoria: document.getElementById("categoriaProducto").value,
    tipo,
    ingredientes: tipo === "preparado" ? leerIngredientes() : []
  };

  try {
    await apiJson("/productos", { method: "POST", body: producto });
    evento.target.reset();
    document.getElementById("filasIngredientes").innerHTML = "";
    agregarFilaIngrediente();
    await renderizarProductos();
  } catch (error) {
    alert(`No se pudo guardar el producto en la base: ${error.message}`);
  }
});

agregarFilaIngrediente();
renderizarProductos();
