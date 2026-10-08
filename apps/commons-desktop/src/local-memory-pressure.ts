import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { freemem, totalmem } from "node:os";
import { promisify } from "node:util";
const execute = promisify(execFile);

/** macOS free memory excludes reclaimable caches; use its pressure signal instead. */
export async function localMemoryPressureHigh(): Promise<boolean> {
  try {
    if (process.platform === "darwin") {
      const { stdout } = await execute(
        "/usr/sbin/sysctl",
        ["-n", "kern.memorystatus_vm_pressure_level"],
        { timeout: 1500 },
      );
      const level = Number(stdout.trim());
      return !Number.isFinite(level) || level >= 2;
    }
    const available =
      process.platform === "linux"
        ? Number(
            (await readFile("/proc/meminfo", "utf8")).match(
              /^MemAvailable:\s+(\d+)/m,
            )?.[1],
          ) * 1024
        : freemem();
    return (
      Number.isFinite(available) &&
      available < Math.max(768 * 1024 ** 2, totalmem() * 0.08)
    );
  } catch {
    return true;
  } // If pressure cannot be measured, skip background allocations.
}
