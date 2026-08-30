# 3B Pot (`3bpot`)

Plataforma arcade de juegos (créditos virtuales) con portal de jugadores, terminal de máquinas (`/inicio`), paneles admin / agente / cajero, API Express y despliegue Netlify.

## Arranque local

```bash
npm install
cp .env.example .env   # o backend/.env.example
npm run dev
```

Por defecto: [http://127.0.0.1:43145/portal/](http://127.0.0.1:43145/portal/) (si `PORT=43145` en `.env`; si no, puerto `3000`).

Admin: usuario/contraseña de `ADMIN_USER` / `ADMIN_PASSWORD` (por defecto `admin` / `admin123`).

Crea agentes, sucursales, cajeros y jugadores desde `/admin/`.

## Rutas

| Ruta | Uso |
|------|-----|
| `/portal/` | Lobby jugadores |
| `/inicio/` | Terminal de máquina (`?branch=&m=`) |
| `/admin/` | Administración |
| `/agente/` | Agentes |
| `/cajero/` | Caja / sucursal |
| `/spin-game/`, `/comic-slot/`, … | Juegos |

## Netlify

```bash
npm run build
```

Variables en el dashboard: `JWT_SECRET`, `ADMIN_USER`, `ADMIN_PASSWORD`. Activa **Netlify Blobs** (la DB serverless usa el store `winpot-db`).

## Repo

https://github.com/aba3bs-arch/3bpot
