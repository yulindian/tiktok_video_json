const form = document.querySelector("#generator-form");
const tiktokUrlInput = document.querySelector("#tiktok-url");
const referenceVideoInput = document.querySelector("#reference-video");
const productTypeSelect = document.querySelector("#product-type");
const customTypeWrap = document.querySelector("#custom-type-wrap");
const customTypeInput = document.querySelector("#custom-type");
const firstFrameInput = document.querySelector("#first-frame");
const imagePreview = document.querySelector("#image-preview");
const sellingPointsInput = document.querySelector("#selling-points");
const durationSelect = document.querySelector("#duration");
const jobResult = document.querySelector("#job-result");
const promptOutput = document.querySelector("#json-output");
const copyButton = document.querySelector("#copy-json");
const toast = document.querySelector("#toast");

let latestPrompt = "";

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function normalizeProductType() {
  if (productTypeSelect.value === "Other") {
    return customTypeInput.value.trim();
  }
  return productTypeSelect.value;
}

function hasReferenceSource() {
  return Boolean(tiktokUrlInput.value.trim() || referenceVideoInput.files?.[0]);
}

function buildClientPrompt(jobId) {
  const productType = normalizeProductType();
  const sellingPoints = sellingPointsInput.value.trim() || "未填写，请根据产品类型和首帧图辅助识别。";
  const url = tiktokUrlInput.value.trim() || "未提供";
  const duration = durationSelect.value;
  const sourceMode = referenceVideoInput.files?.[0] ? "uploaded_video" : "tiktok_link";

  return `执行任务 ${jobId}

请读取当前工作区 jobs/${jobId}/ 里的素材并完成解析。

输入信息：
- 对标来源模式：${sourceMode}
- TikTok 对标链接：${url}
- 产品类型：${productType}
- 产品卖点：${sellingPoints}
- 目标视频时长：${duration} 秒
- 对标视频文件：见该任务目录 metadata.json。如果为空，请根据 TikTok 链接尝试分析；如链接不可访问，请说明需要用户补充视频文件。
- 产品首帧图：见该任务目录 metadata.json

请你作为 TikTok 美国女装运营脚本分析师，完成：
1. 分析对标视频的脚本结构、镜头节奏和口播/台词风格。
2. 结合产品首帧图、产品类型和卖点，生成一个全新的英文 TikTok 女装视频脚本。
3. 输出 Grok 可直接使用的 JSON。

要求：
- 保留对标视频的爆款结构和节奏，但不要照抄原台词。
- 台词用自然的美式英文。
- JSON 必须包含 product_type、first_frame_usage、selling_points、reference_video_breakdown、shot_sequence、voiceover、negative_prompt。
- 如果视频里没有清晰台词，请根据画面节奏推断适合的英文口播。`;
}

function renderJobSuccess(job) {
  jobResult.className = "job-card success";
  jobResult.innerHTML = `
    <h3>已保存到 Codex 任务箱</h3>
    <p><strong>任务编号：</strong>${job.id}</p>
    <p><strong>保存目录：</strong>${job.relativePath}</p>
    <p><strong>对标来源：</strong>${job.sourceMode === "uploaded_video" ? "视频文件" : "TikTok 链接"}</p>
    <p>现在回到 Codex，发送：<code>执行</code> 或 <code>执行任务 ${job.id}</code>。</p>
  `;
}

async function saveJob() {
  const productType = normalizeProductType();
  const formData = new FormData();
  formData.append("tiktokUrl", tiktokUrlInput.value.trim());
  formData.append("productType", productType);
  formData.append("sellingPoints", sellingPointsInput.value.trim());
  formData.append("duration", durationSelect.value);

  if (referenceVideoInput.files?.[0]) {
    formData.append("referenceVideo", referenceVideoInput.files[0]);
  }

  formData.append("firstFrame", firstFrameInput.files[0]);

  const response = await fetch("/api/jobs", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "保存失败");
  }

  return response.json();
}

productTypeSelect.addEventListener("change", () => {
  const isOther = productTypeSelect.value === "Other";
  customTypeWrap.classList.toggle("hidden", !isOther);
  customTypeInput.required = isOther;
});

firstFrameInput.addEventListener("change", () => {
  const file = firstFrameInput.files?.[0];

  if (!file) {
    imagePreview.innerHTML = "<span>上传后这里会显示首帧图预览</span>";
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    imagePreview.innerHTML = `<img src="${reader.result}" alt="产品首帧图预览" />`;
  });
  reader.readAsDataURL(file);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const productType = normalizeProductType();

  if (!hasReferenceSource()) {
    showToast("请填写 TikTok 链接或上传对标视频");
    return;
  }

  if (!productType) {
    showToast("请先填写产品类型");
    return;
  }

  if (!firstFrameInput.files?.[0]) {
    showToast("请上传产品首帧图");
    return;
  }

  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "正在保存...";

  try {
    const job = await saveJob();
    latestPrompt = buildClientPrompt(job.id);
    promptOutput.textContent = latestPrompt;
    copyButton.disabled = false;
    renderJobSuccess(job);
    showToast("任务已保存，回到 Codex 说“执行”");
  } catch (error) {
    jobResult.className = "job-card error";
    jobResult.innerHTML = `
      <h3>保存失败</h3>
      <p>请确认你是通过本地服务地址打开页面，而不是直接打开 index.html。</p>
      <p>${error.message}</p>
    `;
    showToast("保存失败");
  } finally {
    button.disabled = false;
    button.textContent = "保存到 Codex 任务箱";
  }
});

copyButton.addEventListener("click", async () => {
  if (!latestPrompt) return;

  try {
    await navigator.clipboard.writeText(latestPrompt);
    showToast("已复制执行提示词");
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(promptOutput);
    selection.removeAllRanges();
    selection.addRange(range);
    showToast("已选中提示词，可手动复制");
  }
});
