# tip-ledger

The shared ledger that tracks total tokens wasted across all TIP users. It is a
single Cloudflare Worker fronting one Durable Object instance (`global`), so the
counter stays atomic no matter how many clients report at once.

## Endpoints

| Method | Path      | Purpose                                          |
| ------ | --------- | ------------------------------------------------ |
| `GET`  | `/total`  | Current `{ total, reports, updatedAt }`          |
| `POST` | `/report` | Add a run's tokens: body `{ "tokens": 12345 }`   |
| `GET`  | `/`       | Service status plus the current snapshot         |

`/report` is rate limited per IP and clamps each report to a sane maximum so one
client can't distort the shared number.

## Develop

```sh
npm run ledger:dev      # wrangler dev --config worker/wrangler.toml
```

## Deploy

```sh
npm run ledger:deploy   # wrangler deploy --config worker/wrangler.toml
```

The config and site point at `https://tip.yeth.dev`. After deploy, map that
custom domain to this worker (or update `telemetry.endpoint` in `tip.config.json`
and `LEDGER_URL` in `docs/app.js` to the published URL).
