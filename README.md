# 一起看

和朋友各自播放同一部影片，一起看、一起聊。

[打开一起看](https://interlude-eoqk.onrender.com) · [使用指南](docs/GETTING_STARTED.md) · [自行部署](docs/FREE_HOSTING.md) · [English](README.en.md)

![放映室](docs/design/implemented-room.png)

## 怎么一起看

- **本地影片**：房主选片，朋友各自选择同一剪辑版本的文件。每个人在自己的设备播放，一起看同步进度、暂停和跳转，不传送影片。
- **视频网站**：每个人在官方网站观看，桌面扩展同步播放。支持四个平台的链接格式，播放器适配仍处于实验阶段。
- 私密邀请、房主批准、最多八人，支持文字聊天和暂停请求。
- 每个人可以单独调整音量、载入 SRT/VTT 字幕、设置字号与时间偏移。

房主不能把自己的一份影片直接分享给全房间。一起看不提供影视资源、语音通话或云端视频转发。网站模式需要每个人自己的观看权限。

## 开始使用

1. 打开网址，创建房间，选择本地影片或网站链接。
2. 通过“邀请朋友”发送完整链接，收到申请后批准入座。
3. 本地模式下，朋友选择自己的文件并确认是同一剪辑版本，点击“加入一起看”。
4. 房主点击“开始放映”。网站模式的扩展安装及操作见[使用说明](docs/WEBSITE_WATCH.md)。

普通用户不需要注册云服务或填写密钥。体验站使用免费基础托管，可能休眠、限流或暂停；不保证所有国内网络都稳定可达。

## 本机运行

需要 Git、Node.js 24+ 和 npm。

```sh
git clone https://github.com/askandtell/interlude.git
cd interlude
npm ci
node scripts/setup-dev.mjs
```

在两个终端分别运行 `npm run dev` 和 `npm run ui`，访问 http://127.0.0.1:15173 。本地开发可使用内存存储；重启后房间记录会丢失。生产部署使用 Redis，不需要音视频服务账号。

## 部署与开发

- [Render 免费托管](docs/FREE_HOSTING.md)：网站和房间数据仍使用部署者的基础托管资源，没有视频或语音转发额度。
- [Docker 与其他部署方式](docs/DEPLOYMENT.md)
- [参与开发](CONTRIBUTING.md) · [同步设计](docs/SYNCHRONIZATION.md) · [安全说明](docs/SECURITY.md)
- [测试结果与未覆盖环境](docs/TEST_REPORT.md)

```sh
npm run check
npx playwright install chromium
npm run test:media # 需要 FFmpeg，生成测试影片
npm run test:e2e
```

## 当前限制

各自的文件需要是同一剪辑版本。时长检查不能证明内容一致；超过一秒的时长差会阻止加入。刷新后需要重新选择文件，断线恢复后需要主动继续观看。

真实手机、跨运营商网络和两小时连续播放仍需更多测试。网站的登录、广告、会员和封闭播放器会影响适配，尚未完成四个平台的完整实测。

## 来源与许可

基于 [WatchParty](https://github.com/howardchung/watchparty)，保留 MIT 许可证、上游历史和署名，复用其浏览器本地兼容转换模块。详见 [LICENSE](LICENSE) 和[第三方声明](THIRD_PARTY_NOTICES.md)。
