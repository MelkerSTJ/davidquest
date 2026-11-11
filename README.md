# ⚔️ DavidQuest – Riddaren som lagar fibernätet

Ett 3D-äventyr i webbläsaren. Grävlingarna har grävt av fibern och hela riket är offline.
Sir David drar Fiberklingan, besegrar grävlingarna, skarvar fibern enligt färgkoden och
tar till sist upp kampen mot **Grävskopan** – en mekanisk grävmaskinsdrake.

Byggt med [Three.js](https://threejs.org) + Vite. Inga externa resurser – landskap, hjälte,
fiender, ljud och musik genereras i koden. Ansiktet på riddaren är ett foto som böjs runt huvudet.

## Spela

| | Dator | Mobil |
|---|---|---|
| Gå | WASD / piltangenter | Vänster tumme (styrspak) |
| Kamera | Dra med musen, scrolla för zoom | Dra på höger sida |
| Hugg | Klick / Space | ⚔️ |
| Rusa | Shift | 💨 |
| Skarva fibern | E vid en nod | 🔧 Laga |
| Selfie-kamera | C | 🤳 |

1. Följ de röda ljuspelarna till de avgrävda noderna.
2. Besegra grävlingarna.
3. Skarva fibern – para ihop färgerna (blå, orange, grön, brun, grå, vit, röd, svart, gul, violett, rosa, turkos).
4. När tre noder är online faller barriären runt Bergsnoden. Där väntar Grävskopan.
   Undvik den röda cirkeln – hugg på skopan när den sitter fast i marken (dubbel skada).

## Utveckling

```bash
npm install
npm run dev            # lokal server
npm run build          # produktion -> dist/
npm run build:single   # allt i en enda HTML-fil -> dist-single/
```

`?low` i URL:en tvingar lägre grafikinställningar.

## Deploy på Vercel

Importera repot på vercel.com/new – Vite känns igen automatiskt (`npm run build`, output `dist`).
