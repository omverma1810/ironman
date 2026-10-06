// Serves the static web export (`npm run export:web`) for the end-to-end
// tests: files as they are, and index.html for any other path, which is how
// expo-router's single-page web output expects to be hosted.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist-web", import.meta.url));
const port = Number(process.env.PORT ?? 8081);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname));
  let file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, "index.html");
  }
  response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
}).listen(port, () => console.log(`Serving ${root} on http://localhost:${port}`));
