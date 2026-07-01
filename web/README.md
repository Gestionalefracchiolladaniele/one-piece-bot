# Claupiece — Web dashboard

Dashboard Next.js (App Router) per gestire la watchlist One Piece TCG e vedere gli
ultimi affari. Deploy su Vercel. Front end **riadattato da LinkedinGoat**: sfondo
**aurora viola**, **card e bottoni bianchi** (funzionali), font ottimizzati (`next/font`).

## Sviluppo
```bash
pnpm install
cp .env.example .env.local   # riempi le chiavi Supabase
pnpm dev                     # http://localhost:3000
```

## Build / deploy
```bash
pnpm build                   # build di produzione (Turbopack)
pnpm start                   # serve la build
```
Su **Vercel**: importa la cartella `web/` come progetto (framework Next.js) e imposta
le env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`.

## Struttura
- `src/app/page.tsx` — dashboard (client component).
- `src/app/api/*` — route server (service role): watchlist, cards, deals, config, prices.
- `src/components/AuroraBackground.tsx` — sfondo aurora viola (ottimizzato).
- `src/app/globals.css` — token viola + classi `.card` / `.btn` / `.field` (card bianche).
- `src/lib/` — supabase (admin/browser), env, types.

> Lo schema Supabase è in `../schema.sql` (RLS deny-all): le letture/scritture passano
> tutte dalle API route con la service role, mai dal client anon.
