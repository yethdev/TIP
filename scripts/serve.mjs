// Minimal static server for previewing docs/ locally. No deps; not for prod.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";

const ROOT = join(process.cwd(), "docs");
const PORT = Number(process.env.PORT) || 8000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function notFound(res) {
  res.writeHead(404, { "content-type": TYPES[".html"] });
  createReadStream(join(ROOT, "404.html")).pipe(res);
}

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);

  // directories resolve to index.html; reject any traversal segments outright
  let pathname = urlPath.endsWith("/") ? `${urlPath}index.html` : urlPath;
  const segments = pathname.split("/").filter((s) => s && s !== "." && s !== "..");
  const file = join(ROOT, ...segments);

  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  let stat;
  try {
    stat = statSync(file);
  } catch {
    notFound(res);
    return;
  }

  if (stat.isDirectory()) {
    res.writeHead(301, { location: `${urlPath.replace(/\/$/, "")}/` }).end();
    return;
  }

  res.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
  });
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  process.stdout.write(`docs serving on http://localhost:${PORT}\n`);
});
