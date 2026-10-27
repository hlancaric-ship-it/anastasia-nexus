// Bunka CSV pre export z administrácie.
// Hodnota začínajúca = + - @ tabulátorom alebo CR sa v Exceli/LibreOffice spustí ako vzorec
// (napr. meno zákazníka `=HYPERLINK(...)`), preto sa jej predradí apostrof – zobrazí sa ako text.
const FORMULA_START = /^[=+\-@\t\r]/;
// Záporná suma (napr. dobropis `-12.00`) nie je vzorec – ostane číslom.
const PLAIN_NUMBER = /^-?\d+(?:[.,]\d+)?$/;

export function csvCell(value) {
  let text = String(value ?? '').replace(/\r?\n/g, ' ');
  if (FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
