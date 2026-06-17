import chalk from "chalk"

export function createLogger() {
  const logs = []
  const startedAt = new Date().toISOString()

  function push(level, message) {
    const entry = {
      level,
      message,
      at: new Date().toISOString()
    }
    logs.push(entry)

    // Use the matching console method so the level survives console capture
    // (see console-capture.js) and lands correctly in the in-app console.
    if (level === "error") console.error(chalk.red(`✖ ${message}`))
    else if (level === "warn") console.warn(chalk.yellow(`▲ ${message}`))
    else if (level === "success") console.log(chalk.green(`✔ ${message}`))
    else console.log(chalk.cyan(`• ${message}`))
  }

  return {
    startedAt,
    logs,
    info: (message) => push("info", message),
    warn: (message) => push("warn", message),
    error: (message) => push("error", message),
    success: (message) => push("success", message),
    progress: (label, current, total) => push("info", `${label} ${current}${Number.isFinite(total) ? `/${total}` : ""}`)
  }
}
