import fs from "node:fs";
import path from "node:path";

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "camera";
}

export function toStoredPath(absolutePath: string): string {
  return path.relative(process.cwd(), absolutePath).replace(/\\/g, "/");
}

export function resolveStoredPath(storedPath: string): string {
  return path.isAbsolute(storedPath)
    ? storedPath
    : path.resolve(process.cwd(), storedPath);
}

export function assertInside(targetPath: string, rootPath: string): void {
  const relative = path.relative(rootPath, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Caminho fora da pasta permitida.");
  }
}

export function localDateFolder(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function localTimeFile(date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}-${mm}-${ss}`;
}

export function localDateTime(date = new Date()): string {
  return `${localDateFolder(date)}T${localTimeFile(date).replaceAll("-", ":")}`;
}
