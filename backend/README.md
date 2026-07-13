# Backend Cafeteria Josue

Backend Node.js sin dependencias externas para conectar el sistema de cafeteria con Supabase.

## Configuracion

1. Copiar `.env.example` como `.env`.
2. Pegar la `SUPABASE_SECRET_KEY` en `.env`.
3. En Supabase SQL Editor, ejecutar `supabase/02_rpc_registrar_venta_completa.sql`.
4. Iniciar el servidor:

```powershell
node server.js
```

El servidor queda en:

```text
http://localhost:3000
```

## Rutas

- `GET /api/health`
- `GET /api/productos`
- `GET /api/ventas`
- `GET /api/turnos/abierto`
- `POST /api/turnos/abrir`
- `POST /api/turnos/movimiento`
- `POST /api/ventas`
- `POST /api/facturar` pendiente para ARCA

## Deploy en Render

El archivo `render.yaml` de la raiz deja configurado el servicio web.
En Render solo falta conectar el repositorio y cargar la variable privada:

```text
SUPABASE_SECRET_KEY
```

No subir `.env` a GitHub.
