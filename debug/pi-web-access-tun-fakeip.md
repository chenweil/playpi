# pi web-access 踩坑：TUN/fake-IP 代理下 fetch 被 SSRF 防护拦截

> 适用症状：pi 里使用 `fetch_content` / `web_search` / `source_check` 报错：
> `Blocked internal address for <域名>: 198.18.x.x. This address is in 198.18.0.0/15,
> commonly used by TUN/fake-IP proxies. If that matches your setup, configure
> ssrf.allowRanges with ["198.18.0.0/15"] in web-search.json.`
> 环境：macOS，系统代理开启 TUN 模式（Clash / Mihomo / Surge / Stash 等）。

## 原因

两层机制撞在一起：

1. **TUN + fake-IP 模式**：代理接管全部流量后，本机 DNS 对任何公网域名返回
   `198.18.0.0/15`（IANA 保留的基准测试网段）里的"假 IP"，真实解析与连接由代理完成。
2. **pi-web-access 的 SSRF 防护**：扩展在发起请求前会先做本地 DNS 预检，
   解析到私有/保留网段就直接拦截，防止误访问内网（SSRF 防护）。

结果是：公网域名 → 解析出假 IP `198.18.x.x` → 被当成内网地址拦下。
这是防护误伤，不是网络真的不通。

## 解决

在 `~/.pi/web-search.json` 加 `ssrf.allowRanges` 白名单：

```json
{
  "provider": "exa",
  "ssrf": {
    "allowRanges": ["198.18.0.0/15"]
  }
}
```

其余字段（provider、workflow 等）保持原样即可。改完无需重装，新会话生效。

## 注意事项

| 项 | 说明 |
|---|---|
| 安全性 | 只放行 fake-IP 段，`127.0.0.0/8`、`10.0.0.0/8`、`192.168.0.0/16` 等真实内网段仍被拦截，SSRF 防护没有完全关闭 |
| fake-IP 池不同的情况 | 按"你代理配置里的 `fake-ip-range`"填对应段。Clash 默认 `198.18.0.1/16`；Mihomo 常见自定义 `28.0.0.0/8`；IPv6 假 IP 段用 CIDR 一并加上（如 `fc00::/18`） |
| 严禁的写法 | `0.0.0.0/0` 和 `::/0` 会被扩展直接拒绝，全放行配置不合法 |
| 相邻可选项 | `ssrf.trustEnvProxy: true` 是另一个开关，仅针对沙箱环境通过 HTTP(S)_PROXY 环境变量出网的场景，与本坑无关，二者不要混用 |
| 判断依据 | 报错信息里被拦的 IP 落在 `198.18.0.0/15`（198.18.0.0 – 198.19.255.255）基本可确认是 fake-IP 模式 |

## 验证方式

配置生效后，任选一个静态页面测试：

```text
fetch_content https://raw.githubusercontent.com/ghostty-org/ghostty/main/README.md
```

能正常返回内容、不再出现 `Blocked internal address` 即为修复。
（注意：JS 渲染页面报 "JavaScript-rendered" 是另一回事，与 SSRF 无关。）

## 关键文件

| 文件 | 作用 |
|---|---|
| `~/.pi/web-search.json` | pi-web-access 配置文件，`ssrf.allowRanges` 写在这里 |
| `~/.pi/agent/npm/node_modules/pi-web-access/ssrf-protection.ts` | 防护实现：CIDR 校验、报错文案、`allowRanges` 解析都在此 |
