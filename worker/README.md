# tip-ledger

One Cloudflare Worker that serves the marketing site **and** the shared ledger
that tracks total tokens used across all TIP users. The site is the static build
in `../docs`; the ledger is a single Durable Object instance (`global`), so the
counter stays atomic no matter how many clients report at once. Both live at
`https://tip.yeth.dev`.

## Endpoints

| Method | Path      | Purpose                                        |
| ------ | --------- | ---------------------------------------------- |
| `GET`  | `/total`  | Current `{ total, reports, updatedAt }`        |
| `POST` | `/report` | Add a run's tokens: body `{ "tokens": 12345 }` |

Every other path is served from `../docs` via the `[assets]` binding (`/` →
`index.html`, unknown routes → `404.html`). `/report` is rate limited per IP and
clamps each report to a sane maximum so one client can't distort the shared
number.

## Develop

```sh
npm run ledger:dev      # wrangler dev --config worker/wrangler.toml
```

## Deploy

```sh
npm run ledger:deploy   # wrangler deploy --config worker/wrangler.toml
```

The custom domain is attached in `wrangler.toml`. The site calls the ledger with
same-origin relative paths, so it follows wherever the worker is served; only the
CLI's `telemetry.endpoint` in `tip.config.json` is an absolute URL.
