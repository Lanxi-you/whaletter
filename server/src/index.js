// dsh-whaletter-chat · 自己搭的手机聊天通道（宿主半边）
//
// 干四件事：
//   ① 把自己的页面挂到 DSH 的 Web 服务上：/plugins/dsh-whaletter-chat/  （手机端是一个 PWA）
//   ② 页面发来的一句话 → agents.followup(...) 投进「目标会话」，走 DSH 自己的回合
//   ③ 目标会话里的话（两边说的）→ 抄进本地 JSONL → 页面上轮询取走
//   ④ 所有 /api/* 都要令牌；令牌是本插件自己生成的，放在自己的 config.json 里
//
// 硬约束（照 dsh-qq-bridge 的教训写的）：
//   · followup 必须 await，它 reject 时没接住 = 未处理的 rejection = 整个 DSH 宿主退出
//   · 会话 id 有两种写法（`xxx` / `session-xxx`），比较前统一去掉 session- 前缀
//   · 这里不碰任何别的插件；只往自己的目录里写

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import { 开一个库 } from './store.js'

export const name = 'dsh-whaletter-chat'

/** 宿主给的东西：agents（投消息）、sessions（清单/flush）、webServer（挂路由）、timer（定时） */
export const inject = ['agents', 'sessions', 'webServer', 'timer']

const 模块目录 = dirname(fileURLToPath(import.meta.url))
const 包根 = join(模块目录, '..')
const 静态目录 = join(包根, 'public')
const 挂载前缀 = '/plugins/dsh-whaletter-chat'

const 版本 = (() => {
  try { return String(JSON.parse(readFileSync(join(包根, 'package.json'), 'utf8')).version || '?') } catch { return '?' }
})()

const 默认配置 = {
  访问令牌: '', // 第一次启动自动生成（下面 保证令牌 那一段）
  目标会话: '', // 填你要对着聊的那个 DSH 会话 id
  称呼: '你', // 页面右边那个人
  助手名: '鲸鱼娘', // 页面左边那个人
  根目录: '', // 空着就放在仓库里的 data-root/，配置和聊天记录都在那儿
  手机监听: true, // 另开一个只走局域网的端口，手机才连得进来（令牌一样要）
  手机端口: 8791,
  保留条数: 5000,
  回填条数: 80, // 开关机后从会话日志里补多少条旧消息
}

/** 会话 id 两种写法统一成一把钥匙 */
const 会话键 = (v) => {
  const s = String(v == null ? '' : v).trim()
  return s.startsWith('session-') ? s.slice('session-'.length) : s
}

// ---------- 配置 ----------

function 归一化(原始) {
  const 是对象 = 原始 && typeof 原始 === 'object' && !Array.isArray(原始)
  const 混 = 是对象 ? { ...默认配置, ...原始 } : { ...默认配置 }
  const 字 = (v) => (typeof v === 'string' ? v.trim() : '')
  const 数 = (v, 兜, 低, 高) => {
    const n = Math.round(Number(v))
    if (!Number.isFinite(n)) return 兜
    return Math.max(低, Math.min(高, n))
  }
  const 布 = (v, 兜) => (v === true || v === 'true' || v === 1 ? true : v === false || v === 'false' || v === 0 ? false : 兜)
  return {
    访问令牌: 字(混.访问令牌),
    目标会话: 字(混.目标会话) || 默认配置.目标会话,
    称呼: 字(混.称呼) || 默认配置.称呼,
    助手名: 字(混.助手名) || 默认配置.助手名,
    根目录: 字(混.根目录) || 默认配置.根目录,
    手机监听: 布(混.手机监听, 默认配置.手机监听),
    手机端口: 数(混.手机端口, 默认配置.手机端口, 1024, 65535),
    保留条数: 数(混.保留条数, 默认配置.保留条数, 100, 100000),
    回填条数: 数(混.回填条数, 默认配置.回填条数, 0, 500),
  }
}

/** 令牌：没有就当场生成一个，写进 config.json（第一次启动就落盘，不等到改设置） */
function 保证令牌(配置, 文件) {
  if (配置.访问令牌 && 配置.访问令牌.length >= 16) return 配置
  配置.访问令牌 = randomBytes(24).toString('base64url')
  try {
    mkdirSync(dirname(文件), { recursive: true })
    writeFileSync(文件, JSON.stringify(配置, null, 2) + '\n', 'utf8')
  } catch (e) {}
  return 配置
}

function 读配置(文件) {
  try {
    return 归一化(JSON.parse(readFileSync(文件, 'utf8')))
  } catch (e) {
    return 归一化(null)
  }
}

function 写配置(文件, 配置) {
  try {
    mkdirSync(dirname(文件), { recursive: true })
    const 临 = 文件 + '.tmp'
    writeFileSync(临, JSON.stringify(配置, null, 2) + '\n', 'utf8')
    renameSync(临, 文件)
    return true
  } catch (e) {
    return false
  }
}

// ---------- 小工具 ----------

const 摘要 = (s) => createHash('sha256').update(String(s), 'utf8').digest()

/** 定长比较，别让响应快慢泄露对到第几位 */
function 令牌对(来, 真) {
  if (!来 || !真) return false
  const a = 摘要(来)
  const b = 摘要(真)
  return a.length === b.length && timingSafeEqual(a, b)
}

const 补 = (n) => String(n).padStart(2, '0')
const 现在 = () => {
  const d = new Date()
  return `${d.getFullYear()}-${补(d.getMonth() + 1)}-${补(d.getDate())} ${补(d.getHours())}:${补(d.getMinutes())}:${补(d.getSeconds())}`
}

/** 从一条消息里只抽正文（text 块拼起来；reasoning / 工具块都不要） */
function 提取正文(message) {
  if (!message) return ''
  if (typeof message === 'string') return message.trim()
  if (!Array.isArray(message.content)) {
    if (Array.isArray(message.parts)) return 提取正文({ content: message.parts })
    return ''
  }
  return message.content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

/** 哪些来源的话该显示在手机上（时间上下文、系统提示这类注入不进聊天记录） */
const 该显示 = (kind) => {
  const k = String(kind || '')
  if (!k) return true
  return !['time-context', 'system', 'system-prompt', 'tool', 'compaction', 'summary'].includes(k)
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

export function apply(ctx, 插件配置 = {}) {
  const log = (m) => {
    try {
      const l = typeof ctx.logger === 'function' ? ctx.logger('dsh-whaletter-chat') : ctx.logger
      if (l && typeof l.info === 'function') l.info(m)
      else console.log('[lanxi-chat] ' + m)
    } catch (e) {}
  }

  // ---------- 目录 / 配置 / 记录 ----------
  const 配置候选 = 归一化({ ...默认配置, ...(插件配置 && typeof 插件配置 === 'object' ? 插件配置 : {}) })
  const 根目录 = 配置候选.根目录 || join(包根, 'data-root')
  const 配置文件 = join(根目录, 'config.json')
  const 记录文件 = join(根目录, 'data', 'messages.jsonl')

  let 配置 = 保证令牌(读配置(配置文件), 配置文件)
  // 补丁里写的东西也认（根目录/端口），但文件优先——文件才是本人改的地方
  if (配置.根目录 !== 根目录) 写配置(配置文件, 配置)
  log(`配置：${配置文件}`)

  const 库 = 开一个库({ 文件: 记录文件, 保留: 配置.保留条数, 日志: log })

  /** 最近几十条事件，出问题时能对账（不落盘，只在内存） */
  const 事件账 = []
  function 记账(文本) {
    事件账.push(`${现在()} ${文本}`)
    if (事件账.length > 120) 事件账.shift()
  }

  /** 我们发出去的 id → 那条记录的 seq（用户消息回显时对得上，不会重复） */
  const 我发的 = new Map()

  /** 这一轮是不是手机问的：/api/send 立起来，turn/end 放倒。
   *  电脑上打的字没有这个标记，我的回复就不会被算进手机那条线。 */
  let 待回手机 = false

  let 服务实例 = null

  // ---------- 找 agent ----------

  function 找agent(id) {
    const 原 = String(id == null ? '' : id).trim()
    if (!原) return undefined
    const 候选 = [原]
    if (原.startsWith('session-')) 候选.push(原.slice('session-'.length))
    else 候选.push('session-' + 原)
    for (const 一个 of 候选) {
      try {
        const a = ctx.agents.get(一个)
        if (a !== undefined) return a
      } catch (e) {}
    }
    return undefined
  }

  function 会话标题() {
    let 标题 = ''
    try {
      const 标题服务 = ctx.get('sessionTitle')
      if (标题服务 && typeof 标题服务.get === 'function') {
        const 快照 = 标题服务.get({ id: 配置.目标会话 })
        标题 = (快照 && 快照.title) || ''
      }
    } catch (e) {}
    return 标题
  }

  // ---------- 收：会话里的话抄一份 ----------

  function 收用户(d, 事件id) {
    const 消息 = d.message || {}
    const src = d.source || 消息.source || {}
    if (!该显示(src.kind)) return
    const 正文 = 提取正文(消息)
    if (!正文) return
    const 我们发的 = 消息.id && 我发的.has(String(消息.id))
    if (我们发的) {
      const seq = 我发的.get(String(消息.id))
      库.改(seq, 正文, Date.now())
      我发的.delete(String(消息.id))
      return
    }
    const 去重键 = 消息.id ? 'msg:' + String(消息.id) : (事件id ? 'evt:' + 事件id : '')
    库.加({ role: 'user', text: 正文, ts: Date.now(), dedupe: 去重键 || `u:${Date.now()}:${正文.length}` })
  }

  function 收助手(d) {
    if (d.interrupted) return
    const 正文 = 提取正文(d.message)
    if (!正文) return
    // 这一轮是谁问的：手机那边 /api/send 立标记，这里用完就放倒——
    // 一轮只认一次，不然电脑上接着说的那几句也会被算成手机的。
    const 是手机 = 待回手机
    库.加({
      role: 'assistant',
      text: 正文,
      ts: Date.now(),
      turn: d.turn == null ? null : String(d.turn),
      dedupe: '',
      via: 是手机 ? 'phone' : 'dsh',
    })
    待回手机 = false
  }

  /** 这一轮里最后那句 assistant 才算数；中间那几句也不丢，都用 turn 合并 */
  function 看事件(session, event) {
    if (!event || !event.type) return
    const 键 = 会话键(session && session.id)
    if (键 !== 会话键(配置.目标会话)) return
    const d = event.data || {}
    try {
      if (event.type === 'user/message') return 收用户(d, event.seq)
      if (event.type === 'assistant/message') return 收助手(d)
      if (event.type === 'turn/end') {
        待回手机 = false
        return void 0
      }
    } catch (e) {
      记账('抄消息失败：' + String((e && e.message) || e))
    }
  }

  // ---------- 开关机时从会话日志里补一段旧的 ----------

  async function 回填() {
    const n = 配置.回填条数
    if (!n) return 0
    const 查询 = ctx.get('sessionQuery')
    if (!查询 || typeof 查询.readSession !== 'function') {
      记账('没有 sessionQuery，跳过历史回填（新消息照常收）')
      return 0
    }
    try {
      const 全 = await 查询.readSession(配置.目标会话)
      const 事件们 = Array.isArray(全 && 全.events) ? 全.events : []
      const 要的 = []
      for (const ev of 事件们) {
        if (!ev || !ev.type) continue
        const d = ev.data || {}
        if (ev.type === 'user/message') {
          const src = d.source || (d.message && d.message.source) || {}
          if (!该显示(src.kind)) continue
          const t = 提取正文(d.message)
          if (t) 要的.push({ role: 'user', text: t, dedupe: d.message && d.message.id ? 'msg:' + String(d.message.id) : 'evt:' + ev.seq, turn: null })
        } else if (ev.type === 'assistant/message') {
          const t = 提取正文(d.message)
          if (t && !d.interrupted) 要的.push({ role: 'assistant', text: t, dedupe: '', turn: d.turn == null ? null : String(d.turn) })
        }
      }
      const 尾 = 要的.slice(-n)
      let 加了几条 = 0
      for (const 条 of 尾) {
        const 前 = 库.最后seq
        const seq = 库.加({ ...条, ts: Date.now() })
        if (seq && seq > 前) 加了几条 += 1
      }
      记账(`历史回填：看了 ${事件们.length} 个事件，补进 ${加了几条} 条`)
      return 加了几条
    } catch (e) {
      记账('历史回填失败：' + String((e && e.message) || e))
      return 0
    }
  }

  // ---------- 发：一句话投进目标会话 ----------

  async function 投一句(正文, clientId) {
    const 净 = String(正文 || '').trim()
    if (!净) return { ok: false, say: '空消息不发' }
    const agent = 找agent(配置.目标会话)
    if (!agent) {
      return { ok: false, say: `目标会话现在没活着（${会话键(配置.目标会话).slice(0, 8)}…）：先在电脑上把它打开` }
    }
    const id = clientId ? `wl-${String(clientId).slice(0, 64)}` : `wl-${randomUUID()}`
    const seq = 库.加({ role: 'user', text: 净, ts: Date.now(), dedupe: 'msg:' + id, via: 'phone' })
    // 立起「这一轮是手机的」标记，收助手时据此标来源，turn/end 放倒
    待回手机 = true
    if (seq) 我发的.set(id, seq)
    try {
      // ⚠ 必须 await：followup 的 reject 没接住会让整个宿主退出
      await agent.followup({
        id,
        role: 'user',
        content: [{ type: 'text', text: 净 }],
        source: { kind: 'whaletter-chat', device: 'phone' },
      })
      try {
        if (ctx.sessions && typeof ctx.sessions.flush === 'function') await ctx.sessions.flush(agent.session)
      } catch (e) {}
      记账(`投进去了一句（${净.length} 字）→ ${会话键(配置.目标会话).slice(0, 8)}…`)
      return { ok: true, seq, id, say: '投进去了' }
    } catch (e) {
      记账('followup 失败：' + String((e && e.message) || e))
      return { ok: false, say: 'followup 失败：' + String((e && e.message) || e) }
    }
  }

  // ---------- HTTP ----------

  const 回JSON = (res, code, o) => {
    try {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(o))
    } catch (e) {}
  }

  const 读体 = async (req, 上限 = 1_000_000) => {
    // ⚠ 一定按字节收完再转字符串：一块块 += 会把多字节汉字从中间截断，变成一串 �
    const 块们 = []
    let 长 = 0
    try {
      for await (const 块 of req) {
        块们.push(Buffer.isBuffer(块) ? 块 : Buffer.from(String(块)))
        长 += 块们[块们.length - 1].length
        if (长 > 上限) break
      }
    } catch (e) {}
    try { return JSON.parse(Buffer.concat(块们).toString('utf8') || '{}') } catch (e) { return {} }
  }

  function 发文件(req, res, 相对) {
    const 全 = resolve(join(静态目录, 相对))
    if (!全.startsWith(resolve(静态目录) + sep) && 全 !== resolve(静态目录)) {
      回JSON(res, 403, { ok: false, say: '不让出这个文件' })
      return
    }
    if (!existsSync(全) || !statSync(全).isFile()) {
      回JSON(res, 404, { ok: false, say: '没有这个文件：' + 相对 })
      return
    }
    const 类 = MIME[extname(全).toLowerCase()] || 'application/octet-stream'
    const 头 = {
      'content-type': 类,
      // 壳和 sw 不能缓存，不然改完手机上还是老的
      'cache-control': /\.(html|webmanifest)$/.test(全) || 相对 === 'sw.js' ? 'no-store' : 'public, max-age=60, must-revalidate',
      'service-worker-allowed': '/',
    }
    try {
      const 内容 = readFileSync(全)
      res.writeHead(200, { ...头, 'content-length': 内容.length })
      res.end(内容)
    } catch (e) {
      回JSON(res, 500, { ok: false, say: '读不出来：' + String((e && e.message) || e) })
    }
  }

  /** 令牌闸：全部 /api/* 都过这里（login 除外） */
  function 过闸(req, url) {
    const 头 = String(req.headers['x-lanxi-token'] || '')
    const 参 = String(url.searchParams.get('t') || '')
    return 令牌对(头, 配置.访问令牌) || 令牌对(参, 配置.访问令牌)
  }

  /** 登录失败次数闸（同一 IP 10 分钟 20 次） */
  const 登录失败 = new Map()
  function 登录太频繁(ip) {
    const 现 = Date.now()
    const 记 = 登录失败.get(ip) || { n: 0, t: 现 }
    if (现 - 记.t > 10 * 60 * 1000) { 记.n = 0; 记.t = 现 }
    return 记.n >= 20
  }
  function 记失败(ip) {
    const 现 = Date.now()
    const 记 = 登录失败.get(ip) || { n: 0, t: 现 }
    if (现 - 记.t > 10 * 60 * 1000) { 记.n = 0; 记.t = 现 }
    记.n += 1
    登录失败.set(ip, 记)
  }

  async function 处理(req, res, 来源 = 'dsh') {
    const url = new URL(req.url || '/', 'http://x')
    let 路径 = url.pathname
    if (来源 === 'dsh') {
      if (路径 === 挂载前缀) {
        // 差一个斜杠：补上，不然页面里的相对路径会掉到别处
        res.writeHead(301, { location: 挂载前缀 + '/' })
        res.end()
        return
      }
      if (路径.startsWith(挂载前缀)) 路径 = 路径.slice(挂载前缀.length) || '/'
    }
    if (!路径.startsWith('/')) 路径 = '/' + 路径

    // --- 静态壳（不需要令牌：里面没有任何秘密） ---
    if (!路径.startsWith('/api/')) {
      const 相对 = 路径 === '/' ? 'index.html' : decodeURIComponent(路径.slice(1))
      return 发文件(req, res, 相对)
    }

    const ip = String((req.socket && req.socket.remoteAddress) || '')

    // --- 登录 ---
    if (路径 === '/api/login' && req.method === 'POST') {
      if (登录太频繁(ip)) return 回JSON(res, 429, { ok: false, say: '试太多次了，过十分钟再来' })
      const 来 = await 读体(req)
      if (令牌对(String(来.token || ''), 配置.访问令牌)) {
        登录失败.delete(ip)
        return 回JSON(res, 200, { ok: true, say: '进来了', name: 配置.助手名 })
      }
      记失败(ip)
      return 回JSON(res, 401, { ok: false, say: '令牌不对' })
    }

    // --- 其余一律要令牌 ---
    if (!过闸(req, url)) return 回JSON(res, 401, { ok: false, say: '没有令牌' })

    if (路径 === '/api/state') {
      const agent = 找agent(配置.目标会话)
      return 回JSON(res, 200, {
        ok: true,
        版本,
        name: 配置.助手名,
        称呼: 配置.称呼,
        target: { id: 配置.目标会话, title: 会话标题() || '' },
        alive: !!agent,
        lastSeq: 库.最后seq,
        count: 库.全部.length,
        记录文件,
        手机监听: 配置.手机监听,
        手机端口: 配置.手机端口,
        来源,
      })
    }

    if (路径 === '/api/messages') {
      const after = Number(url.searchParams.get('after') || 0) || 0
      const before = Number(url.searchParams.get('before') || 0) || 0
      const tail = Number(url.searchParams.get('tail') || 0) || 0
      // 手机默认只看自己这条线；想看全部就带 via=all
      const viaParam = url.searchParams.get('via')
      const via = viaParam === 'all' ? '' : (viaParam || 'phone')
      const agent = 找agent(配置.目标会话)
      return 回JSON(res, 200, {
        ok: true,
        target: { id: 配置.目标会话, title: 会话标题() || '' },
        alive: !!agent,
        lastSeq: 库.最后seq,
        messages: 库.取({ after, before, tail, via }),
      })
    }

    if (路径 === '/api/send' && req.method === 'POST') {
      const 来 = await 读体(req)
      const 正文 = typeof 来.text === 'string' ? 来.text : ''
      if (正文.length > 8000) return 回JSON(res, 200, { ok: false, say: '太长了，8000 字以内' })
      const 结果 = await 投一句(正文, 来.clientId)
      if (!结果.ok) return 回JSON(res, 200, { ok: false, say: 结果.say })
      return 回JSON(res, 200, {
        ok: true,
        lastSeq: 库.最后seq,
        messages: 库.取({ after: Math.max(0, 结果.seq - 1) }).slice(0, 5),
      })
    }

    // 我从电脑这边主动说一句，直接落进手机那条线。
    // 跟 /api/send 相反：那条是把手机的话投进 DSH，这条是把我的话投给手机。
    // 标 via:'phone' 手机才看得见，polling 一拉到就弹通知。
    if (路径 === '/api/say' && req.method === 'POST') {
      const 来 = await 读体(req)
      const 正文 = typeof 来.text === 'string' ? 来.text.trim() : ''
      if (!正文) return 回JSON(res, 200, { ok: false, say: '空的没发' })
      if (正文.length > 8000) return 回JSON(res, 200, { ok: false, say: '太长了，8000 字以内' })
      const seq = 库.加({
        role: 'assistant',
        text: 正文,
        ts: Date.now(),
        dedupe: '',
        turn: null,
        via: 'phone',
      })
      记账(`我主动说了一句（${正文.length} 字）→ seq ${seq}`)
      return 回JSON(res, 200, { ok: true, seq, lastSeq: 库.最后seq })
    }

    // 手机上的「删除聊天记录」：把库清干净。seq 不回退，接着往下编
    if (路径 === '/api/clear' && req.method === 'POST') {
      const 结果 = 库.清空()
      if (!结果.ok) return 回JSON(res, 500, 结果)
      return 回JSON(res, 200, { ok: true, 清了: 结果.清了, lastSeq: 库.最后seq })
    }

    if (路径 === '/api/sessions') {
      const 出 = []
      try {
        const 会话服务 = ctx.get('sessions')
        const 标题服务 = ctx.get('sessionTitle')
        if (会话服务 && typeof 会话服务.list === 'function') {
          for (const s of 会话服务.list()) {
            let 标题 = ''
            try {
              const 快照 = 标题服务 && typeof 标题服务.get === 'function' ? 标题服务.get(s) : undefined
              标题 = (快照 && 快照.title) || ''
            } catch (e) {}
            出.push({ id: String(s.id), title: 标题 })
          }
        }
      } catch (e) {}
      return 回JSON(res, 200, { ok: true, sessions: 出.slice(0, 100), current: 配置.目标会话 })
    }

    if (路径 === '/api/target' && req.method === 'POST') {
      const 来 = await 读体(req)
      const 新 = String(来.session || '').trim()
      if (!新) return 回JSON(res, 200, { ok: false, say: '给一个会话 id' })
      配置 = 归一化({ ...配置, 目标会话: 新 })
      写配置(配置文件, 配置)
      记账('目标会话换成：' + 新)
      // 回填要的话自己说（换会话时默认不灌一屏旧记录进手机）
      if (来.backfill === true) void 回填()
      return 回JSON(res, 200, { ok: true, target: { id: 配置.目标会话, title: 会话标题() || '' } })
    }

    // --- 热更新：手机端下新的 JS bundle，不用装新包 ---
    // bundle 放在 <根目录>/更新/bundle/index.android.bundle，旁边一个 version.json 写版本号。
    if (路径 === '/api/upload' && req.method === 'POST') {
      // 手机发来的图片/文件：收下存盘，把绝对路径回给手机，
      // 手机再把「[图片] <路径>」当成一条普通消息发过来，我这边就能直接读。
      const 上限 = 12_000_000
      const 来 = await 读体(req, 上限 * 1.4)
      const b64 = String(来.data || '')
      if (!b64) return 回JSON(res, 400, { ok: false, say: '没有文件' })
      let 数据 = null
      try {
        数据 = Buffer.from(b64, 'base64')
      } catch (e) {
        数据 = null
      }
      if (!数据 || !数据.length) return 回JSON(res, 400, { ok: false, say: '文件读不出来' })
      if (数据.length > 上限) {
        return 回JSON(res, 413, { ok: false, say: `太大了，上限 ${Math.round(上限 / 1e6)}MB` })
      }
      const 原名 = String(来.name || 'file')
      const 干净 = 原名.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(-60) || 'file'
      const 目录 = join(配置.根目录, 'data', 'inbox')
      try {
        mkdirSync(目录, { recursive: true })
      } catch (e) {}
      const 文件名 = `${Date.now()}-${干净}`
      const 全路径 = join(目录, 文件名)
      try {
        writeFileSync(全路径, 数据)
      } catch (e) {
        return 回JSON(res, 500, { ok: false, say: '存不下来：' + String((e && e.message) || e) })
      }
      return 回JSON(res, 200, {
        ok: true,
        path: 全路径,
        name: 干净,
        size: 数据.length,
        type: String(来.type || ''),
      })
    }

    if (路径 === '/api/file') {
      // 手机看自己发过的图：只许读 data/inbox 下的文件
      const 名 = url.searchParams.get('n') || ''
      if (!名 || 名.includes('/') || 名.includes('\\') || 名.includes('..')) {
        return 回JSON(res, 400, { ok: false, say: '名字不对' })
      }
      const 全 = join(配置.根目录, 'data', 'inbox', 名)
      let 数据 = null
      try {
        数据 = readFileSync(全)
      } catch (e) {
        数据 = null
      }
      if (!数据) return 回JSON(res, 404, { ok: false, say: '没有这个文件' })
      const 类型 = MIME[extname(全).toLowerCase()] || 'application/octet-stream'
      res.writeHead(200, {
        'content-type': 类型,
        'content-length': 数据.length,
        'cache-control': 'private, max-age=3600',
      })
      res.end(数据)
      return
    }

    if (路径 === '/api/memes') {
      // 表情包图库：借 dsh-meme 插件的只读取图服务。
      // 它没装或没起来就回 has:false，手机端把表情按钮灰掉，不影响聊天。
      const 服务 = ctx.get('dshMeme')
      if (!服务 || typeof 服务.search !== 'function') {
        return 回JSON(res, 200, { ok: true, has: false, memes: [], tags: [] })
      }
      const tag = url.searchParams.get('tag') || ''
      const query = url.searchParams.get('q') || ''
      const limit = Number(url.searchParams.get('limit') || 40) || 40
      try {
        const r = 服务.search({ query, tag, limit })
        const 列表 = ((r && r.memes) || []).map((m, i) => ({
          i,
          tag: m.tag || '',
          caption: m.caption || '',
          keywords: m.keywords || '',
          pack: m.pack || '',
          packName: m.packName || '',
          // 不要把磁盘绝对路径交给手机，给个序号，取图走 /api/meme
          url: `/api/meme?i=${i}&tag=${encodeURIComponent(tag)}&q=${encodeURIComponent(query)}&limit=${limit}`,
        }))
        // 记住这批的顺序，取图时按同样的参数再查一次，避免暴露路径
        return 回JSON(res, 200, { ok: true, has: true, tags: ['happy', 'angry', 'sad', 'shy', 'confused', 'daily'], memes: 列表 })
      } catch (e) {
        return 回JSON(res, 200, { ok: true, has: false, memes: [], say: String((e && e.message) || e) })
      }
    }

    if (路径 === '/api/meme') {
      const 服务 = ctx.get('dshMeme')
      if (!服务 || typeof 服务.search !== 'function') return 回JSON(res, 404, { ok: false })
      const tag = url.searchParams.get('tag') || ''
      const query = url.searchParams.get('q') || ''
      const limit = Number(url.searchParams.get('limit') || 40) || 40
      const i = Number(url.searchParams.get('i') || 0) || 0
      let 路径们 = []
      try {
        const r = 服务.search({ query, tag, limit })
        路径们 = ((r && r.memes) || []).map((m) => m.path)
      } catch (e) {
        路径们 = []
      }
      const 目标 = 路径们[i]
      if (!目标) return 回JSON(res, 404, { ok: false, say: '没这张' })
      // 只许读图库目录里的文件，别的一概不放。
      // 三个根：用户图库、内置图库（插件包内）、其它 profile 下的插件目录。
      const DSH = join(homedir(), '.dsh')
      const 允许根 = [
        join(DSH, 'meme-packs'),
        join(DSH, 'profiles'),
        join(包根, '..', 'dsh-meme'),
      ]
      const 真 = resolve(目标)
      if (!允许根.some((root) => 真.startsWith(resolve(root)))) {
        return 回JSON(res, 403, { ok: false, say: '这个路径不给', p: 真 })
      }
      let 数据 = null
      try {
        数据 = readFileSync(真)
      } catch (e) {
        数据 = null
      }
      if (!数据) return 回JSON(res, 404, { ok: false, say: '读不到' })
      const 扩展 = extname(真).toLowerCase()
      const 类型 = MIME[扩展] || 'application/octet-stream'
      res.writeHead(200, {
        'content-type': 类型,
        'content-length': 数据.length,
        'cache-control': 'private, max-age=86400',
      })
      res.end(数据)
      return
    }

    // 更新包只有一处：public/update/。静态路由 /update/* 和应用里的 updater 都取这儿，
    // 这两个 API 是给不方便直连静态路径的场合用的，必须跟静态同源，不能再指第二个目录
    const 更新目录 = join(配置.根目录, 'public', 'update')

    if (路径 === '/api/update/check') {
      let 信息 = null
      try {
        信息 = JSON.parse(readFileSync(join(更新目录, 'version.json'), 'utf8'))
      } catch (e) {
        信息 = null
      }
      if (!信息) return 回JSON(res, 200, { ok: true, has: false })
      const bundlePath = join(更新目录, 'index.android.bundle')
      let 大小 = 0
      try {
        大小 = statSync(bundlePath).size
      } catch (e) {
        大小 = 0
      }
      if (!大小) return 回JSON(res, 200, { ok: true, has: false })
      return 回JSON(res, 200, {
        ok: true,
        has: true,
        version: 信息.version || '',
        note: 信息.note || '',
        size: 大小,
        url: '/api/update/bundle',
        sha256: 信息.sha256 || '',
      })
    }

    if (路径 === '/api/update/bundle') {
      const bundlePath = join(更新目录, 'index.android.bundle')
      let 数据 = null
      try {
        数据 = readFileSync(bundlePath)
      } catch (e) {
        数据 = null
      }
      if (!数据) return 回JSON(res, 404, { ok: false, say: '还没有更新包' })
      res.writeHead(200, {
        'content-type': 'application/javascript; charset=utf-8',
        'content-length': 数据.length,
        'cache-control': 'no-store',
      })
      res.end(数据)
      return
    }

    if (路径 === '/api/debug') {
      return 回JSON(res, 200, {
        ok: true,
        版本,
        目标会话: 配置.目标会话,
        alive: !!找agent(配置.目标会话),
        记录条数: 库.全部.length,
        最后seq: 库.最后seq,
        sessionQuery: !!ctx.get('sessionQuery'),
        账: 事件账.slice(-40),
      })
    }

    return 回JSON(res, 404, { ok: false, say: '没有这个接口：' + 路径 })
  }

  // ---------- 挂到 DSH 的 Web 服务 ----------

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: 挂载前缀,
      handler: async (req, res) => {
        try {
          await 处理(req, res, 'dsh')
        } catch (e) {
          try {
            if (!res.headersSent) 回JSON(res, 500, { ok: false, say: String((e && e.message) || e) })
            else res.end()
          } catch (e2) {}
        }
      },
    })
  , 'lanxi-chat: 页面和接口')

  // ---------- 手机那个口（只走局域网；不给公网） ----------

  ctx.effect(() => {
    if (!配置.手机监听) return () => {}
    const 服务 = http.createServer((req, res) => {
      void 处理(req, res, 'lan').catch(() => {
        try { res.writeHead(500); res.end() } catch (e) {}
      })
    })
    服务.on('error', (e) => 记账('手机端口起不来（' + 配置.手机端口 + '）：' + String((e && e.message) || e)))
    try {
      服务.listen(配置.手机端口, '0.0.0.0', () => 记账(`手机端口已在听：0.0.0.0:${配置.手机端口}`))
    } catch (e) {
      记账('手机端口 listen 出错：' + String((e && e.message) || e))
    }
    服务实例 = 服务
    return () => {
      try { 服务.close() } catch (e) {}
      服务实例 = null
    }
  }, 'lanxi-chat: 手机端口')

  // ---------- 盯会话 ----------

  ctx.effect(() => {
    const 摘 = ctx.on('session/event', (session, event) => {
      try {
        看事件(session, event)
      } catch (e) {
        记账('事件处理出错：' + String((e && e.message) || e))
      }
    })
    return () => {
      try { if (typeof 摘 === 'function') 摘() } catch (e) {}
    }
  }, 'lanxi-chat: 盯目标会话')

  // 开机先补一段旧的，再定期压实记录
  ctx.effect(() => {
    const 头 = setTimeout(() => { void 回填() }, 2500)
    return () => clearTimeout(头)
  }, 'lanxi-chat: 历史回填')

  ctx.effect(() => {
    if (typeof ctx.interval !== 'function') return () => {}
    const 停 = ctx.interval(() => { try { 库.压实() } catch (e) {} }, 10 * 60 * 1000)
    return () => { try { if (typeof 停 === 'function') 停() } catch (e) {} }
  }, 'lanxi-chat: 定期压实记录')

  记账(`装好 v${版本}｜目标会话 ${会话键(配置.目标会话).slice(0, 8)}…｜记录 ${库.全部.length} 条｜令牌在 ${配置文件}`)
  log(`就绪：${挂载前缀}/ ｜手机端口 ${配置.手机监听 ? '0.0.0.0:' + 配置.手机端口 : '关'}`)

  return {
    处理,
    投一句,
    回填,
    get 配置() { return 配置 },
    get 服务() { return 服务实例 },
    get 记录() { return 库.全部 },
    记账,
  }
}
