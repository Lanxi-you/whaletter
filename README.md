# Whaletter · 鲸笺

一个**自己搭**的手机聊天 App：手机上是壳，电脑上是后端，两头直连。
不经过 QQ、微信、任何第三方平台，聊天记录全在你自己那台电脑上。

## 先用起来（不想自己编）

去 [Releases](https://github.com/Lanxi-you/whaletter/releases) 下最新的 `whaletter-x.y.z.apk`，
装到安卓手机上就能用——但**光有它还不够**，还得在电脑上把后端立起来（见下面）。

想改：克隆这个仓库，改完自己编。想怎么改都行，MIT 许可就是给你这么用的。

## 它有什么

- **消息 / 空间**两栏，侧栏里放表情包、背景、设置
- 发文字、发图、发任意文件；表情包内嵌，能发也能存
- 多条线：每个联系人都是一条线（名字 + 地址 + 令牌），像交换名片一样加进来
- 背景图、头像、对方的名字都能改；深色/浅色外观
- 启动页、小鲸鱼随相处天数变表情、空间做成漂流瓶（越久越沉）

## 两半

| 目录 | 是什么 |
| --- | --- |
| 根目录 + `android/` | 手机这半边：React Native 0.74，原生 Android |
| `server/` | 电脑那半边：一个 DeepSeek Harness 插件，消息直接进出 DSH 会话 |

只装手机那半边是跑不起来的——它没有后端就是一具空壳。

## 怎么搭起来

> 想看得更细（尤其是手机和电脑怎么互相看见、Tailscale 怎么配、哪些功能还没做），
> 看 [docs/怎么用.md](docs/怎么用.md)。
>
> **要是你让 AI 帮你装**：直接把仓库发给它，它会照 [AGENTS.md](AGENTS.md) 一步步做完，
> 包括挂插件、填会话、配 Tailscale、验通。

### 一、电脑那边（后端）

1. 装好 DeepSeek Harness（桌面版）——它跑在 Node 上，插件就挂在它里面
2. 把本仓库的 `server/` 放进插件目录并建软链：

   ```bash
   cd ~/.dsh/profiles/desktop/node_modules
   ln -s /path/to/whaletter/server dsh-whaletter-chat      # Windows 用 mklink /J
   ```

3. 在 `~/.dsh/profiles/desktop/cordis.patch.yml` 末尾加：

   ```yaml
   - insert:
       - id: dsh-whaletter-chat
         name: dsh-whaletter-chat
   ```

4. 重开 DSH。插件第一次启动会生成 `server/data-root/config.json`：
   - `访问令牌`：随机生成的一串，手机要填这个
   - `目标会话`：填你要对着聊的那个会话 id（`/api/sessions` 能列出来）
   - `手机端口`：默认 `8791`

### 二、手机那边

1. 装依赖（第一次要跑，几分钟）：

   ```bash
   npm install
   ```

2. 出包：

   ```bash
   cd android
   ./gradlew assembleDebug
   ```

   包在 `android/app/build/outputs/apk/debug/app-debug.apk`。

3. 装完打开 App → 侧栏（左上角两条线）→ 设置 → 账号管理 → 填地址和令牌

4. 地址怎么写：电脑在同一个局域网就填 `192.168.x.x:8791`；
   不在同一个网就先用 Tailscale 之类把两台机器连起来，再填那边的地址

## 能改的地方

- **对方的名字**：设置 → 对方的名字（默认「鲸鱼娘」）
- **背景**：侧栏 → 聊天页背景 / 消息页背景（可以各挑各的）
- **头像**：侧栏最上面那个头像，点一下从相册选
- **字体**：`android/app/src/main/assets/fonts/jingluo.ttf`，换掉文件、把 `App.tsx` 里的 `字体` 常量对齐即可

## 已知的坑

- **后台通知**：安卓上被系统冻住就收不到。App 里有「后台常驻」开关（前台服务），
  在部分国产 ROM 上仍然会被整块冻结，这种机器上通知只在刚离开的一会儿有效
- **热更新**：仓库里没带，想要就自己实现（`public/update` 那条路）

## 声明
因为热爱，所以开源。

**因个人能力有限，软件许多功能并不完善，敬请谅解；如有想要的功能，可自行改造**——
代码全在这儿，改动、拆开、重写都随你，MIT 许可就是让你这么用的。

里面的表情图、字体和一部分插画来自网络或其他作者，**如有侵犯到您的权益，请发邮件到
3461454026@qq.com**，我会第一时间删掉。

## License

MIT
