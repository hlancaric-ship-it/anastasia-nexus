// Výpočet výrezu fotografie pre newsletter: obrázok vyplní výrez, posun nejde za okraj fotografie.
// Spustenie: node anastasia-admin/test/photo-crop.mjs
import { cropLayout, cropShape, CROP_SHAPES } from '../photo-crop.mjs';

let checks = 0;
const assert = (ok, msg) => {
  if (!ok) throw new Error(msg);
  checks += 1;
};
const near = (a, b) => Math.abs(a - b) < 1e-6;

const dark = CROP_SHAPES.dark;
// 1) Zoom 1: široká fotografia vyplní výšku výrezu a je vycentrovaná.
let l = cropLayout(2400, 1500, dark, 1, 0, 0);
assert(near(l.h, dark.height) && l.w > dark.width, 'Široká fotografia nevyplní výšku výrezu.');
assert(near(l.left, (dark.width - l.w) / 2) && near(l.top, 0), 'Fotografia nie je vycentrovaná.');

// 2) Posun za okraj sa zastaví na hrane fotografie.
l = cropLayout(2400, 1500, dark, 1, 99999, 99999);
assert(near(l.left, 0) && near(l.top, 0), 'Posun doprava ide za okraj fotografie.');
l = cropLayout(2400, 1500, dark, 1, -99999, 0);
assert(near(l.left + l.w, dark.width), 'Posun doľava ide za okraj fotografie.');

// 3) Zväčšenie zväčší obrázok, zmenšenie ho nechá celý vo výreze.
l = cropLayout(1000, 1000, dark, 2, 0, 0);
assert(near(l.w, dark.height * 2), 'Zväčšenie nezväčšilo fotografiu.');
l = cropLayout(1000, 1000, dark, 0.5, 9999, 9999);
assert(l.left >= 0 && l.top >= 0 && l.left + l.w <= dark.width + 1e-6 && l.top + l.h <= dark.height + 1e-6, 'Zmenšená fotografia vyšla z výrezu.');

// 4) Neznámy štýl sekcie dostane výrez svetlej sekcie, tmavá má oblúk ako na webe.
assert(cropShape('neznamy') === CROP_SHAPES.light && cropShape('') === CROP_SHAPES.light, 'Neznámy štýl nemá predvolený výrez.');
assert(near(dark.height / dark.width, 453 / 340) && /0$/.test(dark.radius), 'Tmavý výrez nemá pomer 3:4 a rovný ľavý dolný roh.');

console.log(`photo-crop: ${checks} kontrol OK`);
