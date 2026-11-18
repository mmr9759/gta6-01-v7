// VELMARA entrypoint: hands the game in by copying game/ and screenshots/
// into the output directory and writing dossier.json with the kit library.
// Paths resolve relative to this file, never the working directory.
// Writes only inside the output directory; never deletes anything there.
import { buildDossier } from "./vendor/makefun-game.ts";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here: string = dirname(fileURLToPath(import.meta.url));
const outDir: string = resolve(process.env.MAKEFUN_OUTPUT_DIR || "/output");
const gameDir: string = join(here, "game");
const shotsDir: string = join(here, "screenshots");

mkdirSync(join(outDir, "game"), { recursive: true });
mkdirSync(join(outDir, "screenshots"), { recursive: true });
cpSync(gameDir, join(outDir, "game"), { recursive: true });
cpSync(shotsDir, join(outDir, "screenshots"), { recursive: true });

const dossier: Uint8Array = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000
});
writeFileSync(join(outDir, "dossier.json"), dossier);
console.log("VELMARA dossier written: " + dossier.length + " bytes -> " + join(outDir, "dossier.json"));
