export const DEFAULT_CLOUD_ACCESS = Object.freeze({
  readFiles: true,
  writeFiles: true,
  runCommands: false,
});

export function normalizeCloudAccess(value) {
  return {
    readFiles: value?.readFiles === true,
    writeFiles: value?.writeFiles === true,
    runCommands: value?.runCommands === true,
  };
}

export function cloudToolPermission(tool) {
  if (["list_directory", "read_file", "search_files"].includes(tool)) return "readFiles";
  if (tool === "write_file") return "writeFiles";
  if (["run_command", "start_process", "wait_for_process", "process_status", "kill_process", "list_processes"].includes(tool)) return "runCommands";
  return null;
}

export function assertCloudToolAllowed(tool, access) {
  const permission = cloudToolPermission(tool);
  if (!permission) throw new Error("Unsupported Cloud desktop tool.");
  if (!access[permission]) {
    throw new Error(permission === "runCommands"
      ? "Cloud commands are off. Enable full computer command access in Desktop General settings."
      : `Cloud ${permission === "readFiles" ? "file reading" : "file editing"} is off in Desktop General settings.`);
  }
}
