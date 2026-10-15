# 使用免费托管部署

此路线使用 Render 二级域名和免费实例，配合自己的 LiveKit Cloud 项目。不需要购买域名或 VPS。体验站位于 <https://interlude-eoqk.onrender.com>，各项免费政策以服务商控制台为准。

首次部署的完整步骤见[入门指南](GETTING_STARTED.md)。

## 部署组成

| 服务 | 用途 | 配置 |
| --- | --- | --- |
| Render Web Service | 网页、HTTP 和 Socket.IO | Node.js，Free，新加坡，单副本 |
| Render Key Value | 房间与会话数据 | Free，仅内网访问，带 TTL |
| LiveKit Cloud | 直连失败或多人房间的媒体转发 | 自己项目的 Build 套餐与额度 |

`render.yaml` 默认将两个 Render 服务设为 Free，关闭自动部署，不配置付费磁盘。部署前仍需检查控制台显示的规格；若要求付费或绑定支付方式，请停止并确认自己的选择。

## 需要填写的变量

- `LIVEKIT_URL`：自己项目的 WSS 地址。
- `LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`：自己创建的服务端密钥。
- `SESSION_SECRET`：Blueprint 自动生成。
- `REDIS_URL`：由内网 Key Value 自动提供。

应用在 Render 上使用 `RENDER_EXTERNAL_URL` 作为准确的 HTTPS Origin。密钥不能放进源码、前端 `VITE_*` 变量或问题反馈。

构建命令显式安装构建工具，随后删除开发依赖：

```sh
npm ci --include=dev --registry=https://registry.npmjs.org
npm run build
npm prune --omit=dev
```

部署后，在 LiveKit Webhooks 中添加 `https://你的服务.onrender.com/api/livekit/webhook`，使用同一把 API key 签名。先检查健康状态，再用两个独立浏览器验证实际画面和声音。

## 使用限制

Render 免费应用闲置后会休眠，首次唤醒可能需要一分钟左右；Key Value 重启可能丢失房间数据。免费实例小时、流量或媒体额度耗尽时，服务可能暂停。不要用外部保活脚本规避平台规则。

成功直连不连接 LiveKit，但控制服务仍需运行。转发流量随观看人数和码率增加。应用不升级套餐，也没有实现账单级额度硬限额；部署者应检查自己的套餐与支付设置。

公开仓库提供软件，不提供共享云服务额度。别人自行部署时使用他们自己的账号与密钥。若广泛分享同一个体验站，陌生访客也可能消耗该站的资源。

境外免费节点在国内的表现取决于运营商和实际链路。网页能打开，不代表媒体一定可用；不同网络、真实手机和长时间播放仍需单独测试。

## 更新实例

1. 更新自己的 Fork，检查配置仍符合预期。
2. 若改动了 `render.yaml`，手动同步 Blueprint。
3. 手动部署最新提交，等待健康检查成功。
4. 测试创建、邀请、直连与转发后再通知朋友使用。

重启可能中断现有放映，尽量安排在空闲时更新。

参考：[Render 免费实例](https://render.com/docs/free)、[Blueprint](https://render.com/docs/blueprint-spec)、[LiveKit 套餐](https://livekit.com/pricing)。