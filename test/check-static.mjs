import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readText = (path) => readFile(new URL(path, root), "utf8");

const html = await readText("sidepanel.html");
const css = await readText("sidepanel.css");
const js = await readText("sidepanel.js");
const readme = await readText("README.md");

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
