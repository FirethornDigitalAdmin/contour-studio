import { Apple, Check, Code2, Download, Github, Heart, KeyRound, Layers, Magnet, MapPin, Monitor, Palette, Printer, Ruler } from "lucide-react";
import BrandMark from "./BrandMark";
import CoffeeLink from "./CoffeeLink";
import Creator, { CreatorLinks } from "./Creator";
import HeroModel from "./HeroModel";
import { downloadUrl, releaseTag, releaseUrl, repository } from "./distribution";
import "./download-site.css";

function Example({ name, alt }: { name: string; alt: string }) {
  return <img className="site-example" src={`./project-examples/${name}.webp`} width="960" height="700" loading="lazy" decoding="async" alt={alt} />;
}
export default function DownloadSite() {
  return <div className="download-site">
    <a className="site-skip" href="#main">Skip to content</a>
    <header className="site-header site-width">
      <a className="site-brand" href="#" aria-label="Contour Studio home"><span><BrandMark /></span>contour <span className="site-brand-light">studio</span></a>
      <nav aria-label="Main navigation"><a href="#what-you-can-make">What you can make</a><a href="#downloads">Downloads</a><a href="#open-source">Open source</a><a href="#about-louis">Meet Louis</a><CoffeeLink /></nav>
    </header>
    <main id="main">
      <section className="site-hero site-width">
        <div className="site-hero-copy">
          <p className="site-kicker">FREE SOFTWARE. REAL PLACES. YOUR CREATION.</p>
          <h1>A little piece<br />of <em>your world.</em></h1>
          <p className="site-lead">Turn a place you love into 3D-printable map art. Create a framed relief of your hometown or a favourite landscape, with real terrain, buildings and your own finishing touches.</p>
          <div className="site-actions"><a className="site-button" href="#downloads"><Download size={19} />Download for free</a><a className="site-text-link" href={repository} target="_blank" rel="noopener noreferrer"><Github size={19} />View the source</a></div>
          <p className="site-free-note"><Check size={16} />Completely free · Open source · No account needed</p>
        </div>
        <HeroModel />
      </section>
      <div className="site-principles"><div className="site-width"><span><Monitor size={19} />Runs on your computer</span><span><Printer size={19} />STL & 3MF print files</span><span><Code2 size={19} />MIT licensed</span></div></div>
      <section className="site-at-home site-width" aria-labelledby="at-home-title">
        <div className="site-section-heading"><p className="site-kicker">YOUR PLACE, AT HOME</p><h2 id="at-home-title">Made for your wall.</h2><p>A favourite place, turned into something you can make and keep.</p></div>
        <figure className="site-wall-art">
          <picture><source media="(max-width: 700px)" type="image/webp" srcSet="./bolton-on-wall-mobile.webp" width="960" height="1200" /><source type="image/webp" srcSet="./bolton-on-wall-960.webp 960w, ./bolton-on-wall-1920.webp 1920w" sizes="(max-width: 1264px) calc(100vw - 64px), 1200px" /><img src="./bolton-on-wall-1920.jpg" width="1920" height="1280" loading="lazy" decoding="async" alt="The actual framed Bolton upon Dearne relief model hanging above an oak sideboard in a modern home, seen at a slight angle with raised roads, buildings and terrain." /></picture>
          <figcaption><span>Bolton upon Dearne · 400 × 280 mm · Warm neutrals</span><span>Actual generated model · Digital room mockup</span></figcaption>
        </figure>
      </section>
      <section className="site-how site-width" aria-labelledby="how-title">
        <div className="site-section-heading"><p className="site-kicker">FROM A PLACE TO A PRINT</p><h2 id="how-title">Make somewhere meaningful.</h2></div>
        <ol><li><MapPin size={24} /><span className="site-step-number">01</span><h3>Choose your place</h3><p>Find your hometown, a favourite landscape or a place you want to remember. Choose the area and finished size.</p></li><li><Palette size={24} /><span className="site-step-number">02</span><h3>Make it yours</h3><p>Adjust the terrain, buildings, colours and frame. Add a heart, star or pin to mark somewhere special.</p></li><li><Printer size={24} /><span className="site-step-number">03</span><h3>Bring it into the world</h3><p>Generate your model and download the print pack. Larger artworks split into pieces that fit your printer.</p></li></ol>
      </section>
      <section className="site-makes site-width" id="what-you-can-make" aria-labelledby="makes-title">
        <div className="site-section-heading"><p className="site-kicker">THREE WAYS TO MAKE IT</p><h2 id="makes-title">A map, a wall, or a puzzle.</h2><p>Every picture here is a model the app generated from real map data, not an illustration.</p></div>
        <div className="site-make-grid">
          <article><Example name="single" alt="A framed relief of Keswick with green land, blue water and pale roads and buildings" /><h3>A single map</h3><p>One place as framed artwork, from a small desk piece to a two-metre wall map. Larger sizes split into tiles that fit your printer and key together on the back.</p></article>
          <article><Example name="modular" alt="Two square map tiles of Bolton upon Dearne sitting in separate keyed holders" /><h3>A wall that grows</h3><p>Square or hexagonal tiles, as one continuous map or a collection of different places. Add a tile on any side whenever you like; the ones you have printed still match.</p></article>
          <article><Example name="jigsaw" alt="A coloured Keswick map cut into sixteen interlocking jigsaw pieces with wandering cut lines, one piece lifted out" /><h3>A real jigsaw</h3><p>Hand-cut style pieces with knobs that lock, numbered on the back, in a matching tray. Roads, water and buildings are stepped so they print cleanly on thin pieces.</p></article>
        </div>
      </section>
      <section className="site-mounting" id="mounting" aria-labelledby="mounting-title"><div className="site-width site-split">
        <figure><Example name="mounting" alt="The back of a three-tile map wall: each holder has a square socket, with the printed wall pucks and spacing jig lifted clear above them" /><figcaption>The back of a three-tile wall · printed pucks and spacing jig lifted clear</figcaption></figure>
        <div><p className="site-kicker">HANG IT YOUR WAY</p><h2 id="mounting-title">On the wall without the guesswork.</h2><p>Choose how each project is fixed. The slots, sockets and wall hardware are part of your print pack.</p>
          <ul className="site-options"><li><Layers size={20} /><div><strong>Push-on wall pucks</strong><span>One screw per tile. Tiles push straight on, so a wall can grow in any direction without taking anything down.</span></div></li><li><Magnet size={20} /><div><strong>Magnetic pucks</strong><span>The same square pucks, held by magnets. Lift a tile off by hand to swap it.</span></div></li><li><KeyRound size={20} /><div><strong>Keyhole slots</strong><span>Slots in the back for two screws, placed clear of seams and labels. The guide gives the exact spacing.</span></div></li><li><Ruler size={20} /><div><strong>A spacing jig</strong><span>Drops over a mounted puck and holds the next one square and at the right distance.</span></div></li></ul>
        </div>
      </div></section>
      <section className="site-touches site-width" id="finishing-touches" aria-labelledby="touches-title"><div className="site-split site-split-reverse">
        <div><p className="site-kicker">FINISHING TOUCHES</p><h2 id="touches-title">Say what the place means.</h2><p>Put your own words on the frame, raised or engraved, along the top or bottom edge. Add a matching plaque with a title, a dedication and the coordinates, in four shapes and two typefaces.</p><p>With a multicolour printer the lettering prints in its own colour. Without one, a single filament change does the same job.</p></div>
        <figure><Example name="lettering" alt="A framed Keswick relief with lettering along the bottom of the frame and a matching scooped-corner plaque below it" /><figcaption>Keswick · lettered frame and matching plaque</figcaption></figure>
      </div></section>
      <section className="site-downloads site-width" id="downloads" aria-labelledby="download-title">
        <div className="site-section-heading"><p className="site-kicker">YOURS, FOR £0</p><h2 id="download-title">Download Contour Studio.</h2><p>For the easiest setup, choose the Mac or Windows desktop app. Everything you need to design and generate print files is included.</p></div>
        <div className="site-download-grid">
          <article><Apple size={28} /><h3>macOS</h3><p>For Macs with an Apple M-series chip.</p><a className="site-button" href={downloadUrl("Contour-Studio-macOS-arm64.dmg")}><Download size={17} />Download for Mac</a><p className="site-file-note">Apple Silicon · .dmg</p></article>
          <article><Monitor size={28} /><h3>Windows</h3><p>For Windows 10 or later, 64-bit.</p><a className="site-button" href={downloadUrl("Contour-Studio-Windows-x64-Setup.exe")}><Download size={17} />Download for Windows</a><p className="site-file-note">Windows x64 · .exe</p></article>
          <article><Monitor size={28} /><h3>Local browser version</h3><p>Design and generate print files in your browser, with everything running on your computer. Extract the ZIP, install Python 3.12 and open the included launcher.</p><a className="site-button" href={downloadUrl("Contour-Studio-local.zip")}><Download size={17} />Download browser version</a><p className="site-file-note">Mac, Windows & Linux · Python 3.12 required · .zip</p></article>
          <article className="site-source-download"><Code2 size={28} /><h3>Build your own</h3><p>Explore the code, change it or run from source.</p><a className="site-button site-button-outline" href={downloadUrl("Contour-Studio-source.zip")}><Download size={17} />Download source</a><p className="site-file-note">MIT licence · .zip</p></article>
        </div>
        <div className="site-install-note"><p><strong>Desktop installers · {releaseTag}.</strong> The app includes single maps, expandable square or hexagonal tile walls with wall-mounting hardware, interlocking jigsaws, frame lettering and plaques, image tracing and ready-to-slice Bambu Studio projects. Community builds are unsigned. Mac may ask you to use Privacy & Security → Open Anyway; Windows may show an unknown-publisher prompt. Internet is needed to fetch map data. Model generation and project storage happen on your computer.</p><a href={releaseUrl} target="_blank" rel="noopener noreferrer">Release notes & installation help</a></div>
        <p className="site-browser-option">Want to explore first? <a href="#workspace">Open the free web designer</a>. Save your design settings, then open them in the desktop app or local browser version to generate print files.</p>
      </section>
      <section className="site-freedom" id="open-source" aria-labelledby="freedom-title"><div className="site-width site-freedom-grid"><div><p className="site-kicker">COMPLETELY FREE. COMPLETELY OPEN SOURCE.</p><h2 id="freedom-title">Do your thing.<br /><em>It’s yours to build on.</em></h2></div><div><p>Use it. Change it. Share it. Make something of your own. Contour Studio’s application code is released under the MIT licence, including permission for commercial use.</p><p>There’s no subscription, paid tier or generation fee. Keep the copyright and licence notice when sharing the software. Geographic data and third-party libraries keep their own licences and attribution requirements.</p><div className="site-actions"><a className="site-button site-button-light" href={repository} target="_blank" rel="noopener noreferrer"><Github size={19} />Public GitHub repository</a><a className="site-text-link" href={`${repository}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">Read the MIT licence</a></div></div></div></section>
      <section className="site-creator site-width" id="about-louis" aria-labelledby="site-creator-title"><Creator headingId="site-creator-title" /></section>
      <section className="site-thanks site-width" aria-labelledby="thanks-title"><div className="site-thanks-icon"><Heart size={27} /></div><div><p className="site-kicker">A SMALL THANK YOU, IF YOU FEEL LIKE IT</p><h2 id="thanks-title">Enjoyed making something?</h2><p>If Contour Studio helped you create a little piece of your world, you can buy me a coffee as a thanks. It’s entirely optional — every download and feature is free either way.</p></div><CoffeeLink className="site-coffee-button" /></section>
    </main>
    <footer className="site-footer site-width"><span>Contour Studio · Made by <a href="#about-louis">Louis Goldsbrough</a></span><div><CreatorLinks compact /><a href={repository} target="_blank" rel="noopener noreferrer">GitHub</a><a href={`${repository}/blob/main/README.md#real-data-and-operating-limits`} target="_blank" rel="noopener noreferrer">Data & attribution</a><CoffeeLink /></div></footer>
  </div>;
}
