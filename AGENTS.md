# Repository Guidelines

## Project Structure & Module Organization

- `index.html` contains the reader and provider-settings UI, CSS themes, and browser runtime behavior.
- `server.mjs` is the Node.js backend: static serving, document extraction, table detection, provider authentication, RPM throttling, and SSE translation.
- `app/providers.js` holds the 20 built-in provider definitions; `app/document-store.js` wraps IndexedDB persistence.
- `assets/providers/` and `assets/ui/` contain local provider logos and interface icons.
- `config.example.json` documents local configuration. `config.local.json` is machine-specific and must remain untracked.
- There is currently no dedicated automated test directory; use the smoke checks described below.

## Build, Test, and Development Commands

```powershell
npm install                 # Install dependencies
npm start                   # Start the local server on port 4173
npm run dev                 # Start with Node's file watcher
node --check server.mjs     # Validate backend syntax
npm audit --omit=dev --audit-level=high
```

For a full manual check, open `http://127.0.0.1:4173`, import a small document, verify table rendering and a one-paragraph translation, then inspect the browser console.

## Coding Style & Naming Conventions

Use two-space indentation, semicolons, single-quoted JavaScript strings, and `camelCase` for variables/functions. Keep provider IDs lowercase and stable (for example, `openrouter`); use matching asset filenames. Prefer small, explicit functions and preserve the existing browser-compatible, dependency-light approach. Update `package-lock.json` whenever dependencies change.

## Testing Guidelines

No test framework or coverage threshold is configured. Every change should at minimum pass `node --check server.mjs`. Changes to extraction or translation should also verify `/api/health`, `/api/extract`, and `/api/translate`; changes to UI behavior should include a browser smoke test and, for visual changes, a screenshot review.

## Security & Configuration Tips

Never commit API keys or paste them into logs, screenshots, or issue reports. Store local credentials only in `config.local.json`; the backend should be the only code that reads them. Do not expose configuration files through static routes or add secrets to browser storage.

## Commit & Pull Request Guidelines

This repository has no commit history yet, so no existing convention is established. Use short imperative subjects such as `Fix PDF table extraction`. Pull requests should explain the user-visible change, list validation commands, mention configuration or migration effects, and include a redacted screenshot for UI changes. Keep unrelated formatting or generated files out of the change.
