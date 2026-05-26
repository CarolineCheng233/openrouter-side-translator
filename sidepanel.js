const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-lite";
const STORAGE_KEY = "openrouterApiKey";
const STATS_KEY = "translationUsageStats";
const INPUT_PRICE_PER_MILLION = 0.10;
const OUTPUT_PRICE_PER_MILLION = 0.40;
const EMPTY_STATS = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  totalCost: 0
};

const elements = {
  settingsToggle: document.querySelector("#settingsToggle"),
  settingsPanel: document.querySelector("#settingsPanel"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  saveKeyButton: document.querySelector("#saveKeyButton"),
  resetKeyButton: document.querySelector("#resetKeyButton"),
  modeInputs: [...document.querySelectorAll("input[name='mode']")],
  requirementField: document.querySelector("#requirementField"),
  sourceText: document.querySelector("#sourceText"),
  requirementText: document.querySelector("#requirementText"),
  translateButton: document.querySelector("#translateButton"),
  copyButton: document.querySelector("#copyButton"),
  clearButton: document.querySelector("#clearButton"),
  resultText: document.querySelector("#resultText"),
  statusText: document.querySelector("#statusText"),
  statsInputTokens: document.querySelector("#statsInputTokens"),
  statsOutputTokens: document.querySelector("#statsOutputTokens"),
  statsTotalTokens: document.querySelector("#statsTotalTokens"),
  statsTotalCost: document.querySelector("#statsTotalCost"),
  resetStatsButton: document.querySelector("#resetStatsButton")
};

init();

async function init() {
  elements.apiKeyInput.value = await getApiKey();
  renderStats(await getStats());
  bindEvents();
}

function bindEvents() {
  elements.settingsToggle.addEventListener("click", () => {
    elements.settingsPanel.hidden = !elements.settingsPanel.hidden;
  });

  elements.saveKeyButton.addEventListener("click", async () => {
    const key = elements.apiKeyInput.value.trim();
    if (!key) {
      setStatus("请输入 API Key。", "error");
      return;
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: key });
    setStatus("API Key 已保存。", "success");
  });

  elements.resetKeyButton.addEventListener("click", async () => {
    await chrome.storage.local.remove(STORAGE_KEY);
    elements.apiKeyInput.value = "";
    setStatus("API Key 已清除。", "success");
  });

  elements.modeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      elements.requirementField.hidden = getMode() !== "prompt";
    });
  });

  elements.translateButton.addEventListener("click", translate);
  elements.copyButton.addEventListener("click", copyResult);
  elements.clearButton.addEventListener("click", clearAll);
  elements.resetStatsButton.addEventListener("click", resetStats);
}

async function translate() {
  const text = elements.sourceText.value.trim();
  const requirement = elements.requirementText.value.trim();
  const mode = getMode();

  if (!text) {
    setStatus("请输入要翻译的文本。", "error");
    return;
  }

  if (mode === "prompt" && !requirement) {
    setStatus("提示模式需要填写要求。", "error");
    return;
  }

  setBusy(true);
  setStatus("正在翻译...");

  try {
    const translation = await requestTranslation({ text, requirement, mode });
    elements.resultText.value = translation;
    setStatus("翻译完成。", "success");
  } catch (error) {
    setStatus(toUserMessage(error), "error");
  } finally {
    setBusy(false);
  }
}

async function requestTranslation({ text, requirement, mode }) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("MISSING_API_KEY");
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "chrome-extension://side-translator",
      "X-Title": "OpenRouter Side Translator"
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: buildMessages({ text, requirement, mode })
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw buildApiError(response.status, data?.error?.message);
  }

  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("EMPTY_RESPONSE");
  }

  await updateUsageStats(data.usage);
  return content;
}

function buildMessages({ text, requirement, mode }) {
  const system = [
    "You are a professional translation engine.",
    "Return only the final translated text, with no explanations, labels, markdown fences, or extra notes.",
    "Preserve the source structure, paragraph breaks, lists, punctuation intent, placeholders, URLs, variables, and code blocks where possible.",
    "Default rule: if the source text is Chinese, translate it into idiomatic English; otherwise translate it into natural Simplified Chinese.",
    "In prompt mode, the user's requirement has the highest priority. If it explicitly asks for a target language or another transformation, follow it over the default rule.",
    "Keep names, brands, commands, file paths, and technical identifiers unchanged unless the user requirement clearly asks otherwise."
  ].join(" ");

  const user = mode === "prompt"
    ? `Requirement:\n${requirement}\n\nSource text:\n${text}`
    : `Source text:\n${text}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

function buildApiError(status, message = "") {
  const error = new Error(message || `HTTP_${status}`);
  error.status = status;
  return error;
}

function toUserMessage(error) {
  const message = String(error.message || "");
  const normalized = message.toLowerCase();

  if (error.status === 402 || normalized.includes("insufficient") || normalized.includes("credit")) {
    return "OpenRouter 余额不足或 API Key 没有可用额度，请充值后重试，或在设置里更换 API Key。";
  }

  if (error.status === 401) {
    return "API Key 无效或已被禁用，请在设置里更换。";
  }

  if (error.status === 429) {
    return "请求过于频繁，请稍后再试。";
  }

  if (error.status >= 500) {
    return "OpenRouter 或模型供应商暂时不可用，请稍后再试。";
  }

  if (error.message === "EMPTY_RESPONSE") {
    return "模型没有返回可用内容，请换一种输入后重试。";
  }

  if (error.message === "MISSING_API_KEY") {
    return "请先在设置里填写 OpenRouter API Key。";
  }

  return message || "翻译失败，请检查网络、API Key 或输入内容。";
}

function getMode() {
  return elements.modeInputs.find((input) => input.checked)?.value || "direct";
}

async function getApiKey() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY] || "";
}

async function getStats() {
  const stored = await chrome.storage.local.get(STATS_KEY);
  return normalizeStats(stored[STATS_KEY]);
}

async function updateUsageStats(usage) {
  const inputTokens = Number(usage?.prompt_tokens) || 0;
  const outputTokens = Number(usage?.completion_tokens) || 0;
  const totalTokens = Number(usage?.total_tokens) || inputTokens + outputTokens;

  if (!inputTokens && !outputTokens && !totalTokens) {
    return;
  }

  const current = await getStats();
  const next = normalizeStats({
    inputTokens: current.inputTokens + inputTokens,
    outputTokens: current.outputTokens + outputTokens,
    totalTokens: current.totalTokens + totalTokens,
    totalCost: current.totalCost + calculateCost(inputTokens, outputTokens)
  });

  await chrome.storage.local.set({ [STATS_KEY]: next });
  renderStats(next);
}

function normalizeStats(stats) {
  return {
    inputTokens: Number(stats?.inputTokens) || EMPTY_STATS.inputTokens,
    outputTokens: Number(stats?.outputTokens) || EMPTY_STATS.outputTokens,
    totalTokens: Number(stats?.totalTokens) || EMPTY_STATS.totalTokens,
    totalCost: Number(stats?.totalCost) || EMPTY_STATS.totalCost
  };
}

function calculateCost(inputTokens, outputTokens) {
  return (inputTokens / 1_000_000) * INPUT_PRICE_PER_MILLION
    + (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_MILLION;
}

function renderStats(stats) {
  elements.statsInputTokens.textContent = formatInteger(stats.inputTokens);
  elements.statsOutputTokens.textContent = formatInteger(stats.outputTokens);
  elements.statsTotalTokens.textContent = formatInteger(stats.totalTokens);
  elements.statsTotalCost.textContent = `$${stats.totalCost.toFixed(6)}`;
}

async function resetStats() {
  await chrome.storage.local.set({ [STATS_KEY]: EMPTY_STATS });
  renderStats(EMPTY_STATS);
  setStatus("统计已重置。", "success");
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

async function copyResult() {
  const result = elements.resultText.value.trim();
  if (!result) {
    setStatus("没有可复制的结果。", "error");
    return;
  }

  await navigator.clipboard.writeText(result);
  setStatus("结果已复制。", "success");
}

function clearAll() {
  elements.sourceText.value = "";
  elements.requirementText.value = "";
  elements.resultText.value = "";
  setStatus("");
}

function setBusy(isBusy) {
  elements.translateButton.disabled = isBusy;
  elements.translateButton.textContent = isBusy ? "翻译中..." : "翻译";
}

function setStatus(message, type = "") {
  elements.statusText.textContent = message;
  elements.statusText.className = `status ${type}`.trim();
}
