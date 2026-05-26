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
  sourceLabel: document.querySelector("#sourceLabel"),
  sourceText: document.querySelector("#sourceText"),
  requirementText: document.querySelector("#requirementText"),
  redditDirectionField: document.querySelector("#redditDirectionField"),
  redditDirectionText: document.querySelector("#redditDirectionText"),
  loadRedditButton: document.querySelector("#loadRedditButton"),
  translateButton: document.querySelector("#translateButton"),
  copyButton: document.querySelector("#copyButton"),
  clearButton: document.querySelector("#clearButton"),
  resultLabel: document.querySelector("#resultLabel"),
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
  syncModeUi();
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
    input.addEventListener("change", syncModeUi);
  });

  elements.translateButton.addEventListener("click", translate);
  elements.loadRedditButton.addEventListener("click", loadCurrentRedditPost);
  elements.copyButton.addEventListener("click", copyResult);
  elements.clearButton.addEventListener("click", clearAll);
  elements.resetStatsButton.addEventListener("click", resetStats);
}

async function translate() {
  const text = elements.sourceText.value.trim();
  const requirement = elements.requirementText.value.trim();
  const redditDirection = elements.redditDirectionText.value.trim();
  const mode = getMode();

  if (!text) {
    setStatus("请输入要翻译的文本。", "error");
    return;
  }

  if (mode === "prompt" && !requirement) {
    setStatus("提示模式需要填写要求。", "error");
    return;
  }

  if (mode === "reddit" && !text) {
    setStatus("请先读取或粘贴 Reddit 帖子信息。", "error");
    return;
  }

  setBusy(true);
  setStatus(getWorkingStatus(mode));

  try {
    const output = await requestTranslation({ text, requirement, redditDirection, mode });
    elements.resultText.value = output;
    setStatus(getDoneStatus(mode), "success");
  } catch (error) {
    setStatus(toUserMessage(error), "error");
  } finally {
    setBusy(false);
  }
}

async function requestTranslation({ text, requirement, redditDirection, mode }) {
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
      messages: buildMessages({ text, requirement, redditDirection, mode })
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

function buildMessages({ text, requirement, redditDirection, mode }) {
  if (mode === "understand") {
    return buildUnderstandMessages(text);
  }

  if (mode === "reddit") {
    return buildRedditMessages({ postContext: text, direction: redditDirection });
  }

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

function buildUnderstandMessages(text) {
  return [
    { role: "user", content: text }
  ];
}

function buildRedditMessages({ postContext, direction }) {
  const system = [
    "You help draft Reddit comments in natural English.",
    "Write like a real Reddit user participating in the thread, not like an assistant, marketer, or translator.",
    "Default to English.",
    "Match the subreddit topic, title, post body, and emotional tone.",
    "If the user provides a reply direction, follow it closely; if not, choose a fitting angle yourself.",
    "Keep the comment specific to the post, conversational, and concise.",
    "Avoid generic praise, hashtags, corporate phrasing, and disclaimers.",
    "Do not mention AI, prompts, translation, or that you are generating a reply.",
    "Return only the final Reddit comment."
  ].join(" ");

  const user = [
    `Reddit post context:\n${postContext}`,
    `Reply direction from user:\n${direction || "No extra direction provided. Pick a natural, on-topic reply angle."}`
  ].join("\n\n");

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

function syncModeUi() {
  const mode = getMode();
  const isUnderstandMode = mode === "understand";
  const isRedditMode = mode === "reddit";

  elements.requirementField.hidden = mode !== "prompt";
  elements.redditDirectionField.hidden = !isRedditMode;
  elements.loadRedditButton.hidden = !isRedditMode;
  elements.sourceLabel.textContent = getSourceLabel(mode);
  elements.resultLabel.textContent = isRedditMode ? "回帖草稿" : isUnderstandMode ? "生成结果" : "翻译结果";
  elements.sourceText.placeholder = getSourcePlaceholder(mode);
  elements.resultText.placeholder = isRedditMode ? "英文回帖草稿会保留在这里" : isUnderstandMode ? "生成结果会保留在这里" : "结果会保留在这里";
  elements.translateButton.textContent = getActionLabel(mode);
}

function getSourceLabel(mode) {
  if (mode === "reddit") {
    return "Reddit 帖子信息";
  }

  if (mode === "understand") {
    return "输入";
  }

  return "待翻译文本";
}

function getSourcePlaceholder(mode) {
  if (mode === "reddit") {
    return "点击读取当前帖子，或手动粘贴 Reddit 标题和正文";
  }

  if (mode === "understand") {
    return "写下你的大概意思、场景或要 Gemini 帮你完成的事";
  }

  return "粘贴或输入要翻译的内容";
}

function getActionLabel(mode) {
  if (mode === "reddit") {
    return "生成回帖";
  }

  if (mode === "understand") {
    return "生成";
  }

  return "翻译";
}

function getWorkingStatus(mode) {
  if (mode === "reddit") {
    return "正在生成回帖...";
  }

  return mode === "understand" ? "正在生成..." : "正在翻译...";
}

function getDoneStatus(mode) {
  if (mode === "reddit") {
    return "回帖已生成。";
  }

  return mode === "understand" ? "生成完成。" : "翻译完成。";
}

async function loadCurrentRedditPost() {
  try {
    setStatus("正在读取当前 Reddit 帖子...");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      throw new Error("NO_ACTIVE_TAB");
    }

    if (!/https?:\/\/([^/]+\.)?reddit\.com\//i.test(tab.url || "")) {
      throw new Error("NOT_REDDIT_PAGE");
    }

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractRedditPostFromPage
    });

    if (!injection?.result?.title && !injection?.result?.body) {
      throw new Error("NO_REDDIT_POST");
    }

    elements.sourceText.value = formatRedditPostContext(injection.result);
    setStatus("已读取当前 Reddit 帖子。", "success");
  } catch (error) {
    setStatus(toRedditReadMessage(error), "error");
  }
}

function extractRedditPostFromPage() {
  const textOf = (selectors) => {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const text = element?.innerText?.trim() || element?.textContent?.trim();
      if (text) {
        return text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
      }
    }
    return "";
  };

  const meta = (name) => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content?.trim() || "";
  const post = document.querySelector("shreddit-post");

  return {
    title: post?.getAttribute("post-title") || textOf(["h1", "shreddit-title", ".title a.title"]) || meta("og:title"),
    body: textOf([
      "shreddit-post [slot='text-body']",
      "shreddit-post div[slot='text-body']",
      "[data-post-click-location='text-body']",
      "[data-testid='post-content']",
      ".usertext-body .md"
    ]) || meta("og:description")
  };
}

function formatRedditPostContext(post) {
  return [
    post.title ? `Title: ${post.title}` : "",
    post.body ? `Post:\n${post.body}` : ""
  ].filter(Boolean).join("\n\n");
}

function toRedditReadMessage(error) {
  if (error.message === "NOT_REDDIT_PAGE") {
    return "当前标签页不是 Reddit 帖子页面。";
  }

  if (error.message === "NO_REDDIT_POST") {
    return "没有读取到 Reddit 帖子标题或正文，可以手动粘贴。";
  }

  if (error.message === "NO_ACTIVE_TAB") {
    return "没有找到当前标签页。";
  }

  return "读取 Reddit 帖子失败，可以手动粘贴标题和正文。";
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
  elements.redditDirectionText.value = "";
  elements.resultText.value = "";
  setStatus("");
}

function setBusy(isBusy) {
  elements.translateButton.disabled = isBusy;
  if (isBusy) {
    const mode = getMode();
    elements.translateButton.textContent = mode === "reddit" ? "生成中..." : mode === "understand" ? "生成中..." : "翻译中...";
    return;
  }

  syncModeUi();
}

function setStatus(message, type = "") {
  elements.statusText.textContent = message;
  elements.statusText.className = `status ${type}`.trim();
}
