/** Jednoduchá stránka odhlásenia. Bez skriptov, bez externých zdrojov, texty slovensky. */

export type UnsubscribePageState = "confirm" | "already" | "done" | "invalid" | "unavailable"

const COPY: Record<UnsubscribePageState, { title: string; text: string; action?: string }> = {
  confirm: {
    title: "Odhlásenie z odberu",
    text: "Naozaj si neželáte dostávať novinky ANASTASIA na túto adresu? Po potvrdení sa odber ukončí a ďalšie kampane vám už neprídu.",
    action: "Odhlásiť sa",
  },
  already: {
    title: "Odber je už ukončený",
    text: "Tento e-mail už nie je prihlásený na odber noviniek ANASTASIA. Nič ďalšie nie je potrebné.",
  },
  done: {
    title: "Odhlásenie je hotové",
    text: "Na túto adresu vám už novinky posielať nebudeme. Ak ste sa odhlásili omylom, prihláste sa znova na webe.",
  },
  invalid: {
    title: "Odkaz nie je platný",
    text: "Odkaz na odhlásenie nie je platný. Skontrolujte, či ste ho otvorili celý, alebo použite odkaz v poslednom e-maile, ktorý ste dostali.",
  },
  unavailable: {
    title: "Odhlásenie sa nepodarilo",
    text: "Odhlásenie sa teraz nepodarilo vybaviť. Skúste to o chvíľu znova.",
  },
}

export function renderUnsubscribePage(input: {
  state: UnsubscribePageState
  consentId?: string
  signature?: string
}): string {
  const copy = COPY[input.state]
  const form = input.state === "confirm" && input.consentId && input.signature
    ? `<form method="post">
        <input type="hidden" name="c" value="${escapeAttr(input.consentId)}">
        <input type="hidden" name="s" value="${escapeAttr(input.signature)}">
        <button type="submit">${escapeAttr(copy.action || "Odhlásiť sa")}</button>
      </form>`
    : ""
  return `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeAttr(copy.title)} – ANASTASIA</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f7f2e8;color:#191b18;font:15px/1.7 Figtree,Arial,sans-serif}
.un{width:100%;max-width:600px;background:#fffcf8;border:1px solid #eae3d8;border-radius:12px;padding:40px 36px;text-align:center}
.un-logo{display:block;width:52px;height:52px;margin:0 auto 10px;object-fit:contain}
.un-brand{font-family:Fraunces,Georgia,serif;font-size:20px;font-weight:300;letter-spacing:7px;color:#2d4936;text-transform:uppercase}
.un-sub{font-family:Figtree,Arial,sans-serif;font-size:10px;letter-spacing:4px;color:#8e7cc3;text-transform:uppercase;padding-top:8px}
.un-line{height:1px;background:#8e7cc3;opacity:.35;margin:22px 0 26px}
.un h1{font-family:Fraunces,Georgia,serif;font-weight:300;font-size:26px;line-height:1.3;margin:0 0 12px;color:#2d4936}
.un p{margin:0 0 22px;color:#5b564c}
.un button{appearance:none;border:0;border-radius:999px;background:#5f7a5a;color:#fffdf8;font:inherit;padding:13px 30px;cursor:pointer}
.un button:hover{background:#4d6349}
.un small{display:block;margin-top:20px;font-size:12px;color:#7a7368}
</style>
</head>
<body>
<main class="un">
<img class="un-logo" src="https://media.anastasiaoz.eu/logo-mark.png" alt="ANASTASIA" width="52" height="52">
<div class="un-brand">ANASTASIA</div>
<div class="un-sub">Light for the future</div>
<div class="un-line"></div>
<h1>${escapeAttr(copy.title)}</h1>
<p>${escapeAttr(copy.text)}</p>
${form}
<small>Odkaz je platný len pre e-mail, ktorý ste dostali. Nič sa nemení na vašich objednávkach ani na prístupe k účtu.</small>
<small>LUCRAT spol. s r.o. · IČO 36652164 · <a href="https://anastasiaoz.eu">anastasiaoz.eu</a></small>
</main>
</body>
</html>`
}

function escapeAttr(value: string): string {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string))
}
