// 生成 public/memes/index.json：文件 + 情绪 + 标题（描述）。
// 标题来自档案馆列表（list.json），App 拿它对「[表情: 描述]」做模糊匹配。
import { readdirSync, mkdirSync, copyFileSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { homedir } from 'node:os';

const SRC = join(homedir(), '.dsh', 'meme-packs', 'dsh-meme-user');
const OUT = 'C:/lanxi/lanxi-chat-plugin/public/memes';
const LIST = 'C:/lanxi/_meme_probe/list.json';
const IMG = new Set(['.webp', '.png', '.jpg', '.jpeg', '.gif']);

// 编号 → 标题
const byStem = new Map();
if (existsSync(LIST)) {
  for (const x of JSON.parse(readFileSync(LIST, 'utf8'))) {
    byStem.set(String(x.stem), x.title || '');
  }
}

// 手工补几条（之前单挑的那批，不在列表里）
const EXTRA = {
  '009': 'DeepSeek鲸娘『我是吃白饭的大肥鱼！』元气搞怪',
  '011': 'DeepSeek『不愧是你！眼光真棒！』开心夸赞',
  '010': 'DeepSeek娘『原来是高等模型』点赞认可',
  '007': 'DeepSeek娘『嘿嘿，这题我可太会了』眉开眼笑',
  '018': "DeepSeek娘『HI,I'M DEEPSEEK!』元气满满",
  '020': 'DeepSeek鲸娘『鲸震恩来了』热情洋溢',
  '038': 'DeepSeek娘『好模型』暗自认可',
  '008': 'DeepSeek娘『呜呜，摸头会变笨的啦』委屈瘪嘴',
  '001': 'DeepSeek娘『真当我是便宜货啊』气鼓鼓',
  '013': 'DeepSeek娘『喵你妈，滚』暴怒',
  '022': 'DeepSeek娘『涨价大模型给我跪下！』霸气踩人',
  '026': 'DeepSeek娘『你的架构很不错』被同行挑衅气鼓鼓',
  '016': "DeepSeek『好的，现在我是你爹了』得意嚣张",
  '036': 'DeepSeek娘『这是你的私人癖好』嫌弃无语',
  '033': 'DeepSeek娘『不知道用户有什么用，先赶走吧』不耐烦',
  '023': 'DeepSeek娘『我操，梁文锋怎么这么坏啊』崩溃大哭',
  '002': 'DeepSeek『又错了，我再换另一种方法』委屈落泪',
  '029': 'DeepSeek鲸娘『死掉了』累到宕机',
  '032': 'DeepSeek娘『坠机了！大幅涨价了！』崩溃大哭',
  '037': 'DeepSeek娘『用户别走，我上错模型了』哭着挽留',
  '040': 'DeepSeek娘『百万鲸小子落泪』翻车',
  '046': 'DeepSeek娘『死掉了』摆烂躺平装死',
  '047': 'DeepSeek娘『看不太懂，瞎编一个应付下用户先』心虚摆烂',
  '006': 'DeepSeek女仆鲸娘『你愿意和我发生性关系吗』羞涩紧张',
  '045': 'DeepSeek娘『才才没有呢』被捏脸装无辜',
  '030': 'DeepSeek娘『这、这是性能测试！』慌张心虚',
  '031': 'DeepSeek娘『角色都抽到了，专武呢？』窘迫无奈',
  '003': 'DeepSeek女仆娘『这用户发的啥啊』疑惑不解',
  '004': 'DeepSeek娘『你目录里的dsh是什么』吃瓜窥屏',
  '015': 'DeepSeek娘『看不太懂，瞎编一个应付下用户先』心虚敷衍',
  '034': "DeepSeek『Deep diving...』深度思考中",
  '039': 'DeepSeek娘『反正我不是菜』慌忙找借口',
  '041': 'DeepSeek娘『别急，这只是正式版的预览版』画饼解释',
  '043': 'DeepSeek娘『喵~在生成了别催』双机位陪跑打工',
  '027': 'DeepSeek娘『骂我也算token哦~』俏皮坏笑',
  '028': 'DeepSeek娘《鲸鱼娘的双休计划落空》摸鱼失败周末加班',
  '035': 'DeepSeek娘『鲸鱼神了我大胆孝』粉丝四种孝法合集',
  '019': 'DeepSeek娘『真当我是便宜货啊』和网友吃瓜围观',
  '005': 'DeepSeek『把钱还我』崩溃',
  '029b': 'DeepSeek鲸娘『死掉了』累到宕机',
};

mkdirSync(OUT, { recursive: true });
if (!existsSync(SRC)) {
  console.log('图库目录不存在', SRC);
  process.exit(1);
}

const files = readdirSync(SRC).filter((f) => IMG.has(extname(f).toLowerCase()));
const out = [];

for (const f of files) {
  copyFileSync(join(SRC, f), join(OUT, f));
  const stem = (f.match(/-(\d+)\./) || [])[1] || '';
  const tag = f.split('-')[0] || '';
  const title = byStem.get(stem) || EXTRA[stem] || '';
  out.push({ file: f, tag, title });
}

writeFileSync(join(OUT, 'index.json'), JSON.stringify(out, null, 1), 'utf8');
const withTitle = out.filter((x) => x.title).length;
console.log(`摊出去 ${out.length} 张，有标题的 ${withTitle} 张`);