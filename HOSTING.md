# Free hosting and a public repository

The public website is a **design workspace**: visitors select a place, choose artwork dimensions and styling, and export their settings. Generating STL/3MF print packs happens in their own installed desktop app or local-browser copy. Import the settings there and generate the model.

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
