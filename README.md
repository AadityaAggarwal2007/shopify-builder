# Shopify Builder

Internal tool for the ShipTrack team: build a Shopify store from a product CSV, drag-and-drop photos,
banners and a reference website. Lives at `https://merchantbuild.in` on the same VPS as ShipTrack.

Read `AGENTS.md` first: it is the rulebook for any AI or person working in this repo.

```bash
npm install
cp .env.example .env.local      # local database + a throwaway password
psql -d builder -f sql/001-init.sql
npm run dev                     # http://localhost:3001
npm test && npx tsc --noEmit && npm run build
```
