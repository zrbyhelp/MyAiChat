# admin

`admin/` is the MyAiChat back-office frontend. It is built on top of `vue-pure-admin`, but the actual backend for this project is provided by the root `main` service through `/admin-api/*`.

This file documents the current project, not the upstream template.

## What It Is Used For

- admin login and permission entry
- system management for users, roles, departments, and menus
- storage settings, monitoring logs, and system settings
- survey / workflow pages already wired into the back office
- integration with the seed and schema bootstrap in `main/src/admin-backoffice.mjs`

## Run Locally

1. Prepare env file

```bash
cp admin/.env.example admin/.env
```

2. Install dependencies and start

```bash
cd admin
pnpm install
pnpm dev
```

Default local URL: `http://127.0.0.1:8081`

## Important Environment Variables

- `ADMIN_PORT`: local frontend port
- `VITE_PORT`: compatibility port variable inherited from the template
- `VITE_ADMIN_API_BASE_URL`: dev proxy target pointing to `main`
- `VITE_ROUTER_HISTORY`: currently defaults to `hash`

## Login Notes

The admin UI depends on the bootstrap performed when `main` starts. The default seeded admin account is defined in `main/admin-api/database/seeds/userSeed.js`:

- username: `admin`
- password: `123456`

If login fails, check:

- whether `main` is running
- whether `main` finished admin schema sync and seed initialization
- whether `VITE_ADMIN_API_BASE_URL` points to the correct `main` instance

## Common Commands

```bash
cd admin
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
```
