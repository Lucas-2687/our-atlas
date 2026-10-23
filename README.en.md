# travel-map

[中文](README.md) | English

A shared travel map and journal for two people. Record places, dates, stories, and photos, with one map per deployment. The default Chinese map name can be “我们的旅行地图”.

**The app currently has a Chinese interface.** These bilingual READMEs document the same app; they do not add runtime internationalization or a language switcher. Screenshots below show the Chinese UI.

[Create your repository from the template](https://github.com/Lucas-2687/travel-map/generate)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FLucas-2687%2Ftravel-map&env=SUPABASE_URL%2CSUPABASE_SECRET_KEY%2CATLAS_SETUP_KEY&envLink=https%3A%2F%2Fgithub.com%2FLucas-2687%2Ftravel-map%2Fblob%2Fmain%2FREADME.en.md)

Set up your own Supabase project before deploying. If you already created a repository from the template, import that repository into Vercel instead of creating another copy with the deploy button.

Detailed guides (in Chinese): [Deployment](docs/deployment.md) · [Daily use](docs/usage.md) · [Maintenance and backups](docs/maintenance.md).

## Features

- A world map of visited countries and cities, with province and prefecture layers for China. Some newer administrative areas appear as city markers where verified boundaries are unavailable.
- Trips with multiple places, a title, a story, and up to 12 photos.
- Exact dates, months, years, or no date for trips you only partly remember.
- Repeat visits as separate journal entries; each city still counts once in footprint statistics.
- A shared editing passphrase at `/edit`, usable on separate devices without individual accounts or a map ID.
- Read-only links for selected trips, with expiration and revocation, plus a downloadable PNG map and statistics card.

![Overview: map, shared footprints, and recent trips in the Chinese UI](docs/images/overview.png)

| Journal | Trip details |
| --- | --- |
| [![Trips in chronological order](docs/images/journal.png)](docs/images/journal.png) | [![Dates, places, story, and photos](docs/images/trip-detail.png)](docs/images/trip-detail.png) |
| Repeat visits remain separate entries. | Open a trip to see all its places and memories. |

| Recording a trip | Sharing and export |
| --- | --- |
| [![Trip editing form in Chinese](docs/images/record-trip.png)](docs/images/record-trip.png) | [![Footprint export and sharing panel](docs/images/share.png)](docs/images/share.png) |
| Add at least one place; dates and stories can wait. This screenshot edits an existing example trip; new trips use the same fields. | Export a PNG or create a read-only link. Neither replaces a backup. |

Screenshots use fictional trips and project-made illustrations, with no real user records. A new deployment starts with an empty map. Open an image to view it at full size.

## Code, data, and public access

![Architecture: GitHub stores code, Vercel runs the site, Supabase stores trips and photos](docs/images/architecture.svg)

The app uses Next.js, Vercel, and Supabase. Your Supabase Postgres database stores trips; the private Storage bucket `travel-photos` stores photos. Publishing the source does not export your database or photos. Keep personal configuration, backups, and real-data screenshots out of the repository.

**The homepage is public.** Anyone visiting `/` can read saved trips, names, places, dates, stories, and attached photos. The editing passphrase controls changes only. Share-link scope, expiry, and revocation affect that link; they do not hide records on the homepage. A private repository does not make the deployed site private.

The private bucket prevents direct storage access, but the website API serves photos attached to public trips to visitors. Unattached photos are readable only by editors.

Uploads accept JPG, PNG, and WebP, with at most 12 photos per trip. Each uploaded file must be at most 4 MiB and 40 megapixels, with neither input dimension exceeding 16,384 pixels. The browser compresses photos before upload. The server corrects orientation, re-encodes them, strips metadata including EXIF/GPS, and limits the saved longest edge to 4,096 pixels. The processed file must also fit within 4 MiB. Existing photos are not automatically rewritten. A PNG footprint card is not a database or photo backup.

## Deploy your own site

The [illustrated deployment guide (Chinese)](docs/deployment.md) covers account setup, click-by-click instructions, and troubleshooting. The browser-only route needs no local Node.js installation. For an existing site, use the upgrade section below.

![Six deployment steps, from copying the template to recording trips](docs/images/deployment-flow.svg)

### 1. Create a repository

Use the GitHub template link above and choose **Use this template → Create a new repository**. The upstream repository must have **Template repository** enabled in Settings. A fork is another option if you want upstream history; template copies have no shared commit history, so updates need to be merged manually.

You can import your repository at [Vercel New Project](https://vercel.com/new). To generate deployment and template links for your own public repository, run this in the application directory:

```powershell
npm run deploy:link -- https://github.com/Lucas-2687/travel-map
```

Replace the URL with your repository when deploying your copy. With a configured Git remote, `npm run deploy:link` can infer it. The command only prints links and button markup; it uploads no code or secrets.

### 2. Initialize Supabase

Create your own Supabase project. Never use the maintainer's database or keys.

For a **new installation**, execute these migrations in order in its SQL Editor:

1. [supabase/migrations/0001_initial_schema.sql](supabase/migrations/0001_initial_schema.sql)
2. [supabase/migrations/0002_vercel_functions.sql](supabase/migrations/0002_vercel_functions.sql)
3. [supabase/migrations/0003_single_site_map.sql](supabase/migrations/0003_single_site_map.sql)
4. [supabase/migrations/0004_server_table_privileges.sql](supabase/migrations/0004_server_table_privileges.sql)
5. [supabase/migrations/0005_private_photo_bucket.sql](supabase/migrations/0005_private_photo_bucket.sql)

Alternatively, generate the combined SQL from the application directory and paste the complete output into the new project's SQL Editor. Generating it requires Node.js but no installed dependencies:

```powershell
npm run --silent db:setup
```

On Windows, copy it directly to the clipboard:

```powershell
node .\scripts\supabase-setup.mjs | Set-Clipboard
```

This command reads migrations in filename order. It does not connect to or modify a database. The SQL creates tables, functions, RLS, server permissions, and the private photo bucket; it imports no trips, names, passphrases, or photos. Do not repeat the new-installation process on an existing site.

Enable the Supabase Data API with the `public` schema exposed: the server uses its REST API. The `anon` and `authenticated` roles should not have access to the app tables. Retrieve your Project URL and a server key from project settings; an `sb_secret_` key is recommended.

### 3. Deploy with Vercel

Import your repository, select **Next.js**, and set Root Directory to the directory containing [package.json](package.json). If that is the repository root, no nested path is needed. Choose a supported Node.js version of at least 22.13.

Set these three server-side environment variables, then deploy:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Your Supabase Project URL. |
| `SUPABASE_SECRET_KEY` | Your Supabase server key. Never prefix it with `NEXT_PUBLIC_`. |
| `ATLAS_SETUP_KEY` | A random initialization key of at least 12 characters, separate from the editing passphrase. Needed only for initial setup. |

Keep the existing compatibility name `ATLAS_SETUP_KEY`. Do not rename database identifiers, cookies, or environment variables to match the project brand. Local development uses the same variables in `.env.local`. Never put real values in deployment URLs, documentation, source code, or issues. The deploy button does not initialize Supabase for you.

### 4. Set up the map

1. Wait for Vercel to report **Ready**, then open `/edit` on your new site.
2. Enter the initialization key and set the names, map title, and an editing passphrase of at least 12 characters. Initial setup succeeds only once.
3. Remove `ATLAS_SETUP_KEY` from Vercel and **redeploy**. Confirm that the editing passphrase still opens `/edit`.
4. Bookmark `/edit` and share the passphrase separately with your partner; do not include it in a URL.
5. Choose “记录共同旅行”, add at least one place and any dates, story, or photos, then save. Refresh to confirm the record persists and open `/` to see the public result.

Editors can manage trips, photos, the map title, and the passphrase in the browser. There is no automatic passphrase recovery; see [maintenance (Chinese)](docs/maintenance.md) for recovery steps. No Codex, ChatGPT account, or map-service API key is required.

## Local development

Requires Node.js >= 22.13.0 and Git. From the directory containing `package.json`:

```powershell
npm ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Fill in `.env.local` with your own **test** Supabase settings, initialize that database as above, then start the app:

```powershell
npm run dev
```

Open `http://localhost:3000`. Initial map setup works as it does online. Use a separate test Supabase project for local work and Preview deployments so experiments do not change production data.

Run the existing checks:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run check:public
```

Tests use fictional images, an in-memory database, and mocked storage; they need no service keys or external network. Production builds need no database connection. CI runs these checks on Node 22.13 and 24; it does not migrate production databases or deploy automatically. Some existing `any` and React Hooks lint warnings are retained for the original files. `npm run lint` checks errors; `npx eslint .` also shows warnings.

## Upgrade an existing site

Keep your existing Vercel project, Supabase project, and environment variables. Do not copy production data into the repository or initialize another site.

1. Back up both the database and Storage objects first. See [backup and recovery (Chinese)](docs/maintenance.md#备份与恢复).
2. Check which migrations have already run and apply only missing ones. Sites with `0001`–`0004` need only `0005_private_photo_bucket.sql`. It preserves an existing private bucket and stops if a public bucket with the same name exists, so you can review its settings; it does not silently change permissions.
3. Older sites without a single-site map binding need `0003_single_site_map.sql`. Exactly one old map is reused with its trips, photos, and passphrase intact. With multiple maps, the owner must explicitly choose which to bind; do not arbitrarily publish one.
4. Verify the update in an isolated Preview environment, then connect production to the intended repository and release branch. Vercel builds on pushes to that branch.
5. Open `/edit` with the original passphrase and check existing trips and photos. Upload processing changes apply to future uploads, not historical photos.

The [upgrade guide (Chinese)](docs/deployment.md#已有网站升级保留数据与原口令) and [maintenance guide (Chinese)](docs/maintenance.md) cover map binding, passphrase recovery, logs, rollback, and common failures.

## Maintenance and license

Edit travel content through `/edit`; code changes and redeployment are unnecessary for everyday records. Maintain features in your editor, validate locally, then push through your normal Git and Vercel workflow. Manage server secrets in Vercel and data in Supabase. Keep independent backups of both the database and photos, and monitor hosting and storage quotas.

Before publishing, review the files manually and run:

```powershell
npm run check:public -- --staged --release
```

This checks common sensitive files, secret patterns, and map sources and hashes. It cannot decide whether a story or screenshot is private, or prove that commit history contains no secrets.

Static map assets ship with the source; routine builds do not download upstream map data. Existing place IDs are preserved. See [map data (Chinese)](docs/map-data.md) for coverage and regeneration, and [third-party sources (Chinese)](THIRD_PARTY.md) for Natural Earth, HDX/geoBoundaries, Leaflet, and other licenses.

Project code is licensed under [MIT](LICENSE). Example trips are fictional, and the three sample illustrations are project-made SVGs. Third-party maps and dependencies retain their own licenses.
