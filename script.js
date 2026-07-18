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
1. 分析对标视频的脚本结构、镜头节奏、拍摄视角、口播/台词风格。
2. 先判断内容模式：单人口播、纯音乐走秀、双人对话、拍摄者采访模特、朋友视角互动、字幕驱动，或混合模式。
3. 如果是双人/多人互动，必须拆出每个角色：拍摄者/提问者、模特/回应者、旁白等；分别描述音色、语速、情绪、口吻、说话功能和互动关系。
4. 如果是手机拍摄者视角，必须拆出 POV：镜头是否代表拍摄者眼睛、模特是否看镜头、拍摄者是否在画外说话、互动动作如何触发产品展示。
5. 结合产品首帧图、产品类型和卖点，生成一个全新的英文 TikTok 女装视频脚本。
6. 输出 Grok 可直接使用的 JSON。

JSON 要求：
- 必须包含 product_type、first_frame_usage、selling_points、reference_video_breakdown、shot_sequence、voiceover、negative_prompt。
- reference_video_breakdown 必须包含 content_mode、camera_pov、speaker_profiles、interaction_beats、dialogue_pattern、shot_pacing、portable_formula。
- speaker_profiles 需要写明每个说话人的 role、voice_tone、pace、energy、speaking_function。
- shot_sequence 如果有双人对话，每个镜头必须标出 speaker 和 line；不要只写一整段 voiceover。

创作要求：
- 保留对标视频的爆款结构、互动机制和节奏，但不要照抄原台词。
- 台词用自然的美式英文。
- 如果视频里没有清晰台词，请根据画面节奏推断适合的英文口播；如果有双人互动，要生成双人自然对话。
- 不要生成无法证明的夸张身材、医疗、永久效果或保证性承诺。`;
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
