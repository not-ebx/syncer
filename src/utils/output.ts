import chalk from "chalk";
import ora, { type Ora } from "ora";

export const log = {
  info: (msg: string) => console.log(chalk.cyan("ℹ"), msg),
  success: (msg: string) => console.log(chalk.green("✔"), msg),
  warn: (msg: string) => console.log(chalk.yellow("⚠"), msg),
  error: (msg: string) => console.error(chalk.red("✖"), msg),
  dim: (msg: string) => console.log(chalk.dim(msg)),
  blank: () => console.log(),
};

export function spinner(text: string): Ora {
  return ora({ text, color: "cyan" }).start();
}

export function formatList(
  items: string[],
  prefix = "  •"
): string {
  return items.map((i) => `${chalk.dim(prefix)} ${i}`).join("\n");
}

export function die(message: string, exitCode = 1): never {
  log.error(message);
  process.exit(exitCode);
}
