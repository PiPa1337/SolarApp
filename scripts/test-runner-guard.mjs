import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WATCHDOG_FLAG = "--solara-test-watchdog";
const WATCHDOG_POLL_MS = 250;
const scriptPath = fileURLToPath(import.meta.url);

export function resolveTimeoutMs(rawValue, fallbackMs, maxMs) {
  const parsed = Number(rawValue);
  const candidate = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallbackMs;
  return Math.min(candidate, maxMs);
}

export function readCliNumberOption(args, name) {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === name) {
      const value = Number(args[index + 1]);
      return Number.isFinite(value) && value > 0 ? value : null;
    }
    if (arg.startsWith(`${name}=`)) {
      const value = Number(arg.slice(name.length + 1));
      return Number.isFinite(value) && value > 0 ? value : null;
    }
  }
  return null;
}

export function killProcessTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === "win32") {
    const taskkill = spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    if (taskkill.status === 0) return;

    const windowsPowerShell = resolve(
      process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    const script = [
      `$root = ${pid}`,
      "$all = @(Get-Process -ErrorAction SilentlyContinue)",
      "$children = @{}",
      "foreach ($p in $all) {",
      "  if ($null -eq $p.Parent) { continue }",
      "  $parentId = $p.Parent.Id",
      "  if (-not $children.ContainsKey($parentId)) { $children[$parentId] = @() }",
      "  $children[$parentId] += $p.Id",
      "}",
      "$stack = [System.Collections.Generic.Stack[int]]::new()",
      "$order = [System.Collections.Generic.List[int]]::new()",
      "$stack.Push($root)",
      "while ($stack.Count -gt 0) {",
      "  $current = $stack.Pop()",
      "  $order.Add($current)",
      "  if ($children.ContainsKey($current)) {",
      "    foreach ($childId in $children[$current]) { $stack.Push([int]$childId) }",
      "  }",
      "}",
      "$targets = $order.ToArray()",
      "[array]::Reverse($targets)",
      "foreach ($targetId in $targets) {",
      "  Stop-Process -Id $targetId -Force -ErrorAction SilentlyContinue",
      "}",
    ].join("; ");
    spawnSync(windowsPowerShell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // El proceso ya terminó.
    }
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function runWatchdog(parentPid, childPid) {
  await new Promise((resolveWatchdog) => {
    const stop = () => {
      clearInterval(timer);
      resolveWatchdog();
    };
    const check = () => {
      if (isProcessAlive(parentPid)) return;
      killProcessTree(childPid);
      stop();
    };
    const timer = setInterval(check, WATCHDOG_POLL_MS);
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
    check();
  });
}

export function spawnDetachedWatchdog(parentPid, childPid) {
  const watchdog = spawn(
    process.execPath,
    [scriptPath, WATCHDOG_FLAG, String(parentPid), String(childPid)],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  watchdog.unref();
  return watchdog;
}

if (resolve(process.argv[1] ?? "") === resolve(scriptPath) && process.argv[2] === WATCHDOG_FLAG) {
  const parentPid = Number(process.argv[3]);
  const childPid = Number(process.argv[4]);
  if (Number.isInteger(parentPid) && Number.isInteger(childPid)) {
    await runWatchdog(parentPid, childPid);
  }
  process.exit(0);
}
