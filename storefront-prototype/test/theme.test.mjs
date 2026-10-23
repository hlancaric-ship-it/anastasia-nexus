// Theming: tokenizace barev na proměnné, odvození vlastního motivu a CSS presetů.
import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenizeColors,deriveSiteTheme,siteThemeCss,siteThemes,SITE_BASE,themeToVars,THEME_VARS} from '../src/site-themes.mjs';

test('tokenizeColors mapuje značkové barvy na --site-* proměnné', () => {
  assert.equal(tokenizeColors('color:#283020'), 'color:var(--site-main)');
  assert.equal(tokenizeColors('color:#C9A355'), 'color:var(--site-accent)');
  // krémový text a světlá zlatá se nově také přebarvují
  assert.equal(tokenizeColors('color:#EFE5C7'), 'color:var(--site-cream)');
  assert.equal(tokenizeColors('color:#d8c598'), 'color:var(--site-accent-light)');
  // alfa → color-mix
  assert.match(tokenizeColors('#28302080'), /color-mix\(in srgb,var\(--site-main\) 50%,transparent\)/);
});

test('tokenizeColors nechává fixní barvy a SVG fill beze změny', () => {
  assert.equal(tokenizeColors('color:#ffffff'), 'color:#ffffff');
  assert.equal(tokenizeColors('fill="#283020"'), 'fill="#283020"');
});

test('deriveSiteTheme doplní odstíny z hlavní barvy a akcentu', () => {
  const t = deriveSiteTheme({main:'#4A1A26', accent:'#C9A355'});
  assert.equal(t.main, '#4A1A26');
  assert.equal(t.accent, '#C9A355');
  // deep tmavší než main, dark ještě tmavší
  const lum = h => parseInt(h.slice(1,3),16)+parseInt(h.slice(3,5),16)+parseInt(h.slice(5,7),16);
  assert.ok(lum(t.deep) < lum(t.main), 'deep tmavší než main');
  assert.ok(lum(t.dark) < lum(t.deep), 'dark nejtmavší');
  assert.ok(lum(t.accentLight) > lum(t.accent), 'accentLight světlejší než accent');
  assert.ok(lum(t.accentDeep) < lum(t.accent), 'accentDeep tmavší než accent');
  assert.equal(t.cream, SITE_BASE.cream, 'cream výchozí, když nezadán');
});

test('themeToVars mapuje na CSS suffixy', () => {
  const v = themeToVars(deriveSiteTheme({main:'#283020',accent:'#C9A355'}));
  THEME_VARS.forEach(k => assert.ok(v[k], `chybí proměnná ${k}`));
  assert.ok(v['accent-deep'] && v['accent-light'] && v.cream);
});

test('siteThemeCss definuje :root i presety včetně sdílených konstant', () => {
  const css = siteThemeCss();
  assert.match(css, /:root\{[^}]*--site-main:#313C2B/);
  assert.match(css, /--site-cream:#F5F2E8/i);
  assert.match(css, /--site-accent-light:#C9BCE0/i);
  siteThemes.slice(1).forEach(t => assert.ok(css.includes(`[data-site-theme="${t.id}"]`), `chybí preset ${t.id}`));
});
