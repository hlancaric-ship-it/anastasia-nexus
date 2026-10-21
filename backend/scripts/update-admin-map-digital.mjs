// Doplní nové admin routy balíku „digitálne produkty“ do mapy administrácie.
// Spustí sa ručne: node backend/scripts/update-admin-map-digital.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const mapPath = resolve(root, 'backend/docs/wp/admin-function-map.json')
const map = JSON.parse(readFileSync(mapPath, 'utf8'))

const sha = (relative) => createHash('sha256').update(readFileSync(resolve(root, relative))).digest('hex')

const additions = [
  { path: '/admin/product-catalogue', methods: ['GET'], source: 'backend/src/api/admin/product-catalogue/route.ts' },
  { path: '/admin/products/:id/protected-media/upload-url', methods: ['POST'], source: 'backend/src/api/admin/products/[id]/protected-media/upload-url/route.ts' },
  { path: '/admin/products/:id/protected-media/attach', methods: ['POST'], source: 'backend/src/api/admin/products/[id]/protected-media/attach/route.ts' },
  { path: '/admin/products/:id/protected-media/:key', methods: ['DELETE'], source: 'backend/src/api/admin/products/[id]/protected-media/[key]/route.ts' },
]

for (const addition of additions) {
  const existing = map.custom_routes.find((row) => row.path === addition.path)
  if (existing) {
    existing.methods = addition.methods
    existing.sha256 = sha(addition.source)
    continue
  }
  map.custom_routes.push({ ...addition, feature: 'media', sha256: sha(addition.source) })
}
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

const newTests = [
  'backend/src/lib/protected-library/__tests__/upload.unit.spec.ts',
  'backend/src/lib/protected-library/__tests__/storage.unit.spec.ts',
  'backend/src/lib/digital-products/__tests__/categories.unit.spec.ts',
  'backend/src/api/admin/products/[id]/protected-media/__tests__/library-upload.unit.spec.ts',
  'backend/src/api/admin/product-catalogue/__tests__/route.unit.spec.ts',
  'backend/src/api/store/nexus-checkout/__tests__/digital-guest-checkout.unit.spec.ts',
  'backend/src/scripts/e2e-digital-library.ts',
  'storefront-prototype/test/digital-products.test.mjs',
]
for (const source of newTests) if (!map.test_sources.includes(source)) map.test_sources.push(source)
map.test_sources.sort()

writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`)
console.log(`Mapa administrácie aktualizovaná: ${map.custom_routes.length} custom routov, ${map.test_sources.length} testovacích zdrojov.`)
