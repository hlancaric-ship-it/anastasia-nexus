// Online odstúpenie od zmluvy (časť C právnych textov klientky).
// Názov funkcie a tlačidla sú znením klientky (VOP čl. 9.2): „Odstúpiť od zmluvy tu“ / „Potvrdiť odstúpenie od zmluvy“.
import { escape as e } from './components.mjs';

const trap = '<label class="contact-trap" aria-hidden="true">Web<input name="website" tabindex="-1" autocomplete="off"></label>';

/** Formulár online odstúpenia – vkladaný za právny text stránky /odstupenie. */
export const withdrawalForm = () => `
<section class="withdrawal-form" id="odstupenie-online">
  <h2>Odstúpiť od zmluvy tu</h2>
  <p class="withdrawal-lead">Vyplňte údaje o objednávke, ktorú chcete odstúpiť. Oznámenie môžete poslať aj e-mailom na zdravysvet@anastasiaoz.eu.</p>
  <form id="withdrawal-form" novalidate>
    <div class="withdrawal-fields">
      <label>Číslo objednávky<input name="order_number" autocomplete="off" required maxlength="100" placeholder="napr. 2026-0142"></label>
      <label>Dátum objednávky<input name="order_date" type="date" required></label>
      <label class="wide">Položky objednávky<textarea name="items" rows="3" required maxlength="1000" placeholder="Napíšte, ktorý produkt alebo službu odstupujete."></textarea></label>
      <label>E-mail na potvrdenie prijatia<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
      <label>Meno a priezvisko<input name="name" autocomplete="name" maxlength="100"></label>
      <label class="wide">Dôvod odstúpenia <small>(nepovinný)</small><textarea name="reason" rows="2" maxlength="1000"></textarea></label>
    </div>
    ${trap}
    <label class="withdrawal-consent"><input type="checkbox" name="consent" required> <span>Prečítal/a som si <a href="/gdpr">informácie o ochrane osobných údajov</a> a beriem na vedomie, že údaje použijeme na vybavenie odstúpenia.</span></label>
    <button class="button" type="submit">Potvrdiť odstúpenie od zmluvy</button>
    <p class="form-status" role="status" aria-live="polite"></p>
  </form>
</section>`;
