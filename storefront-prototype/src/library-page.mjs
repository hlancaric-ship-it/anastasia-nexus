import {pageIntro} from './components.mjs'

export function libraryPage() {
  return `<section class="section library-page">
    <div class="page-intro">
      <p class="eyebrow">Moja knižnica</p>
      <h1>Vaše zakúpené programy.</h1>
      <p class="lead">Videá, nahrávky a materiály, ku ktorým máte prístup.</p>
    </div>
    <div id="library-view"></div>
  </section>`
}
