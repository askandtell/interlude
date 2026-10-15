# 参与开发

欢迎提交问题、文档修改和 Pull Request。涉及新功能或较大的界面调整，可以先开 Issue 讨论使用场景。

## 本机开发

需要 Node.js 24+。按[入门指南](docs/GETTING_STARTED.md)安装依赖、初始化本机配置，再分别运行 `npm run dev` 和 `npm run ui`。

常用目录：

| 目录 | 内容 |
| --- | --- |
| `src/` | React 页面、组件、媒体连接和本地文件处理 |
| `server/` | 房间、权限、Socket.IO、Redis 和 LiveKit 凭证 |
| `shared/` | 前后端共用的协议与校验 |
| `extensions/watch-sync/` | 实验性视频网站同步扩展 |
| `tests/` | 服务测试和 Playwright 浏览器测试 |

## 提交修改

尽量让一个 PR 解决一个问题，在描述中说明原来的行为、修改后的行为和测试方式。界面修改请附截图，修复问题时尽量附上复现步骤或回归测试。

提交前运行：

```sh
npm run format:check
npm run check
npx playwright install chromium
npm run test:e2e
```

媒体相关测试需要额外准备 FFmpeg、测试片和 LiveKit，详见[测试说明](docs/TEST_REPORT.md)。没有运行的检查请在 PR 中注明。

`.env`、本地媒体配置和测试输出应留在忽略目录中。截图与日志请隐藏邀请链接、Cookie、密钥和私人聊天。`npm run security:secrets` 可检查常见误提交，但提交前仍应查看自己的 diff。

## 报告问题

请说明浏览器与系统版本、使用直连还是转发、复现步骤，以及预期和实际结果。音画问题还可以注明文件编码、分辨率和是否包含音轨，无需上传私人视频。

涉及密钥泄露或可利用的安全问题，请先通过仓库维护者公开的联系方式私下联系，不要在公开 Issue 中附上敏感信息。安全设计见[安全说明](docs/SECURITY.md)。
