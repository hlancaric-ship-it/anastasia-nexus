// Existing anastasia-media objects verified against R2 on 2026-10-19.
// Legacy lekcia-00 is lesson 1, explicitly confirmed by the owner; there is no lekcia-01.
export const protectedLibrary = [
  { handle: "reset-40-plus", media: [0, ...Array.from({ length: 16 }, (_, i) => i + 2)].map((n, i) => ({
    key: `reset-40-plus/lekcia-${String(n).padStart(2, "0")}.mp4`, title: `Lekcia ${i + 1}`,
  })) },
  { handle: "nic-nemusis", media: [
    ["A0_nic-nemusis", "Ukážka · Nič nemusíš"],
    ["A1_navrat-zo-sluzby", "Návrat zo služby"],
    ["A2_co-je-moje-a-co-nie-je-moje", "Čo je moje a čo nie je moje"],
    ["A3_zostat-bez-zasahu", "Zostať bez zásahu"],
    ["A4_prvy-pohyb", "Prvý pohyb"],
    ["A5_zostat-so-sebou-v-pohybe", "Zostať so sebou v pohybe"],
    ["A6_uvolnenie-kontroly", "Uvoľnenie kontroly"],
  ].map(([key, title]) => ({ key: `nic-nemusis/${key}.mp3`, title })) },
]
