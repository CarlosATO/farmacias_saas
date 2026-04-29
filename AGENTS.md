# AGENTS.md

## Stack Real
- Frontend: Vite + React 19 + React Router.
- UI: Tailwind + Lucide React.
- Backend client: Supabase JS.
- Dev: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`

## Source Of Truth
- Prefer executable source over prose.
- Pharmacy data access must go through `getPharmacySchema()` in `src/farmacia/api/pharmacyClient.js`.
- All pharmacy business tables live in schema `pharmacy`.
- SaaS company resolution currently depends on `public.company_users` via `getMyCompanyId()`.

## Multi-tenant Rules
- Always include `company_id` in new pharmacy writes.
- If data is branch-specific, also include `warehouse_id`.
- Never implement logic that can mix companies or branches in frontend state or queries.
- Active branch comes from `SucursalContext.jsx` as `activeWarehouse`.

## Important Existing Architecture
- POS route: `/pos`
- Cash control route: `/control-caja`
- Inventory quick view route: `/inventario`
- Kardex index/detail: `/kardex`, `/kardex/:productId`
- Batch map index/detail: `/mapa-lotes`, `/mapa-lotes/:productId`

## UI Rules
- Follow `Reglas/formato y diseño.md`.
- Primary color: `#4C3073`.
- Background: `#f8f9fa`.
- Use `bg-white`, `border-gray-200`, `shadow-sm`.
- Avoid heavy shadows, gradients, and playful motion.
- Administrative navigation uses Ribbon-style top bars, not floating dropdown menus.

## POS / Inventory Rules
- POS must never sell stock from `QUARANTINE`.
- POS must prioritize `SALES` location before FEFO fallback.
- Product availability in POS must use `stock_disponible`, not total stock.
- Quarantine stock is informational only and must not enable sale.

## Cash Control Rules
- Sales must be linked to an open `pharmacy.pos_sessions` row before checkout.
- If no session is open, POS must block sale.
- Cash movements live in `pharmacy.cash_movements`.
- Keep cash control logic branch-specific and user/session-specific.

## Known Risk To Verify Before Editing Cash Control
- `base_datos_schema_pharmacy.md` documents `pharmacy.pos_sessions` with `start_time`, `end_time` and `difference`.
- Do not assume alternative column names like `opened_at`, `closed_at`, `expected_balance` or `difference_amount` unless the live DB proves otherwise.
- `pharmacy.sales` includes `session_id` and should be the source of truth for cash sales per shift.
