// Odkazy na účet: text a cesta podľa prihlásenia zákazníka.
//
// Čisté funkcie bez DOM – testovateľné cez `node --test`. Kľúč tokenu zákazníka
// je JWT_KEY z API adaptéra (src/lib/api/http.mjs); o prihlásení rozhoduje
// volajúci (pozri public/app.mjs), tu sa iba mení text a cesta odkazu.

export const ACCOUNT_LABEL = {in: 'Môj účet', out: 'Prihlásiť sa'};
export const ACCOUNT_HREF = {in: '/ucet', out: '/prihlasenie'};

// Odkaz na účet (ikona v hlavičke, položka v menu): cesta, aria-label aj title
// podľa prihlásenia. Text sa mení len keď odkaz vlastní text – ikona v hlavičke
// je len SVG, takže na texte sa nesmie spieťať.
export function setAccountLink(link, logged) {
  const state = logged ? 'in' : 'out';
  const label = ACCOUNT_LABEL[state];
  link.href = ACCOUNT_HREF[state];
  link.setAttribute('aria-label', label);
  link.setAttribute('title', label);
  if (link.textContent.trim()) link.textContent = label;
  return link;
}

// Odkaz na účet na stránke prihlásenia: vidí ho len prihlásený zákazník.
export function setAccountVisibility(link, logged) {
  link.hidden = !logged;
  return link;
}
