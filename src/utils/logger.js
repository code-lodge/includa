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

    if (level === "error") console.log(chalk.red(`✖ ${message}`))
    else if (level === "warn") console.log(chalk.yellow(`▲ ${message}`))
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
