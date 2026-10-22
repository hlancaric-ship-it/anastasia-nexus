// Vernostná úroveň zákazníka – jediný zdroj pravdy pre čítanie tieru.
//
// Zdroj je `metadata.nexus_tier` skupiny (Bronze/Silver/Gold/VIP -> ZR1..ZR4);
// název skupiny ve tvaru ZR\d+ zostáva jako zpětně kompatibilní záloha.
// Při více skupinách vyhrává nejvyšší `metadata.rank`, jinak nejvyšší číslo v kódu.
//
// Táto implementácia je preložená do `src/lib/loyalty/tier.ts`, aby ju mohli
// používat i administrace a automatické zaradení (jedna definice, žádný drift).
export type { CustomerGroupLike } from "../../../lib/loyalty/tier"
export { resolveCustomerTier } from "../../../lib/loyalty/tier"
