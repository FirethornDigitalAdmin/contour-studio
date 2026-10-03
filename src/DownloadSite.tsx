import { Apple, Check, Code2, Download, Github, Heart, MapPin, Monitor, Palette, Printer } from "lucide-react";
import BrandMark from "./BrandMark";
import CoffeeLink from "./CoffeeLink";
import Creator, { CreatorLinks } from "./Creator";
import HeroModel from "./HeroModel";
import { downloadUrl, releaseUrl, repository } from "./distribution";
import "./download-site.css";

export default function DownloadSite() {
  return <div className="download-site">
    <a className="site-skip" href="#main">Skip to content</a>
    <header className="site-header site-width">
      <a className="site-brand" href="#" aria-label="Contour Studio home"><span><BrandMark /></span>contour <span className="site-brand-light">studio</span></a>
      <nav aria-label="Main navigation"><a href="#downloads">Downloads</a><a href="#open-source">Open source</a><a href="#about-louis">Meet Louis</a><CoffeeLink /></nav>
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
      <section className="site-downloads site-width" id="downloads" aria-labelledby="download-title">
        <div className="site-section-heading"><p className="site-kicker">YOURS, FOR £0</p><h2 id="download-title">Download Contour Studio.</h2><p>The desktop app includes the generation engine. You don’t need Python, Node.js or a paid service.</p></div>
        <div className="site-download-grid">
          <article><Apple size={28} /><h3>macOS</h3><p>For Macs with an Apple M-series chip.</p><a className="site-button" href={downloadUrl("Contour-Studio-macOS-arm64.dmg")}><Download size={17} />Download for Mac</a><p className="site-file-note">Apple Silicon · .dmg</p></article>
          <article><Monitor size={28} /><h3>Windows</h3><p>For Windows 10 or later, 64-bit.</p><a className="site-button" href={downloadUrl("Contour-Studio-Windows-x64-Setup.exe")}><Download size={17} />Download for Windows</a><p className="site-file-note">Windows x64 · .exe</p></article>
          <article><Monitor size={28} /><h3>Current local workspace</h3><p>Image tracing and the latest print fixes. Runs in your browser on your computer.</p><a className="site-button" href={downloadUrl("Contour-Studio-local.zip")}><Download size={17} />Download local workspace</a><p className="site-file-note">Python 3.12 required · Mac, Windows & Linux · .zip</p></article>
          <article className="site-source-download"><Code2 size={28} /><h3>Build your own</h3><p>Explore the code, change it or run from source.</p><a className="site-button site-button-outline" href={downloadUrl("Contour-Studio-source.zip")}><Download size={17} />Download source</a><p className="site-file-note">MIT licence · .zip</p></article>
        </div>
        <div className="site-install-note"><p><strong>Desktop installers · v1.0.0-rc.1.</strong> The current local workspace and source downloads include image tracing and the latest print fixes. Community builds are unsigned. Mac may ask you to use Privacy & Security → Open Anyway; Windows may show an unknown-publisher prompt. Internet is needed to fetch map data. Model generation and project storage happen on your computer.</p><a href={releaseUrl} target="_blank" rel="noopener noreferrer">Release notes & installation help</a></div>
        <p className="site-browser-option">Want to explore first? <a href="#workspace">Open the free web designer</a>. Design in your browser, then generate the print files in the current local workspace.</p>
      </section>
      <section className="site-freedom" id="open-source" aria-labelledby="freedom-title"><div className="site-width site-freedom-grid"><div><p className="site-kicker">COMPLETELY FREE. COMPLETELY OPEN SOURCE.</p><h2 id="freedom-title">Do your thing.<br /><em>It’s yours to build on.</em></h2></div><div><p>Use it. Change it. Share it. Make something of your own. Contour Studio’s application code is released under the MIT licence, including permission for commercial use.</p><p>There’s no subscription, paid tier or generation fee. Keep the copyright and licence notice when sharing the software. Geographic data and third-party libraries keep their own licences and attribution requirements.</p><div className="site-actions"><a className="site-button site-button-light" href={repository} target="_blank" rel="noopener noreferrer"><Github size={19} />Public GitHub repository</a><a className="site-text-link" href={`${repository}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">Read the MIT licence</a></div></div></div></section>
      <section className="site-creator site-width" id="about-louis" aria-labelledby="site-creator-title"><Creator headingId="site-creator-title" /></section>
      <section className="site-thanks site-width" aria-labelledby="thanks-title"><div className="site-thanks-icon"><Heart size={27} /></div><div><p className="site-kicker">A SMALL THANK YOU, IF YOU FEEL LIKE IT</p><h2 id="thanks-title">Enjoyed making something?</h2><p>If Contour Studio helped you create a little piece of your world, you can buy me a coffee as a thanks. It’s entirely optional — every download and feature is free either way.</p></div><CoffeeLink className="site-coffee-button" /></section>
    </main>
    <footer className="site-footer site-width"><span>Contour Studio · Made by <a href="#about-louis">Louis Goldsbrough</a></span><div><CreatorLinks compact /><a href={repository} target="_blank" rel="noopener noreferrer">GitHub</a><a href={`${repository}/blob/main/README.md#real-data-and-operating-limits`} target="_blank" rel="noopener noreferrer">Data & attribution</a><CoffeeLink /></div></footer>
  </div>;
}
