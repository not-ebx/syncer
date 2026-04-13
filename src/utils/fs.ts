import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Recursively create directories */
export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/** Copy a directory recursively */
export function copyDir(src: string, dest: string): void {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** Remove a directory recursively */
export function removeDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/** Compute SHA-256 of a file */
export function fileSha256(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

/** Compute SHA-256 of a directory (sorted recursive) */
export function dirSha256(dirPath: string): string {
  const hash = crypto.createHash("sha256");
  const files = collectFiles(dirPath).sort();
  for (const f of files) {
    hash.update(path.relative(dirPath, f));
    hash.update(fs.readFileSync(f));
  }
  return hash.digest("hex");
}

function collectFiles(dirPath: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

/** Ensure a line exists in .gitignore. Creates the file if missing. */
export function ensureGitignore(projectRoot: string, line: string): void {
  const giPath = path.join(projectRoot, ".gitignore");
  if (fs.existsSync(giPath)) {
    const content = fs.readFileSync(giPath, "utf8");
    const lines = content.split("\n");
    if (lines.some((l) => l.trim() === line)) return;
    const newContent = content.endsWith("\n")
      ? `${content}${line}\n`
      : `${content}\n${line}\n`;
    fs.writeFileSync(giPath, newContent, "utf8");
  } else {
    fs.writeFileSync(giPath, `${line}\n`, "utf8");
  }
}

/** Compute a filesystem-safe key from a URL */
export function urlToKey(url: string): string {
  return Buffer.from(url).toString("base64url").replace(/[^a-zA-Z0-9_-]/g, "_");
}
