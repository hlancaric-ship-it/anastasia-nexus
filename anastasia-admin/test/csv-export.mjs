// Regresný test exportu CSV: vzorce sa nesmú v tabuľkovom editore spustiť.
// Spustenie: node anastasia-admin/test/csv-export.mjs
import { csvCell } from '../csv.mjs';

let checks = 0;
const assert = (ok, msg) => { if (!ok) throw new Error(msg); checks++; };

for (const evil of ['=HYPERLINK("https://evil.test","klik")', '+1+1', '-2+3', '@SUM(A1)', '\t=1', '\r=1']) {
  const cell = csvCell(evil);
  assert(cell.startsWith(`"'`), `vzorec nie je zneškodnený: ${JSON.stringify(evil)} → ${cell}`);
}
assert(csvCell('Jana "Janka" Nová') === '"Jana ""Janka"" Nová"', 'úvodzovky sa nezdvojili');
assert(csvCell('riadok\nďalší') === '"riadok ďalší"', 'nový riadok ostal v bunke');
assert(csvCell(null) === '""', 'prázdna hodnota');
assert(csvCell(42.5) === '"42.5"', 'číslo sa zmenilo');
assert(csvCell('-12.00') === '"-12.00"', 'záporná suma dostala apostrof');
assert(csvCell('-1+1').startsWith(`"'`), 'výraz so znamienkom nie je zneškodnený');
assert(csvCell('obj-1') === '"obj-1"', 'bežný text sa zmenil');
console.log(`csv-export: ${checks} kontrol OK`);
