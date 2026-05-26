# OpenRouter Side Translator

一个 Manifest V3 Chrome 扩展，在 side panel 中使用 OpenRouter 的 `google/gemini-2.5-flash-lite` 模型做翻译。

## 功能

- 直接翻译：中文翻译成英文，非中文翻译成简体中文。
- 提示模式：文本和要求分开输入，要求优先于默认翻译规则。
- 结果保留在 side panel，不会因为切换页面轻易丢失。
- 在设置中填写或更换 OpenRouter API Key。
- 统计累计输入 token、输出 token、总 token 和按公开单价估算的费用。
- 当 OpenRouter 返回 402 或余额相关错误时，会提示余额不足。

## 安装

1. 打开 Chrome 的 `chrome://extensions/`。
2. 开启「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择当前仓库所在目录。
5. 点击扩展图标打开 side panel。

## 安全说明

浏览器扩展中的 API Key 会暴露在前端运行环境里。当前仓库不包含真实 API Key；如需更高安全性，应改成服务端代理调用 OpenRouter。
