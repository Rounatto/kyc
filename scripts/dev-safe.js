const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

function stopExistingMyAppNextOnWindows() {
  if (process.platform !== "win32") return;

  const cwd = process.cwd().replace(/'/g, "''");
  const command = [
    `$cwd = '${cwd}'`,
    `$pattern = [Regex]::Escape($cwd) + '\\\\node_modules\\\\next\\\\dist\\\\server\\\\lib\\\\start-server\\\\.js'`,
    `$procs = Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -match $pattern }`,
    `foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }`,
  ].join("; ");

  try {
    execSync(`powershell -NoProfile -Command \"${command}\"`, {
      stdio: "ignore",
    });
  } catch {
    // Continue even if process cleanup fails.
  }
}

function removeStaleLockFiles() {
  const lockFiles = [
    path.join(process.cwd(), ".next", "dev", "lock"),
    path.join(process.cwd(), ".next", "lock"),
  ];

  for (const lockFile of lockFiles) {
    try {
      fs.rmSync(lockFile, { force: true });
    } catch {
      // Continue even if lock file cannot be removed.
    }
  }
}

function startNextDev() {
  const nextBin = require.resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "dev"], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

stopExistingMyAppNextOnWindows();
removeStaleLockFiles();
startNextDev();