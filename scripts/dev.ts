import { spawn, execSync } from "child_process";

const SIGNALING_PORT = parseInt(process.env.SIGNALING_PORT || "3001", 10);
const WEB_PORT = parseInt(process.env.PORT || "3000", 10);

function getPidsOnPort(port: number): number[] {
  try {
    const output = execSync(`lsof -ti:${port}`, { encoding: "utf8" }).trim();
    if (!output) return [];
    return output
      .split("\n")
      .map((pid) => parseInt(pid, 10))
      .filter((pid) => !Number.isNaN(pid));
  } catch {
    return [];
  }
}

async function stopProcessesOnPort(
  port: number,
  label: string,
): Promise<void> {
  const pids = getPidsOnPort(port);
  if (pids.length === 0) return;

  console.log(
    `[dev] Stopping stale ${label} process(es) on port ${port}: ${pids.join(", ")}`,
  );

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Process may have already exited
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function ensurePortsFree(): Promise<void> {
  await stopProcessesOnPort(SIGNALING_PORT, "signaling");
  await stopProcessesOnPort(WEB_PORT, "web");

  const blocked: string[] = [];

  if (getPidsOnPort(SIGNALING_PORT).length > 0) {
    blocked.push(`signaling (port ${SIGNALING_PORT})`);
  }
  if (getPidsOnPort(WEB_PORT).length > 0) {
    blocked.push(`web (port ${WEB_PORT})`);
  }

  if (blocked.length > 0) {
    console.error("[dev] Could not start — port(s) still in use:");
    for (const item of blocked) {
      console.error(`  - ${item}`);
    }
    console.error("\nStop them manually, then retry:");
    console.error(`  kill $(lsof -ti:${SIGNALING_PORT},${WEB_PORT})`);
    process.exit(1);
  }
}

function run(command: string, args: string[], name: string) {
  return spawn(command, args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
}

async function main() {
  await ensurePortsFree();

  console.log("[dev] Starting signaling + web servers...\n");

  const signaling = run("bunx", ["tsx", "server/signaling.ts"], "signaling");
  const web = run("bunx", ["next", "dev"], "web");

  let shuttingDown = false;

  const shutdown = (exitCode: number) => {
    if (shuttingDown) return;
    shuttingDown = true;

    if (!signaling.killed) signaling.kill("SIGTERM");
    if (!web.killed) web.kill("SIGTERM");

    setTimeout(() => process.exit(exitCode), 300);
  };

  signaling.on("exit", (code, signal) => {
    if (shuttingDown) return;

    if (code !== 0 && code !== null) {
      console.error(
        `\n[dev] Signaling server stopped (${signal || `code ${code}`}). Shutting down web server.`,
      );
      shutdown(code || 1);
    }
  });

  web.on("exit", (code, signal) => {
    if (shuttingDown) return;

    console.error(
      `\n[dev] Web server stopped (${signal || `code ${code}`}). Shutting down signaling server.`,
    );
    shutdown(code || 0);
  });

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
}

main().catch((error) => {
  console.error("[dev] Failed to start:", error);
  process.exit(1);
});