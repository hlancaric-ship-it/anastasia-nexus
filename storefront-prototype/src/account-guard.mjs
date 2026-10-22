// Stráž účtu pre /ucet.
//
// Bez prihláseného tokenu účet neexistí: zákazník pokračuje na prihlásenie.
// Skript sa načíta v hlave stránky (ako /center-theme.js), ešte pred runtime aplikácie,
// aby sa účet nestihol zobraziť ani na chvíľu. Kľúč tokenu je ten istý, ktorý používa
// API adaptér (src/lib/api/http.mjs) – zdroj pravdy je export JWT_KEY.
export const accountGuardBoot = (jwtKey) =>
  `try{if(!sessionStorage.getItem(${JSON.stringify(jwtKey)}))location.replace('/prihlasenie');}catch(e){/* prehliadač bez sessionStorage nechá rozhodnúť aplikácia */}\n`;
