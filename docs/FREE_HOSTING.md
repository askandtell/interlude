# 部署公共网址

普通用户直接打开网址使用。部署者只需提供网站与房间数据服务；不需要音视频服务账号。

## Render

1. Fork 仓库，在 Render 创建 Blueprint，选择自己的仓库及根目录 `render.yaml`。
2. 确认 Web Service 和 Key Value 均为 Free。不添加付费磁盘、副本或套餐。
3. Blueprint 生成 `SESSION_SECRET` 并连接内网 `REDIS_URL`。应用使用 `RENDER_EXTERNAL_URL` 作为 HTTPS Origin。
4. 部署后用两个浏览器分别选择自己的测试影片，验证邀请、审批与同步，再分享平台提供的网址。

启动命令为 `npm start`，构建使用 `npm ci --include=dev && npm run build && npm prune --omit=dev`。默认关闭自动部署；更新配置时先同步 Blueprint，再手动部署。

## 资源与限制

网站、房间状态和文字聊天仍使用部署者的基础托管资源。没有视频转发、语音或媒体参与者分钟。人数增长仍会增加连接数和控制消息，不能无限扩展。

免费实例可能休眠、暂停或丢失房间数据；境外节点在国内的可达性取决于实际网络。当前使用单个控制服务实例，增加副本前需要实现跨进程房间协调。

## 从旧版升级

更新会结束旧协议房间，用户需要刷新并重新创建。新版验证通过后，移除旧媒体环境变量，撤销一起看专用媒体密钥及 Webhook；不要改动同一账号下其他项目。

[Render 免费规格](https://render.com/docs/free) · [Blueprint 文档](https://render.com/docs/blueprint-spec)
