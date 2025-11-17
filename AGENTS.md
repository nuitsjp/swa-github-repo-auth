# Repository Guidelines

## Primary Directive

- Think in English, interact with the user in Japanese.

## Project Structure & Module Organization
The repository ships with reference docs at the root (`README.md`, `LICENSE`, `SECRET.json`). Place Azure Functions under `api/`, each in its own PascalCase subfolder (`api/GetRoles/index.js`, `function.json`). Keep `staticwebapp.config.json` and any front-end assets at the project root. Treat `SECRET.json` as a local sample only—never commit live secrets.

## Build, Test, and Development Commands
Install function dependencies before any local work:

```bash
cd api
npm install
```

Start an end-to-end local session with the Static Web Apps CLI (runs front end + Functions + auth emulator):

```bash
npx swa start --api-location api --swa-config staticwebapp.config.json
```

## Coding Style & Naming Conventions
JavaScript/TypeScript in Azure Functions should use 2-space indentation, `const`/`let` over `var`, and camelCase for variables and helpers (mirroring the samples in `README.md`). Function directories must match the exported handler name (e.g., `GetRoles`) to satisfy Azure Static Web Apps discovery. Keep configuration keys uppercase with underscores (`GITHUB_REPO_OWNER`, `GITHUB_APP_PRIVATE_KEY`). Commit JSON with stable key ordering to reduce diff noise.

## Testing Guidelines
Validation is manual today: after `npx swa start`, hit `/.auth/me` and role-locked routes like `/admin/` to confirm role mapping. When adding automated coverage, keep Jest or Vitest specs under `api/__tests__`, expose the handler for import, and wire `"test": "jest"` in `api/package.json` so `npm test` exercises both success and error paths.

## Commit & Pull Request Guidelines
History favors concise subject lines with a short scope prefix (`README: ...`). Use `<Area>: <Japanese or English summary>` within 72 characters and add configuration or security context in the body. Pull requests should outline user impact, enumerate environment variables or Azure settings touched, attach screenshots or CLI output for access changes, and reference related issues while confirming secrets stay out of git.

## Security & Configuration Tips
Store operational secrets in Azure App Settings or Key Vault; keep `SECRET.json` strictly for local scaffolding. Limit OAuth scopes to `repo`, scrub logs for tokens, and review `staticwebapp.config.json` diffs carefully—tweaks to `allowedRoles` or `rolesSource` immediately change who can reach protected pages.
