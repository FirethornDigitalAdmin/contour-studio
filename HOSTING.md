# Free hosting and a public repository

The public website opens on the **download homepage**, with Mac and Windows installers, the public GitHub repository, MIT licence information and an optional [Buy Me a Coffee](https://www.buymeacoffee.com/LouisGoldsbrough) thank-you link. The free web designer is available at `#workspace`.

The **design workspace**: visitors select a place, choose artwork dimensions and styling, and export their settings. Generating STL/3MF print packs happens in their own installed desktop app or local-browser copy. Import the settings there and generate the model.

This keeps model processing and project storage on each user's computer. No cloud generation server, database, paid API key or shared processing queue is required. Map and search providers still receive geographic requests; see the data attribution and operating limits in [README.md](README.md).

## Prepare the repository

1. Run `pnpm build` and `python scripts/build_release.py`.
2. Extract `releases/Contour-Studio-source.zip` and create a public GitHub repository from its `Contour-Studio/` folder.
3. Keep the supplied `.gitignore`, `LICENSE` and source-data attribution. The source ZIP includes the app, native packaging, build scripts and GitHub workflows; it excludes your projects, map caches, installed dependencies, generated files and local development notes.

Using the clean ZIP is the simplest way to avoid uploading personal working files. If publishing an existing repository, check its tracked files and history separately: `.gitignore` does not remove material that has already been committed.

The application code is MIT licensed. Geographic data and bundled dependencies retain their own licences, including OpenStreetMap/Overture attribution. The local release includes collected frontend dependency notices.

## Enable GitHub Pages

[GitHub Pages supports public repositories on GitHub Free](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). It serves static HTML, CSS and JavaScript; the Python engine stays on the user's computer.

1. Push the source to the repository's `main` branch.
2. Open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
3. Run **Actions → Deploy free web workspace → Run workflow**.
4. Open the URL shown by the successful deployment. Project sites normally use `https://OWNER.github.io/REPOSITORY/`.
5. Build and test desktop installers using [DESKTOP.md](DESKTOP.md), then attach them to a GitHub Release alongside the local-browser ZIP. Visitors can use the workspace's local-generation guidance to continue in an installed copy.

The workflow builds only the hosted interface into `dist-hosted/`; it does not upload the Python server or your `data/` folder. Relative asset paths support repository subdirectories. These instructions prepare publication; no repository, release or website is created by running a local build.

## Preview the hosted workspace locally

```sh
pnpm install --frozen-lockfile
pnpm build:hosted
pnpm preview:hosted
```

Open the address printed by Vite. Hosted mode supports design settings but does not connect to a local Python engine automatically. Export settings, open the desktop/local app and import them to generate.

For another static host, upload `dist-hosted/` after `pnpm build:hosted`. A custom geocoder can be configured at build time with `VITE_GEOCODER_URL`; use a compatible Nominatim-style search response and the provider's required usage terms. Public geographic services have usage limits, so reassess providers if the website attracts sustained heavy traffic.

## Website links and updates

The public website is [Contour Studio](https://firethorndigitaladmin.github.io/contour-studio/). Hosted builds open the download page by default; local and desktop builds open the app directly. `#downloads` opens the download section and `#workspace` opens the browser designer.

`src/distribution.ts` holds the shared GitHub repository, pinned release tag and optional coffee URL. Keep the release tag and installer filenames aligned with the actual published assets when preparing a new release. The app and website share `CoffeeLink.tsx`; no payment SDK, tracking widget or feature gate is used.

The creator introduction and Twitter / X and portfolio links are shared through
`src/Creator.tsx` and the `creator` entry in `src/distribution.ts`. The website
offers **Meet Louis** in its navigation and social links in the footer. The app
opens the same introduction from **by Louis Goldsbrough** beneath the logo or
from Help. External links open in a separate browser tab or the desktop app's
system browser.

After pushing website/app changes to `main`, run **Actions → Deploy free web workspace → Run workflow** to publish them. The website uses static hosting; downloads are served by GitHub Releases.

## Sites deployment

The same website is now published publicly through Sites at
[Contour Studio](https://contour-studio.louisgoldsbrough.chatgpt.site).
Its separate deployment checkout is `sites-contour-studio/`, with the Sites identity
in `sites-contour-studio/.openai/hosting.json`. This checkout contains only the
compiled public website and licence; local projects, caches and the Python engine
are excluded. Downloads continue to use GitHub Releases.

To update this deployment, run `pnpm build:hosted` in the application directory,
replace the deployment checkout's `dist/` with the new `dist-hosted/`, then use the
Sites source-and-publishing workflow in that checkout. Preserve its existing Site
identity and public audience.

The primary address is [contour-studio.app](https://contour-studio.app/).
On 3 October 2026 Sites confirmed the custom domain, routing and SSL were active,
and an HTTPS request returned HTTP 200. The following DNS records were supplied
by Sites for the connection:

| Type | Name | Content |
| --- | --- | --- |
| A | `@` | `162.159.143.30` |
| A | `@` | `172.66.3.26` |
| TXT | `_openai-site-verification` | `openai-site-verification=B6v1EPvIrNwpOTjaZeVEVfm0UC_PBmKpZYHoSmTHrQM` |
| TXT | `_cf-custom-hostname` | `93188e69-54db-4813-9f1c-3a4286c1c27e` |

Inspect existing apex records before replacing any that route the website. Keep
mail and unrelated records. After adding the records, refresh the custom-domain
status in Sites; both routing and SSL must be active before treating the domain
as ready. These are the records returned for this Site, not generic defaults.

### Current workspace downloads

The Sites deployment serves the rebuilt local-browser and source ZIPs at
`/downloads/Contour-Studio-local.zip` and `/downloads/Contour-Studio-source.zip`,
with matching hashes in `/downloads/SHA256SUMS.txt`. Rebuild the interface and
release ZIPs, verify their CRC and contents, then copy them into the deployment
checkout's `dist/downloads/` alongside the hosted interface before publishing.
These current copies include tracing and the colour-depth fix. The Mac and
Windows installer links remain pinned to their separately tested GitHub release;
a source push or web publication does not rebuild those installers.
