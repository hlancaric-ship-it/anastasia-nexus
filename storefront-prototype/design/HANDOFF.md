# Handoff: ANASTASIA Storefront – Homepage v2 + O Lucii (Phase 1)

## Overview
This is a redesign of the AI ANASTASIA storefront for Phase 1. It covers the **Homepage** and the **O Lucii** (About) page. The look is "quiet luxury": deep forest green with cream and a single gold accent, a glass navigation rail, smooth Lenis scrolling, parallax on photos only, and a text-roll hover on every link. All copy is Slovak.

## About the design files
The `.dc.html` files in this bundle are **design references built in HTML**. They are working prototypes that show the intended look and behaviour. They are **not production code to copy directly.** Recreate them inside the storefront codebase, using its existing framework, components and conventions. That codebase is the GitHub repo the Figma file "ANASTASIA – Storefront Fáze 1 (z GitHubu)" was generated from. If there is no front end yet, pick the stack that fits it best. Next.js/React or Astro would work well.

Open the files in a browser to see them. They need `support.js`, `image-slot.js` and `assets/` sitting next to them. Every style is inline, so the exact values can be read directly from the markup.

## Fidelity
**High fidelity.** Final colours, typography, spacing, radii and interactions. Recreate them pixel-accurately with the codebase's own components.

---

## Global layout

### Left glass rail (desktop ≥ 1000px only)
- Fixed position: `left:0; top:0; bottom:0; width:52px; z-index:40`.
- Page content gets `padding-left:52px`. Each section background is then pulled back under the rail (`margin-left:-52px; padding-left:+52px`), so the rail always sits over real content.
  - Hero, the night-sky video card and the Lucia photo bleed fully under the rail.
- Glass styling:
  - Gradient: `linear-gradient(100deg, rgba(255,255,255,.16) 0%, rgba(255,255,255,.05) 45%, rgba(255,255,255,.02) 70%, rgba(255,255,255,.09) 100%)` over `rgba(30,38,25,.16)`.
  - `backdrop-filter: blur(26px) saturate(180%) brightness(1.05)`.
  - Border-right: `1px rgba(255,255,255,.24)`.
  - Inset highlights: `inset -1px 0 0 rgba(255,255,255,.12)` and `inset 1px 0 0 rgba(255,255,255,.18)`.
  - Shadow: `10px 0 40px rgba(0,0,0,.14)`.
- **Adaptive tone.** Probe the element behind the rail at `(80px, 50vh)` every ~6 scroll frames.
  - Over a light solid background (luminance > 0.62), switch to **light tone**:
    - Near-transparent gradient `rgba(255,255,255,.1→.02→.06)`.
    - Text `#283020`.
    - Icons `filter: brightness(.22) sepia(.4)`.
    - Border `rgba(40,48,32,.08)`.
  - Over photos, videos and dark sections, use **dark tone** with cream `#EFE5C7` text and icons.
  - Transition: 600ms.
- Contents, top to bottom:
  1. **Language block:** 132px tall, border-bottom `rgba(255,255,255,.16)`.
     - SK / EN / RU, 14px, letter-spacing 1.2px.
     - Active item: weight 400, plus a gold underline (14×1.5px `#C9A355`).
     - Inactive items: opacity .5; hover sets opacity 1.
  2. **Menu button:** centred in the remaining space. 3×20px hamburger lines, label "Menu" at 10px. Opens the **side menu**.
  3. **Contact icons:** phone, mail, Facebook, YouTube.
     - Each is a 40px circle, 2px gap, with top and bottom borders on the group.
     - Hover: `background rgba(255,255,255,.14)` plus inset highlight.
     - Icon SVGs are in `assets/ic-*.svg`, filled `#EFE5C7`.
  4. **Vertical label** "LIGHT FOR THE FUTURE": `writing-mode: vertical-rl; rotate(180deg)`, 8.5px, letter-spacing 1.62px.

### Header (inside the hero, not sticky)
- Grid: `1fr auto 1fr`, padding `26px clamp(20px,4vw,64px)`, border-bottom `1px rgba(201,163,85,.28)`.
- **Left:** links "Obchod" and "Programy" (12px, uppercase, letter-spacing 1.6px, weight 400).
  - Below 1000px these are replaced by a "Menu" button that opens the top menu.
- **Centre:** logo mark `assets/logo-mark.png` at 40px, with "ANASTASIA" below (15px, letter-spacing 7px).
- **Right:**
  - "Konzultácie" link.
  - "Košík (n)", where n is the cart count in gold.
  - **Menu pill:**
    - 50px tall, radius 80, label "Menu" at 15px.
    - Glass: `rgba(255,255,255,.09)`, border `rgba(255,255,255,.2)`, `blur(14px) saturate(140%)`.
    - Opens the **top menu**.

### Side menu (opened from the rail)
- Fixed: `left:64px; top:50%; translateY(-50%); width:255px`, radius 18.
- Open/close animation: opacity, plus translateX from −24px to 0. 550ms `cubic-bezier(.22,.8,.2,1)`.
- **Glass:**
  - Gradient: `linear-gradient(135deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.04) 30%, rgba(255,255,255,.02) 60%, rgba(255,255,255,.08) 100%)` over `rgba(26,34,22,.42)`.
  - `backdrop-filter: blur(40px) saturate(170%) brightness(.52)`. The `brightness` keeps text readable over any background.
  - Border `1px rgba(255,255,255,.2)`.
  - Shadows: `0 50px 140px rgba(0,0,0,.4)`, `0 10px 30px rgba(0,0,0,.18)`, plus inset highlights (top `0 1px 0 rgba(255,255,255,.32)`).
  - Text-shadow: `0 1px 14px rgba(0,0,0,.35)`.
  - A soft sheen layer covers the top 46%.
- **Content:**
  1. Logo and wordmark.
  2. Account, cart and ✕ buttons.
  3. Three groups with dividers. Each group has a gold heading at 19px:
     - **Obchod:** Všetky produkty, Kategórie, Novinky, Bestsellery.
     - **Programy:** RESET 40+, Všetky programy, Pre firmy, Individuálne programy.
     - **Služby:** Konzultácie, Supervízia, AI ANASTASIA, Pre odborníkov.
  4. Footer links: Zdravý svet · O Lucii · Kontakt.

### Top menu (opened from the header pill)
- Fixed: `top:24px; right:24px; width:min(850px, 100vw-24px)`, radius 24, padding `26px 36px 28px`.
- Uses the same glass recipe as the side menu.
- Open animation: translateY from −16px to 0, plus opacity.
- **Content:**
  1. **Header row:** logo (48px) and wordmark, account and cart icons, and a light-glass "Zavrieť ✕" pill.
  2. **Three columns with vertical dividers** (25px headings):
     - **Obchod / Programy:** same links as the side menu.
     - **Služby:** as in the side menu, plus "AI ANASTASIA" carries a 9px gold "Už čoskoro" tag.
  3. **Bottom row:**
     - Large links "Zdravý svet / O Lucii / Kontakt" at 30px.
     - SK / EN / RU, with the note "EN / RU už čoskoro".
     - An image (radius 12). **Swap it for the client's interior photo**; it is a placeholder.
- **Overlay:** `rgba(12,18,10,.12)`. Click it or press Esc to close. While open, call `lenis.stop()`; on close, `lenis.start()`.

### Footer
- Background: `linear-gradient(180deg, #17332F, #112724)`. This deep teal is taken from the night-sky video and breaks up the green.
- Border-top: `1px rgba(201,163,85,.28)`.
- **Newsletter:**
  - Heading "Zostaňme v kontakte." in Outfit 100, `clamp(40px,4vw,64px)`.
  - Email input with a bottom line only.
  - Autofill must not show a blue box. Use `-webkit-autofill` with transparent box-shadow and cream text-fill.
  - Glass pill button "Odoberať"; after a valid submit it changes to "Ďakujeme".
- **Three link columns** (headings are 10px gold uppercase):
  - **Svet:** Zdravý svet, Programy, RESET 40+, AI ANASTASIA, AI ANASTASIA ACADEMY.
  - **Sprevádzanie:** Konzultácie, Online konzultácia, Supervízia, Astrologický profil, Pre odborníkov.
  - **Informácie:** O Lucii, Pharmanews, Zdravé lekárne, Pre firmy, Kontakt.
- **Brand row:** three equal cells, each with a logo area `clamp(170px,17vw,240px)` tall and a 9px gold label underneath:
  1. **ANASTASIA OZ:** `assets/lucia-logo.png`. It is a black PNG, recoloured to cream with `filter: invert(1) sepia(.3) saturate(1.4) brightness(.95)`.
  2. **ANASTASIA.ACADEMY:** a typographic placeholder. **Replace it with the real logo.**
  3. **AI ANASTASIA:** `assets/logo-mark.png` with "ANASTASIA" underneath.
- **Bottom bar:**
  - "© 2026 ANASTASIA · Light for the Future".
  - Links: Obchodné podmienky, Súkromie a GDPR, Reklamácie.
  - Preview notice `#8FA39C`.

---

## Screen: Homepage (`ANASTASIA Homepage v2.dc.html`)

Sections, top to bottom:

1. **Hero:** 100vh (min 680px).
   - Background is a video (prop `heroVideo`), with `assets/hero-forest.jpg` as the poster and fallback. Muted, looping, autoplay.
   - Scrim: `linear-gradient(180deg, rgba(16,24,15,.62) 0%, .34 26%, .5 52%, rgba(8,12,7,.78) 80%, rgba(4,6,4,.92) 100%)`.
   - Bottom grid, left side:
     - Eyebrow "Light for the Future": cream, preceded by a 48px gold line, letter-spacing 3px.
     - H1 "V rovnováhe so sebou. S prírodou." in Outfit 100, `clamp(56px, min(8.6vw,13vh), 156px)`, line-height .9, letter-spacing −.05em.
   - Bottom grid, right side:
     - Copy (16px `#C4C7B6`).
     - **Primary CTA:** solid cream `#EFE5C7`, text `#283020`, 58px tall, radius 29. Label "Objavte svet ANASTASIA ↗".
     - Glass secondary "Kolekcia ↓".
     - Play/pause and sound pills, shown only when a video URL is set.
   - On scroll, the hero content fades out and rises (opacity `1 − y/(0.7·vh)`, translateY `−0.12·y`). **The video itself gets no parallax.**
2. **Manifest** (`#manifest`): background `#F5F2E8`, centred.
   - Logo mark at 64px, recoloured dark.
   - Eyebrow "Vitajte".
   - Statement in Outfit 200, `clamp(30px,3.7vw,60px)`. The second sentence is in `#748054`.
   - Light-glass pill "Zdravý svet ↗".
3. **Kolekcia** (`#kolekcia`): background `#283020`.
   - Header row: H2 "Vybrané pre vás." (Outfit 100, up to 120px) and a glass "Celý obchod" pill.
   - Grid `auto-fill minmax(280px,1fr)` with 4 product cards. Each card:
     - Image with aspect 3/4 and radius `90px 0 0 0`. The inner image scales to 1.05 on hover (900ms).
     - Glass chips on the image: "N° 0x" bottom-left, category top-right.
     - Gold hairline above the text.
     - Category in 10px gold uppercase, and the price.
     - Name in Outfit 200, ~30px.
     - Glass "Do košíka" button. On click: cart+1, the label changes to "Pridané" in gold for 1.6s.
   - Products (sample data):
     - Bio sprchový gél 18,00 € (Kozmetika).
     - Káva zdravá 24,00 € (Výživa).
     - Telové maslo 26,00 € (Kozmetika).
     - Rituálne sviečky 22,00 € (Domov).
   - Note under the grid: "Ilustračné náhľady a ukážkové ceny…".
4. **RESET 40+** (`#program`): full-bleed forest photo with a parallax layer and scrim `linear-gradient(90deg, rgba(16,24,15,.82), .35, .6)`.
   - Giant "40+" in Outfit 100, `clamp(220px,30vw,500px)`, letter-spacing −.09em, with the "+" in gold.
   - Glass card, radius `70px 0 0 0`:
     - H2 "Nová kapitola sa začína vami." and copy.
     - Three stats: 16 týždňov / ∞ vlastné tempo / 1× jednorazový prístup.
     - Solid cream CTA "Objaviť RESET 40+".
5. **Konzultácie** (`#konzultacie`): background `#F5F2E8`.
   - **Left, flush against the rail and bleeding under it:** night-sky video card (prop `skyVideo`, poster `assets/night-sky.jpg`), aspect 4/5, radius `0 160px 0 0`.
     - Glass caption "Astrologický profil · Nočná obloha v deň vášho narodenia." Its left offset is 72px on desktop so it clears the rail.
   - **Right:**
     - H2 "Konzultácie."
     - Numbered rows: 01 Online zdravotná konzultácia, 02 Supervízia, 03 Astrologický profil. Titles in Outfit 200 ~44px. Hover indents the row by 14px.
     - Light-glass "Všetky konzultácie" pill.
6. **O Lucii** (`#o-lucii`): two-column grid.
   - Left: photo `assets/lucia-portrait.jpg`, bleeding under the rail.
   - Right, background `#26321E`:
     - Eyebrow "Zakladateľka".
     - Quote "„Ďakujem, že smiem pomáhať."" in Outfit 100 up to 118px.
     - Signature line "Mgr. Lucia Rogožanová, MBA / zakladateľka ANASTASIA".
     - Glass "Príbeh Lucie" pill linking to the O Lucii page.
7. **Footer** (see above). The former "Zdravý svet" section was removed on purpose; it is now linked from the Manifest.

## Screen: O Lucii (`O Lucii.dc.html`)

1. **Hero:** background `#283020`, two-column grid (stacks at 520px).
   - Left:
     - "← Na úvod" link.
     - Eyebrow "O Lucii".
     - H1 "Lucia / Rogožanová." in Outfit 100, `clamp(56px,6.6vw,150px)`.
     - Name and title.
   - Right: portrait `assets/lucia-portrait.jpg`, radius `clamp(120px,14vw,260px) 0 0 0`.
     - Glass badge "Farmaceutka · Viac ako 30 rokov s ľuďmi".
   - The portrait is pre-cropped so none of the banner's baked-in text can show at any aspect.
2. **Trust strip:** background `#F5F2E8`, max-width 1100, three centred items.
   - Each item: an outline SVG icon (72px, stroke `#4A3B2A`, width .9) above a two-line label (19px `#3A3A33`):
     - Individuálny prístup.
     - Prevencia a vitalita.
     - Odbornosť a dôvera.
   - No dividers.
   - The strokes draw in on scroll (`stroke-dashoffset`, 1800ms, staggered 180ms).
   - Hover: translateY −6px, scale 1.06.
3. **O mne:** "Volám sa Lucia Rogožanová." beside a lead paragraph and a muted paragraph.
4. **Quote panel:** `#2A3222`, radius `0 0 160px 0`. "Mnohí ľudia nehľadajú ďalší liek. Hľadajú porozumenie." with the second sentence in gold.
5. **AI ANASTASIA:** H2, copy, a statement about human and AI cooperation, and the motto "AI je nástroj · Odbornosť zostáva ľudská".
6. **Témy:** background `#D5D6BD`.
   - Photo `assets/lucia-longevity.png`, aspect 3/2. **The source is only 300×200; ask for a high-resolution file.**
   - Numbered list of 8 topics, in two columns.
7. **Presvedčenie:** large statement, plus the Vyšná Slaná paragraph.
8. **Vízia:** tree photo `assets/tree.jpg` in original colours (no scrim), with parallax.
   - Glass card, radius `120px 0 120px 0`, holding the ANASTASIA OZ logo in cream, the vision copy and a sub-copy.
9. **Poďakovanie:** letter, signed "Lucia".
10. **Čím môžem pomôcť** (`#pomoc`): three glass service cards with radius `70px 0 0 0` and "Zistiť viac". Hover: lift −6px.
11. **Footer.**

---

## Interactions & motion
- **Lenis smooth scroll** on both pages:
  - Options: `lerp: 0.09, wheelMultiplier: 1, smoothWheel: true`.
  - Anchor links: duration 1.8s, easeInOutQuart.
  - Drive every scroll effect from the `lenis.on('scroll')` callback in the same rAF.
  - Measure section offsets once (on resize and when fonts are ready). **No `getBoundingClientRect` per frame**, otherwise scrolling stutters.
- **Reveal:**
  - Applies to h1, h2, h3, p, article, li and form inside sections.
  - Starts at opacity 0, translateY 28px. Animates to 1 / 0 over 1100–1300ms `cubic-bezier(.16,1,.3,1)`, staggered 80ms per sibling.
  - Triggered by IntersectionObserver.
  - No blur filters, for performance.
- **Parallax (photos only, never videos):**
  - **Big background photos** (RESET, Vízia): the layer translates by `−k·h·0.11` and scales `1.06 + max(0,k)·0.1`, where k is the section's centre offset from the viewport centre (−1…1).
  - **Framed photos** (portraits, Témy): the image moves inside a fixed frame, `−k·h·0.10`, scale `1.12 + max(0,k)·0.08`.
    - Curtain reveal on enter: `clip-path: inset(18% 0 0 0)` → `inset(0)` over 1800ms.
  - Pause videos when they are off-screen.
- **Text roll hover** (spec: `docs/STOREFRONT-POZADAVKY-FAZE1.md:134`):
  - Applies to every link and button label, plus consultation titles.
  - On hover the label slides up and an identical copy rises from below. Use a `::before { content: attr(data-text) }` (or a duplicate span) inside `overflow:hidden`; translateY 100% → 0, ~650ms `cubic-bezier(.16,1,.3,1)`.
- **Glass buttons:**
  - Dark context: `rgba(255,255,255,.09)`, border `rgba(255,255,255,.2)`, `inset 0 1px 0 rgba(255,255,255,.18)`, `blur(14px) saturate(140%)`. Hover: `.16` / `.32`.
  - Light context: `rgba(255,255,255,.42)`, border `rgba(255,255,255,.75)`. Hover: `.68`.
  - **Primary CTAs stay solid cream**; the client found heavy glass on buttons unnatural.
- **Responsive (< 1000px):** the rail is hidden, the header shows a Menu button, and grids stack via `auto-fit minmax(...)`.

## State
- `cart` (number) and `added[id]` (flag that resets after 1.6s).
- `menu`: `null | 'side' | 'top'`.
- `email` and `subscribed`.
- Video play/pause and mute (hero).
- `w` (viewport width for desktop/mobile) and `past` (scrolled past the hero).

## Design tokens
**Colours**
- Forest ink `#283020` (text, dark bg).
- Forest surface `#2A3222`.
- Forest deep `#26321E`.
- Cream `#EFE5C7`.
- Gold `#C9A355`.
- Bronze `#796236`.
- Paper `#F5F2E8`.
- Sage `#D5D6BD`.
- Olive `#748054`.
- Mint `#ECF3E7`.
- Muted `#69705E`.
- Muted-on-dark `#C4C7B6`.
- Outline `#A3A894`.
- Divider `#BFC4B3`.
- Hairline `#D9D9C8`.
- Footer teal `#17332F → #112724`.
- Trust icon `#4A3B2A`.

**Type**
- One family: **Outfit** (Google Fonts), weights 100 / 200 / 300 / 400.
- Display: 100–200 with negative tracking (−.04 to −.06em).
- Body: 300, 15–19px, line-height 1.6–1.75.
- Eyebrows: 400, 9–11px, uppercase, letter-spacing 1.6–3px.

**Radii**
- "Leaf" corners (signature): 50–160px on one or two corners only; the rest stay square.
- Pills: 20–29.
- Menus: 18 / 24.

**Easing:** `cubic-bezier(.16,1,.3,1)` for reveals, rolls and parallax reveals.

## Assets (`assets/`)
- `logo-mark.png`: AI ANASTASIA mark.
- `lucia-logo.png`: ANASTASIA OZ logo (black PNG).
- `hero-forest.jpg`: hero and RESET photo; poster for videos.
- `night-sky.jpg`: poster for the sky video.
- `tree.jpg`: Vízia photo.
- `lucia.jpg`: Lucia portrait. Earlier version; no longer referenced by the current designs.
- `lucia-portrait.jpg`: cropped from `konzultacia-banner.png`.
- `lucia-longevity.png`: Témy photo (low resolution).
- `p-gel.png`, `p-kava.png`, `p-maslo.png`, `p-svieca.png`: product shots.
- `ic-phone.svg`, `ic-mail*.svg`, `ic-fb.svg`, `ic-yt*.svg`: rail icons from Figma.
- `konzultacia-banner.png`: consultation banner (baked-in text). Not used on the pages.

**Still missing from the client:**
- Hero video and night-sky video (.mp4).
- ANASTASIA.ACADEMY logo.
- High-resolution Lucia photos.
- Interior photo for the top menu.
- Real URLs for Pharmanews, Zdravé lekárne, Pre firmy and Academy.
- EN and RU translations.

## Files
- `ANASTASIA Homepage v2.dc.html`: homepage prototype.
- `O Lucii.dc.html`: About page prototype.
- `support.js`, `image-slot.js`: prototype runtime only; do not port.
- `ANASTASIA Design Reference v2.dc.html`: printable style guide, in Czech.
