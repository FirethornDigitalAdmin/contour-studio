# Search and sharing

The public website uses `https://contour-studio.app/` as its canonical URL. Its title, description, Open Graph and X card metadata are in `index.html` and available directly in the HTML response. The sharing card is `public/og.png`, 1200 × 630 pixels; see `brand/social-preview.md` for its references and generation prompt.

`public/favicon.svg` and `src/BrandMark.tsx` share a simplified three-layer map silhouette. Browser ICO/PNG fallbacks, the Apple touch icon and Android/shortcut icons are checked into `public/`; `scripts/build-web-icons.mjs` rebuilds them using Sharp. The maskable icon keeps its motif in the safe centre area.

`pnpm build:hosted` builds the site and runs `scripts/prerender-home.mjs`, rendering the real `DownloadSite.tsx` into the homepage and collecting its CSS from Vite’s manifest. React hydrates that page on load. Direct `#workspace` links still open the browser designer. Local/desktop builds continue to open the workspace directly.

`public/robots.txt` permits crawling and points to `public/sitemap.xml`. The sitemap contains the actual homepage; hash navigation is part of that page. JSON-LD describes the website, page, share image and free desktop software, with the existing release and licence links. No reviews, ratings or awards are invented.

After each public release, keep the software version and download URL in the structured data aligned with `src/distribution.ts`. If the canonical domain changes, update the HTML metadata, structured-data URLs, sitemap and robots.txt together. Search-engine selection of snippets, indexing and ranking is external to this implementation.

## Verified on 3 October 2026

- Hosted and local/desktop production builds passed, including TypeScript checking.
- `tests/browser-site-seo.cjs` passed against the hosted production build: styled content and download links without JavaScript; canonical, language and structured data; correctly sized share image; favicon, touch and manifest assets; robots/sitemap responses; 1440, 768 and 390 pixel layouts; interactive 3D controls after hydration; linked/direct workspace entry and return; no hydration or page errors.
- Desktop and phone viewport screenshots were inspected. Evidence is in `data/site-seo/`. Chromium’s full-page capture after resizing repeated viewport bands in the phone screenshot; fresh fixed-viewport captures confirmed the actual page renders and scrolls correctly, with one homepage and one main heading.
- Sites publication succeeded. Anonymous requests using a social-crawler user agent returned HTTP 200 on the custom domain for the homepage, share image, robots.txt, sitemap.xml and web manifest. The homepage contained its real copy, canonical and Open Graph image URL; the public share image matched the local file byte-for-byte.

The share card is promotional artwork generated with the built-in image-generation tool from the existing map room mockup; its room image is labelled as a digital mockup.
