import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const videoExtensions = new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"]);

async function resolveJobId() {
  const requested = process.argv[2];
  if (requested) return requested;

  const latestPath = path.join(__dirname, "jobs", "latest.txt");
  if (!existsSync(latestPath)) {
    throw new Error("No job id provided and jobs/latest.txt does not exist.");
  }

  return (await readFile(latestPath, "utf8")).trim();
}

function assertInsideWorkspace(targetPath) {
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(__dirname)) {
    throw new Error(`Refusing to touch a path outside the workspace: ${resolved}`);
  }
  return resolved;
}

async function main() {
  const jobId = await resolveJobId();
  const jobDir = assertInsideWorkspace(path.join(__dirname, "jobs", jobId));
  const metadataPath = path.join(jobDir, "metadata.json");

  if (!existsSync(jobDir)) {
    throw new Error(`Job directory not found: jobs/${jobId}`);
  }

  if (!existsSync(metadataPath)) {
    throw new Error(`metadata.json not found for jobs/${jobId}`);
  }

  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const deletedFiles = [];

  const entries = await readdir(jobDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!videoExtensions.has(ext)) continue;

    const target = assertInsideWorkspace(path.join(jobDir, entry.name));
    await rm(target, { force: true });
    deletedFiles.push(entry.name);
  }

  metadata.mediaCleanup = {
    cleanedAt: new Date().toISOString(),
    deletedFiles,
    note: "Reference video files are temporary and are removed after analysis. Metadata, first-frame image, prompt, and output records are kept.",
  };

  if (metadata.files?.referenceVideo) {
    metadata.files.referenceVideoAvailable = false;
  }

  await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

  console.log(JSON.stringify({ jobId, deletedFiles }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
