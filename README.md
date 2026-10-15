# 幕间 · Interlude

和朋友一起看本地视频。房主选片，朋友通过邀请加入，边看边聊天。

[在线体验](https://interlude-eoqk.onrender.com) · [使用指南](docs/GETTING_STARTED.md) · [自行部署](docs/FREE_HOSTING.md) · [English](README.en.md)

![放映室](docs/design/implemented-room.png)

## 能做什么

- 最多 8 人，昵称加入，房主批准后才能观看。
- 房主控制播放、暂停和跳转，朋友可以发送暂停请求。
- 文字聊天、语音聊天，电影和语音分别调节音量。
- 本地 SRT/VTT 字幕，支持字号和时间偏移。
- 3 人以内优先直连，直连失败或人数增加时使用 LiveKit 转发。
- 电脑浏览器放映，观看界面适配窄屏；支持自行部署。

原视频文件不会上传保存。房主需要保持页面打开，刷新后要重新选择文件。放映端请使用桌面 Chrome 或 Edge。

## 开始观看

1. 打开体验站，创建房间并选择视频。
2. 点击“邀请朋友”，发送复制出来的完整链接。
3. 收到申请时点击“查看申请”，批准朋友入座。
4. 房主开始放映，朋友点击“开始观看”。麦克风默认关闭。

朋友不需要注册 GitHub 或云服务账号。邀请轮换后，旧链接会失效。

体验站使用免费托管，闲置后首次打开可能需要等待约一分钟，也可能因额度耗尽暂停。需要长期使用时，建议[部署自己的实例](docs/FREE_HOSTING.md)。

## 本机运行

需要 Git、Node.js 24+ 和 npm。

```sh
git clone https://github.com/askandtell/interlude.git
cd interlude
npm ci
node scripts/setup-dev.mjs
```

在两个终端中分别运行：

```sh
npm run dev
```

```sh
npm run ui
```

访问 **http://127.0.0.1:15173**。本机小房间可以直接试用 P2P；需要转发时，另外启动 LiveKit，步骤见[部署文档](docs/DEPLOYMENT.md)。开发环境未配置 Redis 时，重启会丢失房间记录。

## 自行部署

仓库提供 Docker Compose 和 Render Blueprint。免费托管路线使用 Render 二级域名，无需购买域名或 VPS。部署者需要填写自己的 LiveKit 配置，密钥只放在服务端环境变量中。

- [入门与配置](docs/GETTING_STARTED.md)
- [免费托管步骤和限制](docs/FREE_HOSTING.md)
- [Docker 与自托管](docs/DEPLOYMENT.md)
- [直连、转发与隐私](docs/HYBRID_MEDIA.md)

公开源码不附带维护者的云服务额度。服务商的免费政策和网络可达性，以自己的账号与实际测试为准。

## 开发与测试

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

安装 FFmpeg 后，`npm run test:media` 可以生成测试片和麦克风测试音。启动本机 LiveKit，再设置 `MEDIA_E2E=1`，可以运行转发音视频测试。公网测试使用 `PUBLIC_E2E_URL` 和 `npm run test:public`，会创建临时房间并消耗少量媒体额度。

[测试结果](docs/TEST_REPORT.md) · [架构](docs/ARCHITECTURE.md) · [安全说明](docs/SECURITY.md)

## 当前限制

版本仍处于早期。已测试桌面浏览器和公开 HTTPS 实例的直连、云端转发；不同运营商、真实手机、TURN-only 网络和两小时连续播放尚未完整测试。观看者不能单独拖动同一路实时视频的进度。

[视频网站同步扩展](docs/WEBSITE_WATCH.md)为实验功能，各自需要在官网拥有正常观看权限。Jellyfin、原生客户端和个人独立字幕暂未实现。

## 来源与许可

项目基于 [WatchParty](https://github.com/howardchung/watchparty)，使用 MIT 许可证并保留上游历史与署名。复用了其浏览器本地转换模块，房间权限、媒体传输与界面在此基础上开发。详见 [LICENSE](LICENSE) 和[第三方声明](THIRD_PARTY_NOTICES.md)。