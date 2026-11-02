<p align="center">
  <img src="src/icons/icon128.png" alt="Zuri logo" width="80" height="80">
</p>
<h1 align="center">Zuri</h1>

Zuri 是一个运行在 Chrome 扩展里的开源浏览器 Agent。用一句话描述任务，它会在你已登录的网站中操作、提取数据，并返回表格、文件或带出处的报告。它使用你选择的模型服务商和你自己的 API Key。任务数据保存在浏览器中，只发送给该服务商。

## 安装

安装 Node.js 24 LTS 和 npm，然后在仓库根目录构建扩展：

```bash
npm ci
npm run build
```

1. 打开 `chrome://extensions`，启用**开发者模式**。
2. 点击**加载已解压的扩展程序**，选择 `dist/extension/`。
3. 点击工具栏中的 Zuri 图标，打开侧边栏。
4. 打开**设置**，选择模型服务商，填入 API Key 并保存。

修改源码后，再次运行 `npm run build`，并在 `chrome://extensions` 中重新加载扩展。

## 改动

**聊天与输入框**

- 悬浮球启动器，可在设置中开关。
- `@tab` 提及，默认共享当前标签页。共享的标签页、选取的页面元素（带缩略图）和 Skill 以标签形式显示在输入框中。粘贴的图片显示在输入框上方。
- 斜杠菜单按组显示并带图标，支持 `/new` 和 `/clear`，Skill 置顶。加号菜单可单独选择 Skill，并进入 Skills、Data 和 History。
- 输入框内的模型菜单，列出所有服务商的模型，带厂商图标和易读的模型名。
- 上下文用量环，点击可查看上下文构成和每次请求的缓存命中率。
- 落地页的页面相关建议，以及每次回复后的追问建议，均使用界面语言。
- 数据表可从产物卡片在聊天上方的面板中打开。空白对话不再出现在历史记录中。
- 反色提示气泡和渐变聊天背景。

**服务商与上下文**

- Claude Pro/Max 登录服务商，支持账号模型发现。
- Anthropic 提示缓存、批量图片裁剪以稳定提示前缀，以及 `cache_usage` 跟踪。
- 被取代的页面观察结果会立即替换。

**Skill**

- 内置 `find-skills`、`task-retrospective` 和 `site-memory` Skill。`site-memory` 通过 `skill-workbench` 记录并修正各站点的笔记。

## 许可证

Apache-2.0，见 [LICENSE](LICENSE)。

派生自 [alibaba/qz-browser-agent](https://github.com/alibaba/qz-browser-agent)。
