import React, {useMemo} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';

import {MATCH_MEMES, BundledMeme} from './memes-bundled';

/**
 * 把 `[表情: 描述]` 这段标记画成图。
 *
 * 桌面端（dsh-meme）渲染同一条标记时，是在 dafeiyu-001 那 24 张上按描述配图；
 * 这里照抄它那一套规矩，用同一份 caption/keywords、同一个顺序配 —— 只有规矩一样，
 * 两边看到的才是同一张。规矩来源：插件 client.js 里的 matchDesc / buildMemeIndex。
 *
 *   1. caption 精确（原文 / 折叠 / 紧凑 三种形态）
 *   2. keywords 精确（整串 / 逐个词，同样三种形态）
 *   3. 分词兜底：描述切成词，在每张图的 caption+关键词里找包含，最长命中优先，同长比命中数
 *
 * 图全在安装包里，不走网络，没连电脑也画得出来。
 */

/** 引号归一、空白压成一个空格 */
const fold = (s: string) =>
  String(s || '')
    .trim()
    .replace(/[\u201c\u201d\u2018\u2019\u300c\u300d\u300e\u300f«»]/g, '"')
    .replace(/\s+/g, ' ');

/** 再去掉引号和空白，用来吃掉「多一个空格 / 全角引号」这类差别 */
const loose = (s: string) => fold(s).replace(/["'\s]/g, '');

/** 按中英标点切词，两字以下的太泛、不参与匹配，长词优先 */
const tokens = (s: string) =>
  fold(s)
    .split(/[\s,.!?;:、，。！？；：""''()（）\[\]【】《》…·～~\-]+/)
    .map(t => t.replace(/["']/g, ''))
    .filter(t => t.length >= 2)
    .sort((a, b) => b.length - a.length);

/** 同 key 先到先得，后到的不覆盖——跟桌面端一致（内置包排前面） */
function 建索引() {
  const capIdx = new Map<string, BundledMeme>();
  const kwIdx = new Map<string, BundledMeme>();
  const 放 = (m: Map<string, BundledMeme>, key: string, row: BundledMeme) => {
    const raw = String(key || '').trim();
    if (!raw) return;
    for (const form of new Set([raw, fold(raw), loose(raw)])) {
      if (form && !m.has(form)) m.set(form, row);
    }
  };
  for (const row of MATCH_MEMES) {
    放(capIdx, row.caption, row);
    放(capIdx, String(row.caption || '').slice(0, 80), row);
    放(capIdx, String(row.caption || '').slice(0, 100), row);
    放(kwIdx, row.keywords, row);
    for (const w of String(row.keywords || '').split(/\s+/)) 放(kwIdx, w, row);
  }
  // 分词兜底用的底子：caption + 关键词
  const search = MATCH_MEMES.map(row => {
    const hay: string[] = [];
    for (const s of [row.caption, row.keywords]) {
      const f = fold(s);
      if (!f) continue;
      const l = loose(s);
      hay.push(f, ...(l && l !== f ? [l] : []));
    }
    return {hay, tokens: [...new Set(tokens([row.caption, row.keywords].join(' ')))], row};
  });
  return {capIdx, kwIdx, search};
}

const 索引 = 建索引();

function 找图(desc: string): BundledMeme | null {
  const raw = String(desc || '').trim();
  if (!raw) return null;

  // ① caption 精确 → ② keywords 精确
  const forms = [raw, fold(raw), loose(raw)];
  for (const map of [索引.capIdx, 索引.kwIdx]) {
    for (const f of forms) {
      const hit = map.get(f);
      if (hit) return hit;
    }
  }

  // ③ 分词兜底
  const needles = [...new Set(tokens(raw).map(loose).filter(Boolean))];
  if (!needles.length) return null;

  let best: BundledMeme | null = null;
  let bestLen = 0;
  let bestCount = 0;
  for (const row of 索引.search) {
    let longest = 0;
    let count = 0;
    for (const needle of needles) {
      let len = row.hay.some(h => h.includes(needle)) ? needle.length : 0;
      for (const t of row.tokens) {
        const tt = loose(t);
        if (tt && (needle.includes(tt) || tt.includes(needle))) {
          len = Math.max(len, Math.min(needle.length, tt.length));
        }
      }
      if (len) {
        longest = Math.max(longest, len);
        count += 1;
      }
    }
    if (longest > bestLen || (longest === bestLen && count > bestCount)) {
      best = row.row;
      bestLen = longest;
      bestCount = count;
    }
  }
  return best;
}

type Props = {
  desc: string;
  dim: string;
  /** 点图放大看（没有就只是张图） */
  onOpen?: (src: string) => void;
};

export function MarkedMeme({desc, dim, onOpen}: Props) {
  const item = useMemo(() => 找图(desc), [desc]);

  if (item) {
    const 图 = (
      <Image source={{uri: item.src}} style={styles.img} resizeMode="contain" />
    );
    return onOpen ? (
      <Pressable onPress={() => onOpen(item.src)}>{图}</Pressable>
    ) : (
      图
    );
  }

  // 真配不上就老实写一句人话，别把那串方括号标记甩给人看
  return (
    <View style={styles.fallback}>
      <Text style={{color: dim, fontSize: 12, fontStyle: 'italic'}}>[表情] {desc}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  img: {width: 132, height: 132, borderRadius: 10},
  fallback: {paddingVertical: 4, paddingHorizontal: 2, maxWidth: 200},
});
