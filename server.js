import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5178);
const maxUploadBytes = 300 * 1024 * 1024;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

function sanitizeFileName(name) {
  return path
    .basename(name || "upload.bin")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .slice(0, 120);
}

function createJobId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${suffix}`;
}

function collectRequest(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxUploadBytes) {
        reject(new Error("Upload is too large. The current test build supports up to 300MB."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    throw new Error("Missing multipart boundary.");
  }

  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const raw = buffer.toString("latin1");
  const sections = raw.split(boundary).slice(1, -1);
  const fields = {};
  const files = {};

  for (const section of sections) {
    const trimmed = section.replace(/^\r\n/, "");
    const headerEnd = trimmed.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const header = trimmed.slice(0, headerEnd);
    let body = trimmed.slice(headerEnd + 4);
    if (body.endsWith("\r\n")) body = body.slice(0, -2);

    const nameMatch = header.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;

    const filenameMatch = header.match(/filename="([^"]*)"/i);
    const contentTypeMatch = header.match(/Content-Type:\s*([^\r\n]+)/i);
    const fieldName = nameMatch[1];

    if (filenameMatch && filenameMatch[1]) {
      files[fieldName] = {
        filename: sanitizeFileName(filenameMatch[1]),
        contentType: contentTypeMatch?.[1] || "application/octet-stream",
        buffer: Buffer.from(body, "latin1"),
      };
    } else {
      fields[fieldName] = Buffer.from(body, "latin1").toString("utf8");
    }
  }

  return { fields, files };
}

function buildPrompt(jobId, metadata) {
  return `执行任务 ${jobId}

请读取当前工作区 jobs/${jobId}/ 里的素材并完成解析。

输入信息：
- 对标来源模式：${metadata.sourceMode}
- TikTok 对标链接：${metadata.tiktokUrl || "未提供"}
- 产品类型：${metadata.productType}
- 产品卖点：${metadata.sellingPoints || "未填写，请根据产品类型和首帧图辅助识别。"}
- 目标视频时长：${metadata.duration} 秒
- 对标视频文件：${metadata.files.referenceVideo || "未上传"}
- 产品首帧图：${metadata.files.firstFrame}

请完成：
1. 分析对标视频的脚本结构、镜头节奏和口播/台词风格。
2. 结合产品首帧图、产品类型和卖点，生成一个全新的英文 TikTok 女装视频脚本。
3. 输出 Grok 可直接使用的 JSON。

要求：
- 如果有对标视频文件，优先分析视频文件；如果没有视频文件，请尝试根据 TikTok 链接分析。
- 保留对标视频的爆款结构和节奏，但不要照抄原台词。
- 台词用自然的美式英文。
- JSON 必须包含 product_type、first_frame_usage、selling_points、reference_video_breakdown、shot_sequence、voiceover、negative_prompt。
- 如果视频里没有清晰台词，请根据画面节奏推断适合的英文口播。`;
}

async function handleCreateJob(req, res) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    res.writeHead(400);
    res.end("Request must be multipart/form-data.");
    return;
  }

  const buffer = await collectRequest(req);
  const { fields, files } = parseMultipart(buffer, contentType);
  const hasTiktokUrl = Boolean((fields.tiktokUrl || "").trim());
  const hasReferenceVideo = Boolean(files.referenceVideo);

  if (!fields.productType) throw new Error("缺少产品类型。");
  if (!hasTiktokUrl && !hasReferenceVideo) throw new Error("请提供 TikTok 链接或上传对标视频文件。");
  if (!files.firstFrame) throw new Error("缺少产品首帧图。");

  const jobId = createJobId();
  const jobsRoot = path.join(__dirname, "jobs");
  const jobDir = path.join(jobsRoot, jobId);
  await mkdir(jobDir, { recursive: true });

  let referenceName = "";
  if (hasReferenceVideo) {
    referenceName = `reference-video-${files.referenceVideo.filename}`;
    await writeFile(path.join(jobDir, referenceName), files.referenceVideo.buffer);
  }

  const frameName = `first-frame-${files.firstFrame.filename}`;
  await writeFile(path.join(jobDir, frameName), files.firstFrame.buffer);

  const metadata = {
    id: jobId,
    createdAt: new Date().toISOString(),
    sourceMode: hasReferenceVideo ? "uploaded_video" : "tiktok_link",
    tiktokUrl: fields.tiktokUrl || "",
    productType: fields.productType,
    sellingPoints: fields.sellingPoints || "",
    duration: fields.duration || "10",
    files: {
      referenceVideo: referenceName,
      firstFrame: frameName,
    },
  };

  await writeFile(path.join(jobDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf8");
  await writeFile(path.join(jobDir, "codex-prompt.md"), buildPrompt(jobId, metadata), "utf8");
  await writeFile(path.join(jobsRoot, "latest.txt"), jobId, "utf8");

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ id: jobId, relativePath: `jobs/${jobId}`, sourceMode: metadata.sourceMode }));
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(__dirname, requestedPath));

  if (!filePath.startsWith(__dirname) || !existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  res.end(await readFile(filePath));
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/jobs") {
      await handleCreateJob(req, res);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    res.writeHead(405);
    res.end("Method not allowed");
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error.message || "Server error");
  }
});

server.listen(port, () => {
  console.log(`TikTok Codex parser intake is running at http://localhost:${port}`);
});
