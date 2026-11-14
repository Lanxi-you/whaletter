# AGENTS.md · 给 AI 的操作手册

> 你是帮用户把这套装起来的人。用户可能不懂命令行，也可能只是说「帮我装好」。
> **照下面的顺序一条条做，每步都验证，别跳。** 能替他做的就替他做，做不了（比如要他在手机上点）
> 就明确告诉他点哪儿。

---

## 0. 先摸清环境（别猜）

按顺序确认这四件事，结果记下来再往下走：

0. **APK 从哪来**：优先去本仓库的 Releases 下最新的 `whaletter-*.apk`；
   实在没有才自己编（`npm install`，然后 `cd android && ./gradlew assembleDebug`）。

1. **系统**：Windows / macOS / Linux。Windows 上命令用 PowerShell 写法（见每步的 Windows 分支）。
2. **有没有装 DeepSeek Harness（DSH）**：
   - Windows：`C:\Users\<用户>\AppData\Local\Programs\DeepSeek Harness\`
   - macOS/Linux：一般 `~/.dsh/`
   - 没有 → 先去装 DSH；**装完再回来**。别在没有 DSH 的情况下继续。
3. **Node 版本**：`node -v`，要 ≥ 20。
4. **这个仓库在哪**：记下绝对路径，后面软链要用。

---

## 1. 把 server/ 装成 DSH 插件

**首选：走 DSH 自己的插件命令**（正规做法，装完在设置页里能看见、能开关）：

```bash
dsh plugin --profile desktop add "<仓库绝对路径>/server"
```

Windows 上 DSH 的命令行在 `C:\Users\<用户>\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd`，
调用前先设 `ELECTRON_RUN_AS_NODE=1`。

**如果那条命令跑不通，就手动挂**（等价，只是不会出现在设置页的管理列表里）：

目标：`~/.dsh/profiles/desktop/node_modules/dsh-whaletter-chat` 指向本仓库的 `server/` 目录。

**Windows（PowerShell）**

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-whaletter-chat" -Target "<仓库绝对路径>\server"
```

**macOS / Linux**

```bash
ln -s "<仓库绝对路径>/server" ~/.dsh/profiles/desktop/node_modules/dsh-whaletter-chat
```

验证：那个路径存在，且点进去能看到 `package.json` 和 `src/`。

---

## 2. 让 DSH 认得它

- 用第 1 步的 `dsh plugin add` 装的话，**这一步不用做**，命令会自己把声明写上
- 手动挂的话，编辑 `~/.dsh/profiles/desktop/cordis.patch.yml`，在**文件末尾**追加：

  ```yaml
  - insert:
      - id: dsh-whaletter-chat
        name: dsh-whaletter-chat
  ```

  注意：
  - 缩进是两个空格，`- insert:` 前面不要有缩进（顶层列表）
  - 文件里如果已经有别的 `- insert:`，**新加一段**，不要合并进去
  - 本包自带 `cordis.patch.yml`，所以用 `dsh plugin add` 的路线不需要手写这段

验证：`~/.dsh/profiles/desktop/cordis.patch.yml` 里能搜到 `dsh-whaletter-chat`。

---

## 3. 重启 DSH，让它把这个插件读进去

- 让用户退出 DSH 再打开（不是关窗口，是托盘/菜单里真正退出）
- 重启后，插件会在 `server/data-root/config.json` 里生成一份配置（第一次会自己建）

验证：

```bash
cat <仓库路径>/server/data-root/config.json
```

应该能看到 `访问令牌`、`目标会话`、`手机端口`（默认 8791）。

---

## 4. 填「目标会话」

`目标会话` 空着的话，手机能连上但发出去的话没人接。

1. 让用户先在 DSH 里**打开一个会话**（随便什么标题）
2. 用令牌列出会话：

   ```bash
   curl -s "http://127.0.0.1:8791/api/sessions?token=<访问令牌>"
   ```

3. 从返回的 `sessions` 里挑一个 `id`（形如 `session-xxxx`），写进 `config.json` 的 `目标会话`
4. 重启 DSH（或等插件重载）

验证：`curl "http://127.0.0.1:8791/api/state?token=<令牌>"` 里 `target.id` 就是刚才填的那个。

---

## 5. 让手机能连上（这一段最容易出错，按情况选一条）

先问自己：**手机和电脑是不是同一个 WiFi？**

### 5A. 同一个 WiFi，且路由器没开设备隔离

- 找电脑内网地址：Windows `ipconfig`，macOS/Linux `ipconfig getifaddr en0` 或 `ip addr`
- 手机要填的地址 = `<内网地址>:8791`

验证：让用户用**手机浏览器**打开 `http://<内网地址>:8791/api/state?token=<令牌>`，
能看到 JSON 才算通。

### 5B. 不在同一个网（或者 WiFi 有设备隔离）→ 用 Tailscale

1. 电脑装 Tailscale 并登录（问用户有没有账号，没有就让他注册）
2. 手机上装 Tailscale，**登录同一个账号**
3. 拿电脑的 Tailscale 地址：

   ```bash
   tailscale status
   ```

   第一行形如 `100.x.x.x` 的那个就是

4. 把端口转出去（**每次重启电脑后可能要重做**）：

   ```bash
   tailscale serve --bg --tcp=8791 tcp://127.0.0.1:8791
   ```

5. 验证转发在：

   ```bash
   tailscale serve status
   ```

   能看到 8791 那几行

6. 手机要填的地址 = `100.x.x.x:8791`

**一定要提醒用户的两件事**（说了能省他一晚上）：

- 手机上**同一时间只能挂一个 VPN**。Tailscale 和加速器/梯子互斥，开一个另一个就断
- 电脑上如果开着系统代理，且代理端口已经关掉了，会导致各种「明明网通却连不上」。
  查 Windows：设置 → 网络和 Internet → 代理，确认「使用代理服务器」是关的

---

## 6. 手机端：装 App 并填地址令牌

### 6.1 先把 APK 弄到手机上（用户在电脑前，手机在手上）

AI 通常是在电脑上干活的，包也在电脑上，**得想办法把它送到手机**。按顺序试：

**办法 A：电脑上临时起个下载页（最省事，同一个 WiFi 就能用）**

```bash
# 在放 APK 的目录里
python -m http.server 8000
```

然后查电脑的内网地址（Windows `ipconfig`，macOS `ipconfig getifaddr en0`，Linux `ip addr`），
让用户在**手机浏览器**打开：

```
http://<内网地址>:8000/whaletter-1.0.0.apk
```

下完让他点安装。装完记得把那个临时服务关掉（Ctrl+C）。

注意：Windows 第一次跑可能弹防火墙授权，点允许；如果手机打不开，先确认在同一个 WiFi。

**办法 B：手机连数据线，用 adb 直接装**

```bash
adb devices            # 先确认手机连上了（手机要开 USB 调试）
adb install -r whaletter-1.0.0.apk
```

**办法 C：走现成的文件通道**——网盘、邮箱附件、或者任何能传文件的聊天软件，
用户自己传过去。别用需要注册的服务。

### 6.2 装完填地址和令牌

1. 打开 App，第一次会直接落在「设置 → 账号管理 → 改这条」：
   - 地址：第 5 步确定的那个（例如 `100.97.16.102:8791`）
   - 令牌：`config.json` 里的 `访问令牌`
   - 点「存下」
2. 回消息页，点那条线进去，发一句话

验证：这句话应该出现在电脑那边的 DSH 会话里，并且有回复回来。

---

## 7. 收尾检查清单

全部打勾才算装好：

- [ ] `curl http://127.0.0.1:8791/api/state?token=<令牌>` 返回 JSON
- [ ] `config.json` 里 `目标会话` 非空
- [ ] 手机浏览器能打开 `http://<地址>:8791/api/state?token=<令牌>`
- [ ] 手机 App 里能进聊天页，发出去有回复
- [ ] 用户知道「手机只能挂一个 VPN」这件事

---

## 8. 连不上时按这个顺序查

| 现象 | 先查这个 |
| --- | --- |
| 手机 App 一直显示「连不上」 | 手机浏览器能不能打开那个地址？打不开 = 网络问题，回去看第 5 步 |
| 能打开但提示 401 | 令牌不对，去 `config.json` 对一遍 |
| 连上了但发消息没回音 | `目标会话` 空着，或者 id 不对 |
| 电脑自己都打不开 127.0.0.1 | DSH 没启动 / 插件没挂上，回去看第 1、3 步 |
| 昨天还好今天不行 | `tailscale serve` 的转发重启后丢了，重跑一次 |
| 网页也打不开 | 系统代理指到了死端口（见第 5 步那条提醒） |

---

## 9. 硬规矩（别踩）

- **不要**把 `访问令牌` 写进任何公开的地方：不要提交、不要贴进聊天记录、不要发截图
- **不要**把 8791 端口直接暴露到公网（明文 http，没有加密）
- 聊天记录在 `server/data-root/messages.jsonl`，删它等于删聊天；动之前先备份
- 改 `server/` 里的代码后，要让 DSH 重载插件才生效（不是改完就活）

---

## 10. 还没实现的功能（别承诺，也别当 bug 修）

- 后台/锁屏通知：只在你刚切出去那一小会儿有效，被系统冻结就收不到
- 好友/通讯录：只有「加一条线 / 删一条线」，没有备注、分组、搜索
- 电脑往手机传文件：没有
- 在 App 里发「空间」：没有，空间只能由后端写
- 语音、群聊、已读、撤回、端到端加密、iOS 版：都没有

细节见 [docs/怎么用.md](docs/怎么用.md)。
