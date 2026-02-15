import { execSync } from "child_process";

const cwd = "/vercel/share/v0-project";

console.log("Installing dependencies with pnpm...");
try {
  const output = execSync("pnpm install --no-frozen-lockfile", {
    cwd,
    stdio: "pipe",
    timeout: 120000,
  });
  console.log(output.toString());
  console.log("Dependencies installed successfully!");
} catch (err) {
  console.error("Install failed:", err.message);
  if (err.stdout) console.log("stdout:", err.stdout.toString());
  if (err.stderr) console.log("stderr:", err.stderr.toString());
}
