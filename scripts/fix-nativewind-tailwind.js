#!/usr/bin/env node
// apps/web needs tailwindcss v4, apps/mobile/nativewind needs v3. npm correctly
// nests a local v3 copy under apps/mobile/node_modules, but nativewind itself
// gets hoisted to the workspace root and its Metro config does a plain
// require("tailwindcss") from there, which resolves the hoisted v4 first and
// throws "NativeWind only supports Tailwind CSS v3". Force-nesting the v3
// build inside nativewind's own node_modules makes Node's resolution find it
// before walking up to the root copy. Runs on every install since npm prunes
// this as "extraneous" otherwise.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "apps/mobile/node_modules/tailwindcss");
const dest = path.join(root, "node_modules/nativewind/node_modules/tailwindcss");

if (!fs.existsSync(src) || !fs.existsSync(path.join(root, "node_modules/nativewind"))) {
  process.exit(0);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log("[fix-nativewind-tailwind] nested tailwindcss v3 under nativewind/node_modules");
