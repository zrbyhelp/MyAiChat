# myaichat

`myaichat` is a local full-stack chat project with a Vue front end and a Node/Express back end.

## Project Structure

- `chat/`: Vue 3 + Vite front end
- `main/`: Node.js + Express back end

## Requirements

- Node.js `20.19.0+` or `22.12.0+`

## Run Locally

Front end:

```powershell
cd chat
pnpm install
pnpm dev
```

Back end:

```powershell
cd main
npm install
npm run dev
```

## Notes

- `node_modules/`, build output, logs, and local session data are ignored by Git.
- `main/data/sessions.json` is treated as local runtime data and is not committed.
