// 聊天记录：一行一条的 JSONL（add / patch 两种操作），查的时候在内存里合成视图。
// 为什么不是直接改行：JSONL 只追加最省事，也不会在写一半时毁掉整份记录。
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const 上限默认 = 5000

export function 开一个库({ 文件, 保留 = 上限默认, 日志 = () => {} }) {
  /** 合成后的完整视图，按 seq 升序 */
  let 条目 = []
  let 下一个 = 1
  /** 去重键 → seq（同一条消息从两个地方来，只留一条） */
  const 去重 = new Map()
  /** 轮号 → seq（assistant 一轮里可能出好几条，最后一条盖前面那条） */
  const 轮表 = new Map()
  let 行数 = 0

  function 读() {
    try {
      if (!existsSync(文件)) return
      const 文本 = readFileSync(文件, 'utf8')
      const 行们 = 文本.split('\n')
      for (const 行 of 行们) {
        if (!行.trim()) continue
        let 记
        try { 记 = JSON.parse(行) } catch { continue }
        应用(记, false)
        行数 += 1
      }
      // 老记录里没有 via 字段（11/13 才开始写的）。读完之后按「谁问的」补一遍：
      // 手机发过的话，去重键是 msg:lanxi-*，能认出来；assistant 跟着上一条 user 走。
      let 当前 = 'dsh'
      for (const 条 of 条目) {
        if (条.role === 'user') {
          当前 = 条.via === 'phone' ? 'phone' : 'dsh'
        } else if (条.via !== 'phone' && 当前 === 'phone') {
          条.via = 'phone'
        }
      }
    } catch (e) {
      日志('读聊天记录失败：' + String((e && e.message) || e))
    }
  }

  function 应用(记, 落盘) {
    if (!记 || typeof 记 !== 'object') return
    if (记.op === 'add' && 记.seq) {
      if (记.dedupe) {
        const 旧 = 去重.get(记.dedupe)
        if (旧) return 旧
      }
      const 条 = { seq: 记.seq, role: 记.role === 'user' ? 'user' : 'assistant', text: String(记.text || ''), ts: Number(记.ts) || Date.now() }
      // via：这条是从哪条线上来的（phone = 手机 App，dsh = 电脑上的会话）。
      // 手机端默认只看 phone 那条线，所以这个字段得一直带着走。
      // 老记录没这个字段，靠去重键 msg:lanxi-* 认出来是手机发的。
      条.via =
        记.via === 'phone' || String(记.dedupe || '').startsWith('msg:lanxi-')
          ? 'phone'
          : 'dsh'
      条目.push(条)
      if (记.dedupe) 去重.set(记.dedupe, 条.seq)
      if (typeof 记.turn === 'number' || typeof 记.turn === 'string') {
        if (条.role === 'assistant') 轮表.set(String(记.turn), 条.seq)
      }
      return 条.seq
    }
    if (记.op === 'patch' && 记.seq) {
      const 条 = 条目.find((x) => x.seq === 记.seq)
      if (!条) return
      if (typeof 记.text === 'string' && 记.text.trim()) 条.text = 记.text
      if (记.ts) 条.ts = Number(记.ts)
    }
  }

  function 追加(记) {
    try {
      mkdirSync(dirname(文件), { recursive: true })
      appendFileSync(文件, JSON.stringify(记) + '\n', 'utf8')
      行数 += 1
    } catch (e) {
      日志('写聊天记录失败：' + String((e && e.message) || e))
    }
  }

  /** 加一条。往返 true 的是新加的 seq；命中去重时返回原来那条的 seq。 */
  function 加({ role, text, ts = Date.now(), dedupe = '', turn = null, via = '' }) {
    const 净 = String(text == null ? '' : text)
    if (!净.trim()) return null
    if (dedupe && 去重.has(dedupe)) return 去重.get(dedupe)
    if (role === 'assistant' && turn != null && 轮表.has(String(turn))) {
      const 旧 = 轮表.get(String(turn))
      改(旧, 净, ts)
      return 旧
    }
    // 没明说来源的 assistant 回合，跟着最近一条 user 走——
    // 这样「手机上问 → 我答」整轮都算 phone，电脑上聊的不会漏进手机那一栏。
    let 来源 = via
    if (!来源) {
      if (role === 'assistant') {
        for (let i = 条目.length - 1; i >= 0; i--) {
          if (条目[i].role === 'user') {
            来源 = 条目[i].via === 'phone' ? 'phone' : 'dsh'
            break
          }
        }
      }
      来源 = 来源 || 'dsh'
    }
    const seq = 下一个++
    const 记 = { op: 'add', seq, role, text: 净, ts, dedupe, turn, via: 来源 }
    应用(记, false)
    追加(记)
    if (dedupe) 去重.set(dedupe, seq)
    return seq
  }

  function 改(seq, text, ts) {
    const 记 = { op: 'patch', seq, text, ts }
    应用(记, false)
    追加(记)
  }

  // 读盘
  读()
  for (const 条 of 条目) if (条.seq >= 下一个) 下一个 = 条.seq + 1
  条目.sort((a, b) => a.seq - b.seq)
  // 去重表重建（读盘时不带 dedupe，这里按文本+时间粗对一次，够用）
  if (条目.length > 保留) {
    条目 = 条目.slice(-保留)
  }

  return {
    get 全部() { return 条目.slice() },
    get 最后seq() { return 下一个 - 1 },
    加,
    改,
    /** 从 after 之后取（不含 after）；after=0 取最后一屏；via 指定就只取那一条线 */
    取({ after = 0, before = 0, tail = 0, via = '' } = {}) {
      const 池 = via ? 条目.filter((x) => x.via === via) : 条目
      // 往前翻页：比 before 更早的、最近的 tail 条（手机往上翻到顶时用）
      if (before > 0) {
        const 早于 = 池.filter((x) => x.seq < before)
        return tail > 0 ? 早于.slice(-tail) : 早于
      }
      if (!after && tail > 0) return 池.slice(-tail)
      return 池.filter((x) => x.seq > after)
    },
    /** 清空聊天记录。seq 计数器不重置——接着往下编，免得旧号码被复用又对不上 */
    清空() {
      const 条数 = 条目.length
      条目 = []
      行数 = 0
      try {
        mkdirSync(dirname(文件), {recursive: true})
        // 清之前先留一份：真删错了还能从备份扒回来，不指望他记得住
        if (条数 > 0 && existsSync(文件)) {
          const 备份 = `${文件}.bak-${new Date().toISOString().slice(0, 10)}`
          try {
            copyFileSync(文件, 备份)
            日志(`清空前留了备份：${备份}`)
          } catch (e) {}
        }
        writeFileSync(文件, '', 'utf8')
      } catch (e) {
        日志('清空聊天记录失败：' + String((e && e.message) || e))
        return {ok: false, say: '写不进去'}
      }
      return {ok: true, 清了: 条数}
    },
    /** 条目太多时压一遍，别让文件无限长 */
    压实() {
      if (条目.length <= 保留) return
      条目 = 条目.slice(-保留)
      const 临 = 文件 + '.tmp'
      try {
        mkdirSync(dirname(文件), { recursive: true })
        writeFileSync(临, 条目.map((x) => JSON.stringify({ op: 'add', seq: x.seq, role: x.role, text: x.text, ts: x.ts })).join('\n') + '\n', 'utf8')
        renameSync(临, 文件)
        行数 = 条目.length
      } catch (e) {
        日志('压实聊天记录失败：' + String((e && e.message) || e))
      }
    },
    get 行数() { return 行数 },
  }
}
