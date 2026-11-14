/** 存在手机本地的那些键：都在这里，改名字只改一处 */
export const KEY_SERVER = 'jingwu.server';
export const KEY_TOKEN = 'jingwu.token';
export const KEY_THEME = 'jingwu.theme';
/** 有几条线（每个联系人都是一条线：名字 + 地址 + 令牌） */
export const KEY_LINES = 'jingwu.lines';
/** 现在走的是哪一条 */
export const KEY_LINE = 'jingwu.line';
/** 自己换过的头像（data URI）；没换过就用包里那张 */
export const KEY_AVATAR = 'jingwu.avatar';
/** 聊天页背景图 */
export const KEY_BG = 'jingwu.bg';
/** 消息页背景图（跟聊天页分开存，各换各的） */
export const KEY_BG_MSG = 'jingwu.bgMsg';
/** 上次停在哪个页：杀掉后台再进来，直接回到上次那页，不用手动点账号 */
export const KEY_PAGE = 'jingwu.page';
/** 后台常驻开着没有（'1' 开 / '0' 关） */
export const KEY_ALIVE = 'jingwu.alive';
/** 清过聊天记录的话，记一个「清到这个序号」的水位；电脑上那份不动 */
export const KEY_CLEARED = 'jingwu.clearedBefore';
/**
 * 消息的本地副本，后面接这条线的 id。断网、或者还没拉回来的时候先拿它顶一下，
 * 不至于一进去白屏。
 */
export const KEY_CACHE = 'jingwu.cache';

// 开源版不带任何人的地址和令牌：第一次打开在设置页里自己填。
// 服务端就是仓库里那个插件（见 README），填你自己电脑的地址和那边生成的令牌。
export const DEFAULT_SERVER = '';
export const DEFAULT_TOKEN = '';
export const POLL_MS = 1500;
export const GAP_MS = 10 * 60 * 1000; // 隔了十分钟就插一条时间
export const PAGE = 30; // 一屏先铺多少条；往上翻到顶再多放这么多，别一次把几百条全渲染出来

/** 设置 → 说明 那一页的字。内容先占位，想好了往里补 */
export const 说明文字 = [
  '鲸笺是个自己搭的聊天 App：不经过 QQ、微信、任何平台，你的话直接进你自己的电脑。',
  '',
  '它分两半——手机上是这个壳，电脑上是一个后端（仓库里的 DSH 插件）。壳只管显示，' +
    '聊天记录全存在你自己电脑上，谁要看得先打开你那台机器。',
  '',
  '第一次用：先在自己电脑上把后端跑起来，它会给一个地址和令牌；回到这个 App，' +
    '点开侧栏 → 设置 → 账号管理，把地址和令牌填进去，就能说话了。',
  '',
  '因为这个东西是出于热爱做出来的，所以全部开源。里面的表情图、字体、' +
    '一部分插画来自网络或其他作者，如有侵犯到您的权益，请发邮件到 ' +
    '3461454026@qq.com，我会第一时间删掉。',
  '',
  '想改名字、换背景、加更多条线，都在设置里。',
  '',
  '因个人能力有限，软件许多功能并不完善，敬请谅解；如有想要的功能，可自行改造——' +
    '代码全在这儿，改动、拆开、重写都随你。',
].join('\n');

/** 对方的名字。默认「鲸鱼娘」，设置里能改 */
export const 默认名字 = '鲸鱼娘';
/** 对方名字存在哪 */
export const KEY_NAME = 'whaletter.name';

/** 默认字体：鲸落体，打在 assets/fonts/jingluo.ttf */
export const 字体 = 'jingluo';
