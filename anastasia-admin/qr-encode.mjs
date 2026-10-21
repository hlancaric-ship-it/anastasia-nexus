// --- QR kód pre dvojfaktorové overenie (TOTP) ---
// Bez externých knižníc a bez siete: bajtový režim, úroveň korekcie chýb M,
// verzie 1–10 (postačí pre odkaz otpauth://). Tajomstvo nikdy neopúšťa prehliadač.
//
// Postup: bajty → bitový zápis (režim + dĺžka + údaje + výplň) → kódové slová,
// Reed-Solomon korekcia (GF(256), polynóm 0x11D) → zamiešanie blokov → mriežka
// (funkčné vzory, značky formátu a verzie) → výber masky podľa penalizácie.
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x; GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();
const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);

function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecLen) {
  const gen = rsGenerator(ecLen);
  const buf = data.concat(new Array(ecLen).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coef = buf[i];
    if (coef === 0) continue;
    for (let j = 1; j < gen.length; j++) buf[i + j] ^= gfMul(gen[j], coef);
  }
  return buf.slice(data.length);
}

// Úroveň korekcie M: bloky [počet, dátové kódové slová], korekčné kódové slová na blok.
const QR_TABLE = {
  1: { groups: [[1, 16]], ec: 10, align: [] },
  2: { groups: [[1, 28]], ec: 16, align: [6, 18] },
  3: { groups: [[1, 44]], ec: 26, align: [6, 22] },
  4: { groups: [[2, 32]], ec: 18, align: [6, 26] },
  5: { groups: [[2, 43]], ec: 24, align: [6, 30] },
  6: { groups: [[4, 27]], ec: 16, align: [6, 34] },
  7: { groups: [[4, 31]], ec: 18, align: [6, 22, 38] },
  8: { groups: [[2, 38], [2, 39]], ec: 22, align: [6, 24, 42] },
  9: { groups: [[3, 36], [2, 37]], ec: 22, align: [6, 26, 46] },
  10: { groups: [[4, 43], [1, 44]], ec: 26, align: [6, 28, 50] },
};
const QR_EC_M = 0b00; // úroveň korekcie M v značke formátu

const maskAt = (mask, row, col) => {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
};

function qrCodewords(bytes) {
  for (let version = 1; version <= 10; version++) {
    const spec = QR_TABLE[version];
    const dataCount = spec.groups.reduce((sum, [n, d]) => sum + n * d, 0);
    const countBits = version < 10 ? 8 : 16;
    const needBits = 4 + countBits + bytes.length * 8;
    if (needBits > dataCount * 8) continue;
    // bitový zápis: režim 0100, dĺžka, údaje, ukončenie, výplň
    const bits = [];
    const push = (value, len) => { for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
    push(0b0100, 4);
    push(bytes.length, countBits);
    for (const b of bytes) push(b, 8);
    for (let i = 0; i < 4 && bits.length < dataCount * 8; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      codewords.push(byte);
    }
    const pad = [0xec, 0x11];
    let p = 0;
    while (codewords.length < dataCount) { codewords.push(pad[p++ % 2]); }
    // rozdelenie na bloky, korekcia, zamiešanie
    const blocks = [];
    let offset = 0;
    for (const [count, dataLen] of spec.groups) {
      for (let i = 0; i < count; i++) {
        const data = codewords.slice(offset, offset + dataLen);
        offset += dataLen;
        blocks.push({ data, ec: rsEncode(data, spec.ec) });
      }
    }
    const out = [];
    const maxData = Math.max(...blocks.map((b) => b.data.length));
    for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
    for (let i = 0; i < spec.ec; i++) for (const b of blocks) out.push(b.ec[i]);
    return { version, codewords: out };
  }
  return null;
}

function qrFormatBits(mask) {
  const data = (QR_EC_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function qrVersionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

function qrBaseMatrix(version) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(0));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFixed = (row, col, value) => {
    if (row < 0 || col < 0 || row >= size || col >= size) return;
    modules[row][col] = value; fixed[row][col] = true;
  };
  const finder = (row, col) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const inRing = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) || (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6));
      const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      setFixed(row + dr, col + dc, inRing || inCore ? 1 : 0);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) {
    setFixed(6, i, i % 2 === 0 ? 1 : 0);
    setFixed(i, 6, i % 2 === 0 ? 1 : 0);
  }
  for (const r of QR_TABLE[version].align) for (const c of QR_TABLE[version].align) {
    if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      setFixed(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0);
    }
  }
  setFixed(size - 8, 8, 1); // tmavý modul
  for (let i = 0; i < 9; i++) { fixed[8][i] = true; fixed[i][8] = true; }
  for (let i = 0; i < 8; i++) { fixed[8][size - 1 - i] = true; fixed[size - 1 - i][8] = true; }
  if (version >= 7) {
    const bits = qrVersionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = (bits >>> i) & 1;
      const a = Math.floor(i / 3), b = size - 11 + (i % 3);
      fixed[b][a] = true; fixed[a][b] = true;
      modules[b][a] = bit; modules[a][b] = bit;
    }
  }
  return { modules, fixed, size };
}

function qrPenalty(modules, size) {
  let score = 0;
  // pravidlo 1: behy 5 a viac rovnakých modulov v riadku/stĺpci
  const runScore = (line) => {
    let total = 0, run = 1;
    for (let i = 1; i < line.length; i++) {
      if (line[i] === line[i - 1]) run += 1;
      else { if (run >= 5) total += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) total += 3 + (run - 5);
    return total;
  };
  for (let r = 0; r < size; r++) score += runScore(modules[r]);
  for (let c = 0; c < size; c++) score += runScore(modules.map((row) => row[c]));
  // pravidlo 2: bloky 2×2 rovnakej farby
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = modules[r][c];
    if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3;
  }
  // pravidlo 3: vzor 1:1:3:1:1 so štyrmi svetlými modulmi (11-bitové okno)
  for (let r = 0; r < size; r++) {
    let bits = 0;
    for (let c = 0; c < size; c++) {
      bits = ((bits << 1) & 0x7ff) | modules[r][c];
      if (c >= 10 && (bits === 0x5d0 || bits === 0x05d)) score += 40;
    }
  }
  for (let c = 0; c < size; c++) {
    let bits = 0;
    for (let r = 0; r < size; r++) {
      bits = ((bits << 1) & 0x7ff) | modules[r][c];
      if (r >= 10 && (bits === 0x5d0 || bits === 0x05d)) score += 40;
    }
  }
  // pravidlo 4: podiel tmavých modulov
  let dark = 0;
  for (const row of modules) for (const v of row) dark += v;
  const percent = (dark * 100) / (size * size);
  score += Math.abs(Math.ceil(percent / 5) - 10) * 10;
  return score;
}

function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text ?? '')));
  const built = qrCodewords(bytes);
  if (!built) return null;
  const { version, codewords } = built;
  const { modules, fixed, size } = qrBaseMatrix(version);
  // umiestnenie údajov cik-cak
  const bits = [];
  for (const byte of codewords) for (let i = 7; i >= 0; i--) bits.push((byte >>> i) & 1);
  let index = 0, upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = col - j;
        const y = upward ? size - 1 - vert : vert;
        if (fixed[y][x]) continue;
        modules[y][x] = index < bits.length ? bits[index++] : 0;
      }
    }
    upward = !upward;
  }
  // výber masky: najnižšia penalizácia
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = modules.map((row) => row.slice());
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (!fixed[r][c] && maskAt(mask, r, c)) candidate[r][c] ^= 1;
    }
    const format = qrFormatBits(mask);
    for (let i = 0; i < 15; i++) {
      const bit = (format >>> i) & 1;
      // prvá kópia: okolo ľavého horného nálezcu
      if (i < 6) candidate[i][8] = bit;
      else if (i < 8) candidate[i + 1][8] = bit;
      else if (i === 8) candidate[8][7] = bit;
      else candidate[8][14 - i] = bit;
      // druhá kópia: okolo pravého dolného nálezcu
      if (i < 8) candidate[8][size - 1 - i] = bit;
      else candidate[size - 15 + i][8] = bit;
    }
    const penalty = qrPenalty(candidate, size);
    if (!best || penalty < best.penalty) best = { penalty, matrix: candidate };
  }
  return { size, modules: best.matrix, version };
}

/**
 * QR kód ako inline SVG (bez externých zdrojov).
 * @param {string} text odkaz, ktorý sa má zakódovať (napr. otpauth://…)
 * @param {object} [opts] { size: px, margin: tichý okraj v moduloch, label: alt text }
 */
export function qrSvg(text, opts = {}) {
  const built = qrMatrix(text);
  if (!built) return null;
  const { size, modules } = built;
  const margin = opts.margin ?? 4;
  const dim = size + margin * 2;
  const path = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) path.push(`M${c + margin} ${r + margin}h1v1h-1z`);
    }
  }
  const px = opts.size ?? 220;
  return `<svg class="qr-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${px}" height="${px}" role="img" aria-label="${String(opts.label || 'QR kód').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}"><rect width="${dim}" height="${dim}" fill="#ffffff"/><path d="${path.join('')}" fill="#1c1a17"/></svg>`;
}
