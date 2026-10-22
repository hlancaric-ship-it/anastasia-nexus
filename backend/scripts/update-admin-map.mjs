// Doplní nové admin routy balíkov do mapy administrácie.
// Spustí sa ručne: node backend/scripts/update-admin-map.mjs
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const relativeTo = (from, to) => relative(from, to)
const mapPath = resolve(root, 'backend/docs/wp/admin-function-map.json')
const map = JSON.parse(readFileSync(mapPath, 'utf8'))

const sha = (relative) => createHash('sha256').update(readFileSync(resolve(root, relative))).digest('hex')

const additions = [
  { path: '/admin/product-catalogue', methods: ['GET'], source: 'backend/src/api/admin/product-catalogue/route.ts', feature: 'products' },
  { path: '/admin/products/:id/protected-media/upload-url', methods: ['POST'], source: 'backend/src/api/admin/products/[id]/protected-media/upload-url/route.ts', feature: 'media' },
  { path: '/admin/products/:id/protected-media/attach', methods: ['POST'], source: 'backend/src/api/admin/products/[id]/protected-media/attach/route.ts', feature: 'media' },
  { path: '/admin/products/:id/protected-media/:key', methods: ['DELETE'], source: 'backend/src/api/admin/products/[id]/protected-media/[key]/route.ts', feature: 'media' },
  { path: '/admin/nexus/loyalty-policy', methods: ['GET', 'PUT'], source: 'backend/src/api/admin/nexus/loyalty-policy/route.ts', feature: 'loyalty' },
  { path: '/admin/nexus/loyalty-customers', methods: ['GET'], source: 'backend/src/api/admin/nexus/loyalty-customers/route.ts', feature: 'loyalty' },
  { path: '/admin/nexus/customers/:id/tier', methods: ['POST'], source: 'backend/src/api/admin/nexus/customers/[id]/tier/route.ts', feature: 'loyalty' },
  { path: '/admin/nexus/customers/tiers', methods: ['POST'], source: 'backend/src/api/admin/nexus/customers/tiers/route.ts', feature: 'loyalty' },
  { path: '/admin/nexus/admin-roles', methods: ['GET', 'POST'], source: 'backend/src/api/admin/nexus/admin-roles/route.ts', feature: 'roles' },
  { path: '/admin/nexus/admin-2fa', methods: ['GET', 'POST', 'DELETE'], source: 'backend/src/api/admin/nexus/admin-2fa/route.ts', feature: 'roles' },
  { path: '/admin/nexus/admin-2fa/verify', methods: ['POST'], source: 'backend/src/api/admin/nexus/admin-2fa/verify/route.ts', feature: 'roles' },
  { path: '/admin/nexus/admin-2fa/recovery-codes', methods: ['POST'], source: 'backend/src/api/admin/nexus/admin-2fa/recovery-codes/route.ts', feature: 'roles' },
  { path: '/admin/chat/conversations', methods: ['GET', 'POST'], source: 'backend/src/api/admin/chat/conversations/route.ts', feature: 'chat' },
  { path: '/admin/nexus/orders/:id/cancel', methods: ['POST'], source: 'backend/src/api/admin/nexus/orders/[id]/cancel/route.ts', feature: 'orders' },
  { path: '/admin/nexus/orders/:id/notes', methods: ['GET', 'POST'], source: 'backend/src/api/admin/nexus/orders/[id]/notes/route.ts', feature: 'orders' },
  { path: '/admin/nexus/orders/:id/refund', methods: ['POST'], source: 'backend/src/api/admin/nexus/orders/[id]/refund/route.ts', feature: 'orders' },
  { path: '/admin/reset-program', methods: ['GET'], source: 'backend/src/api/admin/reset-program/route.ts', feature: 'access' },
  { path: '/store/reset-journal', methods: ['GET', 'POST'], source: 'backend/src/api/store/reset-journal/route.ts', feature: 'access' },
  { path: '/store/reset-journal/:id', methods: ['PATCH', 'DELETE'], source: 'backend/src/api/store/reset-journal/[id]/route.ts', feature: 'access' },
  { path: '/store/reset-program', methods: ['GET'], source: 'backend/src/api/store/reset-program/route.ts', feature: 'access' },
]

for (const addition of additions) {
  const methods = [...addition.methods].sort()
  const existing = map.custom_routes.find((row) => row.path === addition.path)
  if (existing) {
    existing.methods = methods
    existing.feature = addition.feature
    existing.sha256 = sha(addition.source)
    continue
  }
  map.custom_routes.push({ path: addition.path, methods, feature: addition.feature, source: addition.source, sha256: sha(addition.source) })
}
// Zdroj iného routy sa mohol zmeniť v paralelnej práci – hash sa osvieži,
// ale o zmene sa vypíše (posledná kontrola kontraktu je vždy ľudská).
const refreshed = []
for (const row of map.custom_routes) {
  const digest = sha(row.source)
  if (digest !== row.sha256) {
    refreshed.push(row.path)
    row.sha256 = digest
  }
}
if (refreshed.length) console.log(`Obnovený hash zdroja pre: ${refreshed.join(', ')}`)
map.custom_routes.sort((a, b) => a.path.localeCompare(b.path))

const media = map.features.find((feature) => feature.id === 'media')
const newSources = [
  'backend/src/api/admin/products/[id]/protected-media/upload-url/route.ts',
  'backend/src/api/admin/products/[id]/protected-media/attach/route.ts',
  'backend/src/api/admin/products/[id]/protected-media/[key]/route.ts',
  'backend/src/api/admin/product-catalogue/route.ts',
  'backend/src/lib/protected-library/upload.ts',
  'backend/src/lib/protected-library/storage.ts',
  'backend/src/lib/digital-products/categories.ts',
  'backend/docs/wp/digital-library-upload.md',
]
for (const source of newSources) if (!media.sources.includes(source)) media.sources.push(source)
media.remaining = 'Nahrávanie nových chránených súborov, ich pripojenie a odpojenie aj filter Fyzické/Digitálne sú implementované a overené na lokálnej DB; chýba už len produkčný bucket R2 na účte klientky a CORS pravidlo pre presigned PUT.'
media.acceptance = 'Placený súbor nie je verejný a nedá sa stiahnuť (povolené mp4/mp3/m4a/pdf); kľúč sa viaže len na vlastný produkt; cudzí kľúč je odmítnutý; pripojenie nového súboru nemení pôvodné kľúče; host bez prihlásenia nedokáže kúpiť digitálny produkt.'

const loyalty = {
  id: 'loyalty',
  sources: [
    'backend/src/api/admin/nexus/loyalty-policy/route.ts',
    'backend/src/api/admin/nexus/loyalty-customers/route.ts',
    'backend/src/api/admin/nexus/customers/[id]/tier/route.ts',
    'backend/src/api/admin/nexus/customers/tiers/route.ts',
    'backend/src/lib/loyalty/policy.ts',
    'backend/src/lib/loyalty/settings.ts',
    'backend/src/lib/loyalty/assignment.ts',
    'backend/src/lib/loyalty/auto-assign.ts',
    'backend/src/lib/nexus/loyalty-policy-sync.ts',
    'nexus/workers/api/pricing-policy-store.ts',
    'anastasia-admin/HANDOFF-vernostne-urovne.md',
  ],
  remaining: 'Politika úrovní, ručné aj automatické priradenie a synchronizácia do NEXUS Workera sú hotové; chýba KV binding v nasadenom Workeri (placeholder ID vo wrangler.jsonc) a UI administrácie. Osobné ceníky pre jednotlivé úrovne zostávajú samostatná požiadavka.',
  acceptance: 'Zľava sa počíta výhradne na serveri z politiky v databáze; klient neposiela vlastné percentá; ručne priradená úroveň sa automatickým priradením neprepíše.',
}
// Existujúci feature sa NEMÁŇA – doplnia sa len zdroje a stav (popis žiadosti ostáva).
const existingLoyalty = map.features.find((feature) => feature.id === loyalty.id)
if (existingLoyalty) {
  for (const source of loyalty.sources) if (!existingLoyalty.sources.includes(source)) existingLoyalty.sources.push(source)
  // Pôvodný popis požiadavky a akceptačné kritériá sa NEMAŽÚ – doplnia sa.
  if (!existingLoyalty.remaining.includes('Politika úrovní')) existingLoyalty.remaining = `${existingLoyalty.remaining} ${loyalty.remaining}`
  if (!existingLoyalty.acceptance.includes('z politiky v databáze')) existingLoyalty.acceptance = `${existingLoyalty.acceptance} ${loyalty.acceptance}`
  existingLoyalty.backend_status = 'IMPLEMENTED_UNVERIFIED'
} else {
  map.features.push({
    id: loyalty.id, label_sk: 'Vernostné úrovne', delivery_lane: 'NEXT', backend_layer: 'custom',
    backend_status: 'IMPLEMENTED_UNVERIFIED', new_admin_status: 'NOT_IMPLEMENTED',
    request: 'Lucia si sama nastaví zľavy a prahy věrnostných úrovní a ručne priradí zákazníka k úrovni.',
    sources: loyalty.sources, remaining: loyalty.remaining, acceptance: loyalty.acceptance,
  })
}

// Bezpečnosť administrácie: role (vlastník/asistent) a dvojfaktorové overenie.
const rolesFeature = map.features.find((feature) => feature.id === 'roles')
if (rolesFeature) {
  for (const source of [
    'backend/src/lib/admin/roles.ts',
    'backend/src/lib/admin/guard.ts',
    'backend/src/lib/admin/mfa.ts',
    'backend/src/api/admin/nexus/admin-roles/route.ts',
    'backend/src/api/admin/nexus/admin-2fa/route.ts',
    'backend/docs/wp/admin-2fa-rbac.md',
  ]) if (!rolesFeature.sources.includes(source)) rolesFeature.sources.push(source)
  rolesFeature.remaining = 'Role vlastník/asistent a dvojfaktorové overenie (TOTP) sú zavedené v backende; zostáva zapnutie TOTP providera (mfa.encryption_key v medusa-config.ts, mimo tohto balíka) a UI administrácie.'
  rolesFeature.backend_status = 'IMPLEMENTED_UNVERIFIED'
}

// Zrkadielko a štruktúra programu RESET 40+ (členská zóna) – backend hotový, obsah dodá Lucia.
const accessFeature = map.features.find((feature) => feature.id === 'access')
if (accessFeature) {
  for (const source of [
    'backend/src/api/store/reset-journal/route.ts',
    'backend/src/api/store/reset-journal/[id]/route.ts',
    'backend/src/api/store/reset-program/route.ts',
    'backend/src/api/admin/reset-program/route.ts',
    'backend/src/lib/reset-program/config.ts',
    'backend/src/lib/reset-program/structure.ts',
    'backend/src/lib/reset-program/access.ts',
    'backend/docs/wp/reset-zrkadielko.md',
  ]) if (!accessFeature.sources.includes(source)) accessFeature.sources.push(source)
  if (!accessFeature.remaining.includes('Zrkadielko')) accessFeature.remaining = `${accessFeature.remaining} Zrkadielko (záznamy zákazníka) a štruktúra programu sú v backende hotové; chýba obsah od Lucie (kompletný zoznam stĺpcov hodnotení, texty týždňov a pracovných listov) a právny základ súhlasu.`
  if (!accessFeature.acceptance.includes('cudzí záznam')) accessFeature.acceptance = `${accessFeature.acceptance} Zrkadielko: záznam patrí zákazníkovi – cudzí záznam sa nedá prečítať, upraviť ani zmazať; hodnotenie je 1–10 a dátum nie je v budúcnosti.`
}

const newTests = [
  'backend/src/lib/protected-library/__tests__/upload.unit.spec.ts',
  'backend/src/lib/protected-library/__tests__/storage.unit.spec.ts',
  'backend/src/lib/reset-program/__tests__/config.unit.spec.ts',
  'backend/src/lib/reset-program/__tests__/structure.unit.spec.ts',
  'backend/src/modules/reset-journal/__tests__/policy.unit.spec.ts',
  'backend/src/modules/reset-journal/__tests__/service.unit.spec.ts',
  'backend/src/api/store/reset-journal/__tests__/route.unit.spec.ts',
  'backend/integration-tests/http/reset-journal-http-checks.ts',
  'backend/integration-tests/http/reset-journal.spec.ts',
  'backend/src/lib/digital-products/__tests__/categories.unit.spec.ts',
  'backend/src/api/admin/products/[id]/protected-media/__tests__/library-upload.unit.spec.ts',
  'backend/src/api/admin/products/[id]/protected-media/__tests__/delete-key-routing.unit.spec.ts',
  'backend/src/api/admin/product-catalogue/__tests__/route.unit.spec.ts',
  'backend/src/api/store/nexus-checkout/__tests__/digital-guest-checkout.unit.spec.ts',
  'backend/src/api/store/nexus-cart/__tests__/loyalty-pricing.unit.spec.ts',
  'backend/src/scripts/e2e-digital-library.ts',
  'backend/src/scripts/e2e-loyalty-tiers.ts',
  'backend/src/lib/loyalty/__tests__/policy.unit.spec.ts',
  'backend/src/lib/loyalty/__tests__/settings.unit.spec.ts',
  'backend/src/lib/loyalty/__tests__/auto-assign.unit.spec.ts',
  'backend/src/lib/nexus/__tests__/loyalty-policy-sync.unit.spec.ts',
  'backend/src/api/admin/nexus/__tests__/loyalty-policy.unit.spec.ts',
  'backend/src/api/admin/nexus/__tests__/loyalty-customers.unit.spec.ts',
  'backend/src/api/admin/nexus/__tests__/customer-tier.unit.spec.ts',
  'nexus/tests/unit/pricingPolicy.test.ts',
  'nexus/tests/workers/pricingPolicy.test.ts',
  'storefront-prototype/test/digital-products.test.mjs',
]
for (const source of newTests) if (!map.test_sources.includes(source)) map.test_sources.push(source)
map.test_sources.sort()

// Router Workera: nový endpoint musí byť v mape (kontrola `worker_router_cases`).
const workerSource = readFileSync(resolve(root, 'nexus/workers/api/index.ts'), 'utf8')
map.worker_router_cases = [...workerSource.matchAll(/case\s+'([^']+)'/g)].map((match) => match[1])

// Zoznam zdrojových jednotiek (subscribers, moduly…) musí sedieť s diskom.
const globToRegExp = (pattern) => new RegExp(`^${pattern
  .replace(/[.+^${}()|[\]\\]/g, '\\$&')
  .replace(/\*\*\//g, '__GLOBSTAR__/')
  .replace(/\*/g, '[^/]*')
  .replace(/__GLOBSTAR__\//g, '(?:.*/)?')}$`)
const collect = (pattern) => {
  const regexp = globToRegExp(pattern)
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name)
      const relative = relativeTo(root, full).split(sep).join('/')
      if (entry.isDirectory()) {
        if (relative.includes('__tests__')) continue
        walk(full)
      } else if (regexp.test(relative) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts')) {
        out.push(relative)
      }
    }
  }
  walk(root)
  return out.sort()
}
const sourcePatterns = {
  jobs: 'backend/src/jobs/*.ts', subscribers: 'backend/src/subscribers/*.ts',
  workflows: 'backend/src/workflows/*.ts', models: 'backend/src/modules/*/models/*.ts',
  modules: 'backend/src/modules/*/index.ts', nexus_domains: 'nexus/domains/*/*.ts',
  nexus_connectors: 'nexus/connectors/**/*.ts',
}
for (const [kind, pattern] of Object.entries(sourcePatterns)) map.source_units[kind] = collect(pattern)

writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`)
console.log(`Mapa administrácie aktualizovaná: ${map.custom_routes.length} custom routov, ${map.test_sources.length} testovacích zdrojov.`)
