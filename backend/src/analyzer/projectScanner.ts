import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx"]);

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  "coverage",
  ".next",
  ".turbo",
  "out"
]);

export interface ProjectSourceFile {
  absolutePath: string;
  relativePath: string;
  content: string;
}

async function collectSourceFiles(
  currentDirectory: string
): Promise<string[]> {
  const entries = await readdir(currentDirectory, {
    withFileTypes: true
  });

  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(currentDirectory, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      const nestedFiles = await collectSourceFiles(entryPath);
      files.push(...nestedFiles);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name);

    if (SUPPORTED_EXTENSIONS.has(extension)) {
      files.push(entryPath);
    }
  }

  return files;
}

export async function scanProject(
  projectPath: string
): Promise<ProjectSourceFile[]> {
  const absoluteProjectPath = path.resolve(projectPath);

  const projectStats = await stat(absoluteProjectPath);

  if (!projectStats.isDirectory()) {
    throw new Error(
      `The supplied project path is not a directory: ${absoluteProjectPath}`
    );
  }

  const filePaths = await collectSourceFiles(absoluteProjectPath);

  return Promise.all(
    filePaths.map(async (absolutePath) => {
      const content = await readFile(absolutePath, "utf8");

      return {
        absolutePath,
        relativePath: path
          .relative(absoluteProjectPath, absolutePath)
          .replaceAll("\\", "/"),
        content
      };
    })
  );
}