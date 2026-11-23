// Sincroniza la versión de package.json con src-tauri/Cargo.toml y Cargo.lock.
// Se ejecuta automáticamente en `pnpm version <x.y.z>` (script "version").
// tauri.conf.json ya lee la versión directamente de package.json.
import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

const toml = "src-tauri/Cargo.toml";
writeFileSync(
  toml,
  readFileSync(toml, "utf8").replace(/(\[package\][^[]*?\nversion = ")[^"]+(")/, `$1${version}$2`),
);

const lock = "src-tauri/Cargo.lock";
writeFileSync(
  lock,
  readFileSync(lock, "utf8").replace(/(name = "clipstudio"\nversion = ")[^"]+(")/, `$1${version}$2`),
);

console.log(`Versión sincronizada: ${version}`);
