# Stage 1 Fix: Frontend Docker Hosting

This stage adds a production frontend container and routes it through Caddy.

## Added

- `selfhost/frontend/Dockerfile`
- `selfhost/frontend/nginx.conf`
- `frontend` service in `docker-compose.yml`
- `APP_DOMAIN` and `VITE_API_BASE_URL` support in `selfhost/.env.production`
- Caddy site block for `APP_DOMAIN`

## Required VPS values

```env
APP_DOMAIN=app.example.com
API_DOMAIN=api.example.com
PUBLIC_URL=https://api.example.com
CORS_ORIGIN=https://app.example.com,https://api.example.com
VITE_API_BASE_URL=https://api.example.com/api
```

The frontend is built during `docker compose up -d --build`. The VPS must have outbound access to npm.
