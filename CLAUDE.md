# AGENTS.md · 给 AI 的安装手册

> 你正在帮一个**可能完全不懂命令行**的人，在**他自己的电脑**上把这套装起来：
> 电脑当后端，手机当壳，两边直连。
>
> 规则只有一条：**每一步都验证，验证不过就停下来问，别往下猜。**
> 他要的是「装好」，不是「你写了一大堆命令」。

---

## 一句话流程

① 下包 → ② 装插件 → ③ 启动一次拿令牌 → ④ 填目标会话 → ⑤ 打通网络（同 WiFi 或 Tailscale）
→ ⑥ 把包送到手机并装上 → ⑦ 手机上填地址令牌 → ⑧ 发一句话验通

八步，第 ③ 之后每一步都会用上一步的结果。**别跳步，别攒到最后一起做。**

---

## 每步做完怎么验证（照这个表自检）

| 步 | 做完应该看到 | 没看到就停在这儿 |
| --- | --- | --- |
| ② 装插件 | 插件目录里有 `package.json` 和 `src` | 装法见第 2 节 |
| ③ 后端活着 | `curl -s "http://127.0.0.1:8791/api/state?token=<令牌>"` 返回 JSON | DSH 没重启，或插件没挂上 |
| ④ 目标会话 | 上面那段 JSON 里 `target.id` 非空 | 会话 id 填错 / 没填 |
| ⑤ 网络 | **手机浏览器**能打开同一个地址 | 90% 的问题都在这一步，见第 5 节 |
| ⑦ 手机连上 | App 里能看到聊天页、能发出去 | 地址或令牌不对 |
| ⑧ 端到端 | 手机发一句，电脑上的 DSH 会话说一句，手机收到回复 | 目标会话或后端的问题 |

---

## 0. 先摸清环境（别猜）

按顺序确认，把结果记下来再往下走：

1. **系统**：Windows / macOS / Linux（Windows 用 PowerShell 写法，每步都分开写了）
2. **包从哪来**：优先去本仓库 Releases 下最新的 `whaletter-*.apk`；实在没有才自己编
   （`npm install`，然后 `cd android && ./gradlew assembleDebug`，产物在 `android/app/build/outputs/apk/debug/`）
3. **有没有装 DeepSeek Harness（DSH）**：
   - Windows：`C:\Users\<用户>\AppData\Local\Programs\DeepSeek Harness\`
   - macOS/Linux：一般 `~/.dsh/`
   - 没有 → 先帮他装好 DSH 再回来。**没有 DSH 就不要往下做**，装不了。
4. **Node 版本**：`node -v`，要 ≥ 20
5. **这个仓库在哪**：记下绝对路径，后面要用

---

## 1. 跟用户怎么说话（重要）

- 一次只推进一件事，做完说一句「好了，现在做 X」，**别一次甩十条命令让他排队执行**
- 需要他在手机上操作时，说清楚**点哪个图标、看到什么字样**，不要只说「你连一下」
- 出错了别说「执行失败」，要说「这一步卡住了，原因是 X，我换个办法」
- 全部装完给他一句话验收：「你现在能在手机上跟他说话了，试试发一句」

---

## 2. 把 server/ 装成 DSH 插件

**首选：用 DSH 自己的插件命令**（正规做法，装完设置页里能看见、能开关）

```bash
dsh plugin --profile desktop add "<仓库绝对路径>/server"
```

Windows 上 DSH 的命令在
`C:\Users\<用户>\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd`，
调用前先设环境变量 `ELECTRON_RUN_AS_NODE=1`。

**这条命令跑不通，就手动挂**（效果一样，只是不会出现在设置页的管理列表里）：

目标：`~/.dsh/profiles/desktop/node_modules/dsh-whaletter-chat` 指向本仓库的 `server/`

```powershell
# Windows
New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-whaletter-chat" -Target "<仓库绝对路径>\server"
```

```bash
# macOS / Linux
ln -s "<仓库绝对路径>/server" ~/.dsh/profiles/desktop/node_modules/dsh-whaletter-chat
```

再在 `~/.dsh/profiles/desktop/cordis.patch.yml` **末尾**追加（注意缩进两个空格、顶层列表）：

```yaml
- insert:
    - id: dsh-whaletter-chat
      name: dsh-whaletter-chat
```

> 用 `dsh plugin add` 的话，这段不用手写——包里已经带了 `cordis.patch.yml`。

**验证**：那个目录能进去，里面有 `package.json` 和 `src/`。

---

## 3. 重启 DSH，等它自己生成配置

- 请用户从托盘/菜单里**真正退出** DSH 再打开（关窗口不算）
- 第一次启动时插件会在 `server/data-root/config.json` 生成配置

**验证**：

```bash
cat "<仓库路径>/server/data-root/config.json"
```

要能看到 `访问令牌`、`目标会话`、`手机端口`（默认 8791）。看到令牌先**别急着贴给用户**，
后面填手机时才需要。

---

## 4. 填「目标会话」

空着的话手机能连上、但发出去的话没人接。

1. 让用户在 DSH 里**打开一个会话**（标题随意）
2. 列出来：

   ```bash
   curl -s "http://127.0.0.1:8791/api/sessions?token=<访问令牌>"
   ```

3. 从 `sessions` 里挑一个 `id`（形如 `session-xxxx`），写进 `config.json` 的 `目标会话`
4. 重载插件或重启 DSH

**验证**：`/api/state` 返回里 `target.id` 就是刚填的那个。

---

## 5. 打通网络（最容易翻车的一段）

先问死一句话：**手机和电脑是不是连在同一个 WiFi？**

### 5A. 是，而且路由器没开设备隔离

1. 查电脑内网地址：Windows `ipconfig`，macOS `ipconfig getifaddr en0`，Linux `ip addr`
2. 手机要填的地址 = `<内网地址>:8791`

**验证**：让用户用**手机浏览器**打开（这一步必须他来点，你替他验不了）

```
http://<内网地址>:8791/api/state?token=<令牌>
```

能看到 JSON 才算通。

### 5B. 不是同一个网，或者 WiFi 有隔离 → Tailscale

1. 电脑装 Tailscale 并登录（没账号就让他注册，Google/GitHub/邮箱都行）
2. 手机装 Tailscale，**登录同一个账号**
3. 拿电脑的 Tailscale 地址：`tailscale status`，第一行 `100.x.x.x`
4. 把端口转出去（**重启电脑后可能要重做**）：

   ```bash
   tailscale serve --bg --tcp=8791 tcp://127.0.0.1:8791
   ```

5. **验证**：`tailscale serve status` 里能看到 8791
6. 手机要填的地址 = `100.x.x.x:8791`

### 这一节必须提醒用户的两件事

- **手机上同一时间只能挂一个 VPN**：Tailscale 和加速器/梯子互斥，开一个另一个就断。
  要聊天连 Tailscale，要上外网切回梯子。
- **电脑上的系统代理**：如果它指向一个已经关掉的端口，会出现「明明有网却连不上」。
  Windows 查：设置 → 网络和 Internet → 代理 → 「使用代理服务器」应为关。

### 5C. 用户嫌 Tailscale 慢 → 自建中转

**先判断要不要建议**：只在用户抱怨「下载更新包很慢」「发图卡」时才提。
判断依据（不用问他，自己查）：`tailscale ping <对端>` 回的是 `via DERP(...)` 还是
`direct`；`tailscale netcheck` 看 `Nearest DERP` 落在哪个区域。国内常见落地是
`sfo`（旧金山）——数据绕太平洋一圈，几 MB 的包要等好几分钟。

给方案时按代价从低到高排，别一上来就让人买服务器：

1. **现成内网穿透**：蒲公英 / 花生壳 / natapp / 樱花frp。十分钟能通，免费版限速
   1Mbps 左右，发文字够用，传包还是慢。
2. **frp 反代**（推荐给愿意花十几块的人）：国内轻量云 + frps + 本机 frpc，
   把 `8791` 映射出去。完整命令见 `docs/怎么用.md` 的「情况 C」。
   **必须提醒**：云厂商安全组要放行 `7000` 和 `8791`；走的是明文 http，
   `auth.token` 一定要长随机串。
3. **自建 Tailscale derper**：保留端到端加密，中继换成自己的，配置比 frp 麻烦。
4. **Cloudflare Tunnel**：免费、自带 https，但没有国内节点，速度跟 Tailscale 绕远
   差不多，只适合临时用。

**别做的事**：不要把用户的公网 IP、令牌写进仓库里的任何文档（连示例都不要）。

---

## 6. 把 APK 送到手机上

你在电脑上，手机在他手上，得想办法把包送过去。按顺序试：

### 办法 A：电脑上临时起个下载页（最省事）

```bash
cd <放 APK 的目录>
python -m http.server 8000
```

查电脑内网地址，让用户在**手机浏览器**打开：

```
http://<内网地址>:8000/whaletter-1.0.1.apk
```

下完点安装。**装完记得 Ctrl+C 关掉这个临时服务。**

> Windows 第一次跑会弹防火墙授权，让他点允许；手机打不开就先确认在同一个 WiFi。

### 办法 B：数据线 + adb

```bash
adb devices                  # 确认连上了（手机要开 USB 调试）
adb install -r whaletter-1.0.1.apk
```

### 办法 C：走网盘 / 邮箱附件 / 任何能传文件的软件，让他自己传

### 装完：填地址和令牌

1. 打开 App，第一次会直接落在「设置 → 账号管理 → 改这条」
2. 填地址（第 5 步定的）和令牌（`config.json` 里的 `访问令牌`），点「存下」
3. 回消息页，点那条线，发一句话

---

## 7. 收尾检查清单

- [ ] `/api/state` 在电脑上返回 JSON
- [ ] `config.json` 里 `目标会话` 非空
- [ ] 手机浏览器能打开那个地址
- [ ] 手机 App 里能进聊天，发出去有回复
- [ ] 用户知道「手机只能挂一个 VPN」
- [ ] 用户知道令牌不能外传

---

## 8. 连不上时按这个顺序查

| 现象 | 先查 |
| --- | --- |
| 手机 App 一直「连不上」 | 手机浏览器能不能打开那个地址？打不开 = 网络问题，回第 5 节 |
| 能打开但提示 401 | 令牌不对，去 `config.json` 对一遍 |
| 连上了但发消息没回音 | `目标会话` 空着，或 id 不对 |
| 电脑自己都打不开 127.0.0.1 | DSH 没启动 / 插件没挂上，回第 2、3 节 |
| 昨天好今天不行 | `tailscale serve` 的转发重启后丢了，重跑一次 |
| 电脑网页也打不开 | 系统代理指到了死端口（见第 5 节） |
| 手机装不上 APK | 安卓要允许「安装未知来源应用」 |

---

## 9. 硬规矩

- **不要**把 `访问令牌` 写进任何公开的地方：不提交、不发群、不发截图
- **不要**把 8791 端口直接暴露到公网（明文 http，没有加密）
- 聊天记录在 `server/data-root/messages.jsonl`，删它等于删聊天；动之前先备份
- 改了 `server/` 里的代码，要重载插件才生效（改完不等于生效）

---

## 10. 还没实现的功能（别承诺，也别当 bug 修）

- 后台/锁屏通知：只在你刚切出去那一小会儿有效，被系统冻结就收不到
- 好友/通讯录：只有「加一条线 / 删一条线」，没有备注、分组、搜索
- 电脑往手机传文件：没有
- 在 App 里发「空间」：没有，空间只能由后端改 `server/public/space.json`
- 语音、群聊、已读、撤回、端到端加密、iOS 版：都没有

细节见 [docs/怎么用.md](docs/怎么用.md)。
