import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readText = (path) => readFile(new URL(path, root), "utf8");

const html = await readText("sidepanel.html");
const css = await readText("sidepanel.css");
const js = await readText("sidepanel.js");
const readme = await readText("README.md");
const manifest = await readText("manifest.json");

assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/i, "hidden elements must stay hidden even when component classes set display");

for (const id of [
  "statsInputTokens",
  "statsOutputTokens",
  "statsTotalTokens",
  "statsTotalCost",
  "resetStatsButton"
]) {
  assert.match(html, new RegExp(`id="${id}"`), `missing statistics element: ${id}`);
}

assert.match(html, /value="understand"/, "missing understand mode option");
assert.match(html, />理解模式</, "missing understand mode label");
assert.match(js, /function buildUnderstandMessages\(\s*text\s*\)/, "missing dedicated understand mode message builder");
assert.match(js, /buildUnderstandMessages\(text\)/, "understand mode must use its dedicated message builder");

const understandBuilder = js.slice(
  js.indexOf("function buildUnderstandMessages"),
  js.indexOf("function buildRedditMessages")
);
assert.doesNotMatch(understandBuilder, /role:\s*"system"/, "understand mode must not send a system prompt");

assert.match(html, /value="reddit"/, "missing Reddit mode option");
assert.match(html, />Reddit</, "missing Reddit mode label");
assert.match(html, /id="loadRedditButton"/, "missing Reddit load button");
assert.match(html, /id="redditDirectionField"/, "missing Reddit direction field");
assert.match(js, /function buildRedditMessages\(\s*\{ postContext,\s*direction \}\s*\)/, "missing Reddit message builder");
assert.match(js, /role:\s*"system"[\s\S]*Reddit/i, "Reddit mode must use a dedicated system prompt");
assert.match(js, /chrome\.scripting\.executeScript/, "Reddit mode must read the active tab through scripting");
assert.match(manifest, /"scripting"/, "manifest must allow current-tab extraction");
assert.match(manifest, /"activeTab"/, "manifest must allow current-tab extraction after user action");

const redditExtractor = js.slice(
  js.indexOf("function extractRedditPostFromPage"),
  js.indexOf("function formatRedditPostContext")
);
const redditFormatter = js.slice(
  js.indexOf("function formatRedditPostContext"),
  js.indexOf("function toRedditReadMessage")
);
for (const field of ["subreddit", "author", "flair", "url"]) {
  assert.doesNotMatch(redditExtractor, new RegExp(`\\b${field}\\b`, "i"), `Reddit extractor must not collect ${field}`);
}
for (const label of ["Subreddit:", "Author:", "Flair:", "URL:"]) {
  assert.doesNotMatch(redditFormatter, new RegExp(label, "i"), `Reddit context must not include ${label}`);
}

assert.match(js, /INPUT_PRICE_PER_MILLION\s*=\s*0\.10/, "missing Gemini 2.5 Flash Lite input token price");
assert.match(js, /OUTPUT_PRICE_PER_MILLION\s*=\s*0\.40/, "missing Gemini 2.5 Flash Lite output token price");
assert.match(js, /updateUsageStats/, "missing usage statistics update flow");

const openRouterKeyPattern = new RegExp(`${["sk", "or", "v1"].join("-")}-[A-Za-z0-9]+`);
for (const [name, content] of Object.entries({ "sidepanel.js": js, "README.md": readme })) {
  assert.doesNotMatch(content, openRouterKeyPattern, `${name} must not contain a real OpenRouter API key`);
}

const unixUserDir = "\\/" + "Users" + "\\/[^`\\s)]+";
const unixHomeDir = "\\/" + "home" + "\\/[^`\\s)]+";
const windowsUserDir = "[A-Z]:\\\\" + "Users" + "\\\\[^`\\s)]+";
const localPathPattern = new RegExp(`${unixUserDir}|${unixHomeDir}|${windowsUserDir}`);
for (const [name, content] of Object.entries({
  "README.md": readme,
  "sidepanel.html": html,
  "sidepanel.css": css,
  "sidepanel.js": js
})) {
  assert.doesNotMatch(content, localPathPattern, `${name} must not contain a local machine path`);
}

console.log("static checks passed");
