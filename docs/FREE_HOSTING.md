# 免费固定网址部署

目标：不购买域名、不租 VPS，使用 Render 提供的 HTTPS 二级域名、免费 Web Service、免费 Key Value 与 LiveKit Cloud Build 免费媒体额度。适合个人、小范围好友使用，不承诺永久免费政策、无限用量或大陆网络可用性。

## 固定组成

- `render.yaml` 明确指定两个服务为 `plan: free`、新加坡区域、单副本。应用同时提供静态页面、HTTP 与 Socket.IO，保持现有同源会话与 Origin 检查。
- Redis 只允许 Render 内网访问，使用带 TTL 的房间记录；免费 Key Value 重启会丢失数据，届时需重建房间。
- 使用 `RENDER_EXTERNAL_URL` 自动确定唯一 HTTPS Origin，不需要自定义域名。默认平台网址在服务存在时保持不变。
- LiveKit Cloud URL 使用 WSS，并自动推导 HTTPS 管理端点。API key 与 secret 只填入服务端秘密变量；不添加到 Git、前端变量或截图。
- 关闭 Agent observability；不创建 Agent、Egress、录制任务或付费附加功能。

## 部署流程

1. 用户完成 LiveKit、Render 账号登录、注册条款与邮箱验证。只使用免费个人套餐，不绑定支付方式。
2. 将完整 Git 历史与应用改动推送到独立私有仓库。Render GitHub 集成仅授权此仓库，不能用不相关仓库或将 GitHub 个人访问令牌交给托管商。
3. Render 使用该仓库的 `render.yaml` 创建 Blueprint。服务清单必须全部为 Free。填入 LiveKit 的三项服务端变量；SESSION_SECRET 自动生成。
4. 构建完成后检查 HTTPS 主页、Secure/HttpOnly/SameSite 会话、严格 Origin、Socket.IO、健康状态。Redis 不可用时拒绝生产启动；媒体管理连接不可用时允许直连，并明确显示转发暂不可用。
5. 给 LiveKit 配置签名 webhook，地址为 `https://实际平台网址/api/livekit/webhook`，签名 key 选择本项目使用的 API key。周期检查仍作为补充保护。
6. 用真实公网链接进行至少两名参与者收流、实际解码音画、暂停、跳转与移除成员验证；然后测试真实手机、不同运营商与强制 TURN。打开主页不算完成部署验收。

## 免费限制与费用边界

小房间现在优先直连，成功直连不申请 LiveKit 凭证，只有失败或 4 人以上时才消耗转发额度。直连仍需要控制服务与网络可达性，无法免除所有托管限制；具体阈值、切换与 IP 隐私见[混合媒体说明](HYBRID_MEDIA.md)。不自动购买资源，也没有账单级硬限额实现。

Render 免费 Web Service 闲置 15 分钟会休眠，首次唤醒约一分钟。免费 Key Value 无磁盘持久化；平台可重启服务。耗尽免费实例小时或未绑定支付方式情况下耗尽带宽，会暂停服务；不自动升级规格。不要通过外部保活伪装真实用户或规避平台规则。

LiveKit Build 目前提供每月 5,000 WebRTC 参与者分钟、50GB 下行额度，官方标注无需信用卡。两人连接两小时按约 240 参与者分钟计，不是 120；本地电影下行随观看人数增长，高清电影可能先耗尽流量。应核对账户实时额度与超限行为，保持免费套餐且不添加支付方式；遇到要求升级或绑卡时停止，不继续付费操作。

平台子域名与境外免费节点在中国大陆能否稳定访问，需要分别实测网页、信令和媒体。不能仅凭部署成功宣称“国内稳定可用”。如果链路不可靠，先记录结果，再选择其他免费部署方式；不偷偷变更到收费方案。

## 当前实施记录

2026-10-15：已准备自动 Origin、云端媒体配置、免费 Blueprint 与测试；已创建独立私有部署仓库 `askandtell/interlude`。LiveKit 项目已创建并关闭观测录制。实际构建发布、托管集成、服务端密钥、签名 webhook 及公网音画状态以本次会话的最终报告为准，本文不是发布成功证明。

参考：[Render 免费限制](https://render.com/docs/free)、[Blueprint 规范](https://render.com/docs/blueprint-spec)、[默认环境变量](https://render.com/docs/environment-variables)、[LiveKit 价格与免费额度](https://livekit.com/pricing)。
