/** Build a portable native Windows app without installing or changing the default Rust toolchain. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
if (process.platform !== "win32") throw new Error("This local desktop build targets Windows.");
// npm's CLI is JavaScript; run it with node so .cmd shell quoting is never involved.
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this builder using npm run desktop:build:local.");
run(process.execPath, [npmCli, "run", "web:build"]);
run(process.execPath, ["targets/web-shell/stage.mjs"]);
run("cargo", [
  "+1.88.0",
  "build",
  "--manifest-path",
  "targets/web-shell/Cargo.toml",
  "--release",
  "--locked",
]);
const destination = path.join(root, "output", "desktop");
fs.mkdirSync(destination, { recursive: true });
fs.copyFileSync(
  path.join(root, "targets/web-shell/target/release/random-ai-prompt.exe"),
  path.join(destination, "Random AI Prompt Local.exe"),
);
fs.cpSync(path.join(root, "targets/web-shell/app"), path.join(destination, "app"), {
  recursive: true,
});
fs.writeFileSync(path.join(destination, ".portable"), "");
console.log(`Desktop ready: ${destination}`);
