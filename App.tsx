/**
 * 鲸笺 / Whaletter —— 自己搭的手机聊天壳。纯 React Native 原生组件，没有 WebView、没有 Capacitor。
 *
 * 原生控件：SafeAreaView / FlatList / TextInput / KeyboardAvoidingView /
 *           Pressable / Image / ActivityIndicator / StatusBar / Animated
 * 图形：react-native-svg（鲸尾气泡尖、启动页波浪线、渐变底），不用位图代替矢量
 *
 * 配色按 C:\lanxi\ref\DESIGN-鲸屋.md 的采样色板（从立绘上采的藏青，不是海蓝）。
 * 后端是电脑上的 DSH 插件 dsh-whaletter-chat，地址和令牌都存在 AsyncStorage 里。
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  BackHandler,
  Clipboard,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, {Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop} from 'react-native-svg';
import {applyUpdate, checkUpdate, currentVersion, revert} from './updater';
import {avatar, whaleArt, whale0, whale1, whale2, seaBg} from './images';
import {MarkedMeme} from './MemeMark';
import {MemeGallery} from './MemeGallery';
import {launchImageLibrary} from 'react-native-image-picker';
import {pick, types} from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import notifee, {AndroidImportance} from '@notifee/react-native';

/**
 * 前台服务：荣耀/华为这类系统一判定「不在用」，就把后台程序的定时器冻住，
 * 轮询停摆，通知自然也就没了。挂一个常驻服务，进程活着，轮询才跑得动。
 * 这个回调故意返回一个永远不结束的 Promise——它一 resolve，服务就算干完收工了。
 */
notifee.registerForegroundService(() => new Promise(() => {}));

type Role = 'user' | 'assistant';
type Msg = {seq: number; role: Role; text: string; ts: number; failed?: boolean};
/** 一条线 = 一个联系人的后端：填个名字、地址和令牌就能加 */
type 线 = {id: string; name: string; server: string; token: string};
type Row = {kind: 'time'; key: string; ts: number} | {kind: 'msg'; key: string; msg: Msg};
type ThemeMode = 'system' | 'light' | 'dark';
type ApiState = {
  ok: boolean;
  name: string;
  target: {id: string; title: string};
  alive: boolean;
  lastSeq: number;
  count: number;
};

const KEY_SERVER = 'jingwu.server';
const KEY_TOKEN = 'jingwu.token';
const KEY_THEME = 'jingwu.theme';
/** 有几条线（每个联系人都是一条线：名字 + 地址 + 令牌） */
const KEY_LINES = 'jingwu.lines';
/** 现在走的是哪一条 */
const KEY_LINE = 'jingwu.line';
/** 自己换过的头像（data URI）；没换过就用包里那张 */
const KEY_AVATAR = 'jingwu.avatar';
/** 聊天页背景图 */
const KEY_BG = 'jingwu.bg';
/** 消息页背景图（跟聊天页分开存，各换各的） */
const KEY_BG_MSG = 'jingwu.bgMsg';
/** 上次停在哪个页：杀掉后台再进来，直接回到上次那页，不用手动点账号 */
const KEY_PAGE = 'jingwu.page';
/** 后台常驻开着没有（'1' 开 / '0' 关） */
const KEY_ALIVE = 'jingwu.alive';
/** 对方的名字（默认「鲸鱼娘」，设置里能改） */
const KEY_NAME = 'whaletter.name';
/** 清过聊天记录的话，记一个「清到这个序号」的水位；电脑上那份不动 */
const KEY_CLEARED = 'jingwu.clearedBefore';

// 开源版不带任何人的地址和令牌：第一次打开在设置页里自己填。
// 服务端就是仓库里那个 DSH 插件（见 README），填你自己的电脑地址和那边生成的令牌。
const DEFAULT_SERVER = '';
const DEFAULT_TOKEN = '';
const POLL_MS = 1500;
const GAP_MS = 10 * 60 * 1000; // 隔了十分钟就插一条时间
const PAGE = 30; // 一屏先铺多少条；往上翻到顶再多放这么多，别一次把几百条全渲染出来

/** 默认字体：鲸落体，打在 assets/fonts/jingluo.ttf。换字体就换文件、对齐这个名字 */
const 字体 = 'jingluo';
/** 对方的名字。默认「鲸鱼娘」，设置里能改 */
const 默认名字 = '鲸鱼娘';

/** 设置 → 说明 那一页的字 */
const 说明文字 = [
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
].join('\n');

/** DESIGN-鲸屋.md 的色板：浅色 / 深色各一套 */
function palette(dark: boolean) {
  return dark
    ? {
        dark: true,
        bg: '#12121F',
        surface: '#262640',
        mine: '#4A5590',
        mineText: '#F2F1F7',
        her: '#262640',
        herText: '#E8E6F0',
        accent: '#606CA8',
        accentBright: '#6478AA',
        text: '#E8E6F0',
        dim: '#8A85A0',
        line: 'rgba(232,230,240,0.08)',
        header: 'rgba(18,18,31,0.94)',
        headerText: '#F0F0F0',
        inputBg: '#262640',
        danger: '#E08A88',
        wave: '#6478AA',
      }
    : {
        dark: false,
        bg: '#F7F6FA',
        surface: '#FFFFFF',
        mine: '#3C3C60',
        mineText: '#FFFFFF',
        her: '#ECEAF4',
        herText: '#242448',
        accent: '#606CA8',
        accentBright: '#6478AA',
        text: '#242448',
        dim: '#8A85A0',
        line: 'rgba(60,60,96,0.10)',
        header: 'rgba(36,36,72,0.94)',
        headerText: '#F0F0F0',
        inputBg: '#FFFFFF',
        danger: '#C25B54',
        wave: '#B4A8C0',
      };
}
type Pal = ReturnType<typeof palette>;

const hhmm = (ts: number) => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

function dayTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${sameDay ? '' : `${d.getMonth() + 1}月${d.getDate()}日 `}${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 「10.0.0.2:8791」「http://x/」都认，统一成不带结尾斜杠的基址 */
function normalizeServer(raw: string) {
  let s = (raw || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  return s.replace(/\/+$/, '');
}

/** 小鲸尾（气泡旁边那个尖、图标同一套形）：两瓣、上翘 */
function WhaleTail({size = 12, color = '#B4A8C0'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 22c-1.4-4.2-1.1-8.2.8-12 .3-.5 1-.5 1.3 0l3.6 6.2c.3.5 1 .4 1.2-.2l2-6.4c.2-.6.9-.8 1.3-.3 1 1.3 1.6 2.9 1.8 4.7-3.2.8-6.6 3.6-8.4 8-.2.5-.9.5-1.1 0z"
        fill={color}
      />
      <Path
        d="M12 22c-1.8-4.4-5.2-7.2-8.4-8 .2-1.8.8-3.4 1.8-4.7.4-.5 1.1-.3 1.3.3l2 6.4c.2.6.9.7 1.2.2l3.6-6.2c.3-.5 1-.5 1.3 0 1.9 3.8 2.2 7.8.8 12-.2.5-.9.5-1.1 0z"
        fill={color}
        opacity={0.55}
      />
    </Svg>
  );
}

/** 极细的波浪线：启动页那一条 */
function WaveLine({width = 108, color = '#B4A8C0'}) {
  return (
    <Svg width={width} height={8} viewBox={`0 0 ${width} 8`}>
      <Path
        d={`M1 5 Q ${width * 0.18} 1, ${width * 0.36} 5 T ${width * 0.72} 5 T ${width - 1} 4`}
        stroke={color}
        strokeWidth={1}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** 设置页每一行的左侧小图标，细线条，跟界面其它地方一个笔触 */
function SetIcon({name, color}: {name: string; color: string}) {
  const 笔 = {
    stroke: color,
    strokeWidth: 1.7,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" style={{marginRight: 12}}>
      {name === 'person' && (
        <>
          <Circle cx={12} cy={8} r={3.6} {...笔} />
          <Path d="M4.6 19.6c1.5-3.4 4.3-5.1 7.4-5.1s5.9 1.7 7.4 5.1" {...笔} />
        </>
      )}
      {name === 'data' && (
        <>
          <Ellipse cx={12} cy={6.2} rx={6.8} ry={2.6} {...笔} />
          <Path d="M5.2 6.2v5.6c0 1.4 3 2.6 6.8 2.6s6.8-1.2 6.8-2.6V6.2" {...笔} />
          <Path d="M5.2 11.8v5.6c0 1.4 3 2.6 6.8 2.6s6.8-1.2 6.8-2.6v-5.6" {...笔} />
        </>
      )}
      {name === 'moon' && (
        <Path d="M20 14.6A8.6 8.6 0 0 1 9.4 4 8.6 8.6 0 1 0 20 14.6z" {...笔} />
      )}
      {name === 'info' && (
        <>
          <Circle cx={12} cy={12} r={8.4} {...笔} />
          <Path d="M12 11v5.6M12 7.7v.5" {...笔} />
        </>
      )}
      {name === 'doc' && (
        <>
          <Path d="M6.6 3.6h6.9l3.9 3.9v12.9H6.6z" {...笔} />
          <Path d="M13.2 3.6v4.2H17.4" {...笔} />
        </>
      )}
      {name === 'out' && (
        <>
          <Path d="M13.8 4.6H6.6v14.8h7.2" {...笔} />
          <Path d="M12.4 12h8.2M17.6 8.6 21 12l-3.4 3.4" {...笔} />
        </>
      )}
      {name === 'chat' && (
        <Path d="M4.5 6.5h15v10h-9l-4.5 3.4v-3.4H4.5z" {...笔} />
      )}
      {name === 'planet' && (
        <>
          <Circle cx={12} cy={12} r={5.2} {...笔} />
          <Path d="M4.2 14.6c-1.6 1.5-2.3 2.9-1.8 3.8.9 1.6 5.6.1 10.4-3.3S20.6 7 19.7 5.4c-.5-.9-1.9-.8-3.7-.1" {...笔} />
        </>
      )}
      {name === 'picture' && (
        <>
          <Path d="M4.2 5.4h15.6v13.2H4.2z" {...笔} />
          <Circle cx={9} cy={10} r={1.5} {...笔} />
          <Path d="M4.6 17.4l4.6-4 3.4 2.8 3-2.6 3.8 3.4" {...笔} />
        </>
      )}
      {name === 'gear' && (
        <>
          <Circle cx={12} cy={12} r={3.2} {...笔} />
          <Path
            d="M12 3.4v2.2M12 18.4v2.2M3.4 12h2.2M18.4 12h2.2M5.9 5.9l1.6 1.6M16.5 16.5l1.6 1.6M18.1 5.9l-1.6 1.6M7.5 16.5l-1.6 1.6"
            {...笔}
          />
        </>
      )}
    </Svg>
  );
}

/** 设置页的一行：图标 + 名字 + 右侧值 + 小箭头 */
function SetRow({
  icon,
  label,
  value,
  onPress,
  colors,
  last,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress: () => void;
  colors: {text: string; dim: string; line: string};
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [
        styles.setRow,
        !last && {borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line},
        pressed && {opacity: 0.55},
      ]}>
      <SetIcon name={icon} color={colors.text} />
      <Text style={[styles.setLabel, {color: colors.text}]}>{label}</Text>
      {!!value && (
        <Text style={[styles.setValue, {color: colors.dim}]} numberOfLines={1}>
          {value}
        </Text>
      )}
      <Text style={[styles.setArrow, {color: colors.dim}]}>›</Text>
    </Pressable>
  );
}

/** 卡片里两行之间的那条细线（跟行自带的下边线错开用） */
function SetDivider({line}: {line: string}) {
  return <View style={{height: StyleSheet.hairlineWidth, backgroundColor: line}} />;
}

/** 空间里的一条：我往那儿贴的东西 */
type 说说 = {ts: number; text: string; img?: string};

/**
 * 「空间」那一页：我发的东西，他打开就能看。
 * 内容是电脑上一个静态清单，我写了就多一条，不用重启什么。
 */
function 空间页({
  server,
  头像,
  名,
  主题,
}: {
  server: string;
  头像: string;
  名: string;
  主题: any;
}) {
  const [列表, set列表] = useState<说说[]>([]);
  const [拉中, set拉中] = useState(true);
  const [错, set错] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${server}/space.json`, {cache: 'no-store'});
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (alive) {
          set列表(Array.isArray(j) ? j : []);
          set错('');
        }
      } catch (e: any) {
        // 拉不到要说话：以前是安静地空着，看着像「东西被删了」
        if (alive) {
          set列表([]);
          set错(e?.message ? `海面没连上：${e.message}` : '海面没连上');
        }
      } finally {
        if (alive) set拉中(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [server]);

  return (
    <View style={styles.fill}>
      <Image source={{uri: seaBg}} style={styles.seaBack} resizeMode="cover" />
      <ScrollView style={styles.spaceSea} contentContainerStyle={styles.spaceBody} showsVerticalScrollIndicator={false}>
      <View style={styles.spaceHero}>
        <View style={styles.spaceTop}>
          <Image source={{uri: 头像}} style={styles.spaceAvatar} />
          <Text style={[styles.spaceName, {color: 主题.text}]}>{名}</Text>
          <Text style={[styles.spaceEn, {color: '#B9CDF0'}]}>Whaletter</Text>
          <Text style={[styles.spaceMotto, {color: '#B9CDF0'}]}>
            A little letter from the deep
          </Text>
        </View>
      </View>

      {拉中 ? (
        <ActivityIndicator style={{marginTop: 30}} color={主题.accent} />
      ) : 错 ? (
        <Text style={[styles.spaceEmpty, {color: 主题.danger || '#E08A88'}]}>{错}</Text>
      ) : 列表.length === 0 ? (
        <Text style={[styles.spaceEmpty, {color: 主题.dim}]}>还没往这儿贴过东西</Text>
      ) : (
        // 一条一条当漂流瓶：越新的浮在越上面、越亮；越旧越往下沉、越暗
        列表.map((p, i) => {
          const 龄 = Math.max(0, (Date.now() - p.ts) / 86400000);
          const 沉 = Math.min(140, 龄 * 14);
          const 亮 = Math.max(0.34, 1 - 龄 * 0.07);
          return (
            <View
              key={`${p.ts}-${i}`}
              style={[
                styles.bottle,
                {
                  marginTop: 6 + 沉,
                  opacity: 亮,
                  borderColor: 主题.line,
                  backgroundColor: 'rgba(10,24,44,0.55)',
                },
              ]}>
              <Svg width={22} height={22} viewBox="0 0 24 24" style={{marginRight: 10}}>
                <Path
                  d="M9.6 3.2h4.8v2.4h-4.8z"
                  fill="none"
                  stroke="#8FB6E8"
                  strokeWidth={1.4}
                />
                <Path
                  d="M9.6 5.6h4.8c1.6 3 2.2 5.8 2.2 8.4 0 4.2-1.9 6.2-4.6 6.2s-4.6-2-4.6-6.2c0-2.6.6-5.4 2.2-8.4z"
                  fill="none"
                  stroke="#8FB6E8"
                  strokeWidth={1.4}
                />
                <Path d="M10.4 14.6h3.2" stroke="#8FB6E8" strokeWidth={1.2} />
              </Svg>
              <View style={{flex: 1}}>
                <Text style={[styles.spaceTime, {color: '#8FB6E8'}]}>{dayTime(p.ts)}</Text>
                <Text style={[styles.spaceText, {color: '#E8F0FF'}]}>{p.text}</Text>
              </View>
            </View>
          );
        })
      )}

      <Text style={[styles.spaceFoot, {color: '#DCE8FF'}]}>海面是新的，越往下越旧</Text>
      </ScrollView>
    </View>
  );
}

/** 名字旁边那只小鲸鱼：处得越久越高兴，满一周尾巴比心 */
function 小鲸鱼({天}: {天: number}) {
  const 图 = 天 >= 7 ? whale2 : 天 >= 3 ? whale1 : whale0;
  return <Image source={{uri: 图}} style={{width: 40, height: 40, marginLeft: 4}} resizeMode="contain" />;
}

export default function App(): React.JSX.Element {
  const systemDark = useColorScheme() === 'dark';

  const [booting, setBooting] = useState(true);
  const [splashGone, setSplashGone] = useState(false);
  const splashFade = useRef(new Animated.Value(1)).current;
  /** 立绘自己的淡入：整页淡出时它跟着一起淡，不用另算 */
  const artFade = useRef(new Animated.Value(0)).current;

  const [server, setServer] = useState('');
  const [token, setToken] = useState('');
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  /** 对方叫什么：默认鲸鱼娘，设置里能改 */
  const [名, set名] = useState(默认名字);
  const [名字开, set名字开] = useState(false);
  const [名字稿, set名字稿] = useState('');

  const [serverDraft, setServerDraft] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  /** 底下那一排：消息 / 空间；进聊天时不算在内 */
  const [页, set页] = useState<'msg' | 'space' | 'chat'>('msg');
  /** 几条线：默认就一条 */
  const [线表, set线表] = useState<线[]>([
    {id: 'line-1', name: 默认名字, server: DEFAULT_SERVER, token: DEFAULT_TOKEN},
  ]);
  const [当前线, set当前线] = useState('line-1');
  /** 设置里「加一条线」的表单展开着没有 */
  const [加线开, set加线开] = useState(false);
  /** 设置里「改当前这条线」的表单展开着没有 */
  const [改线开, set改线开] = useState(false);
  /** 后台常驻（前台服务）开着没有：默认开，关了就是「切出去就不响」 */
  const [常驻, set常驻] = useState(true);
  const [新线名, set新线名] = useState('');
  const [setupErr, setSetupErr] = useState('');
  const [checking, setChecking] = useState(false);
  /** 设置页里「账号管理」是不是展开着 */
  const [账号开, set账号开] = useState(false);
  /** 设置页里「说明」那一页开着没有 */
  const [说明开, set说明开] = useState(false);
  /**
   * 清聊天记录的水位：序号在这以下的都不显示。
   * 只清这台手机，电脑上那份一个字都不动——想恢复把这个数清掉就行。
   */
  const [清到, set清到] = useState(0);
  /** 显示用的头像，换过就是自己挑的那张 */
  const [我的头像, set我的头像] = useState(avatar);
  /** 聊天页背景：默认用立绘，也能换成相册里选的，或者关掉 */
  const [背景, set背景] = useState<string | null>(whaleArt);
  /** 消息页背景：跟聊天页分开，默认不铺 */
  const [消息背景, set消息背景] = useState<string | null>(null);
  /** 点开的大图；null 就是没在看 */
  const [看图, set看图] = useState<string | null>(null);
  /** 屏幕中间飘一下的小提示（「已复制」这种），一秒多自己消失 */
  const [提示, set提示] = useState('');
  const 提示计时 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const 飘一句 = useCallback((文: string) => {
    set提示(文);
    if (提示计时.current) clearTimeout(提示计时.current);
    提示计时.current = setTimeout(() => {
      提示计时.current = null;
      set提示('');
    }, 1400);
  }, []);

  const [messages, setMessages] = useState<Msg[]>([]);
  /** 现在铺出来多少条（从最新往回数）。往上翻到顶才加 */
  const [shown, setShown] = useState(PAGE);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<ApiState | null>(null);
  const [banner, setBanner] = useState('');

  const lastSeq = useRef(0);
  const polling = useRef(0);
  const listRef = useRef<FlatList<Row>>(null);
  /** 是不是贴在底部。翻历史的时候就不该再被拽回去 */
  const stickBottom = useRef(true);
  /** 这一屏还没落过底 */
  const firstDrop = useRef(true);

  /**
   * 落到最新一条。全 App 只留这一个滚到底的入口。
   *
   * 为什么是 debounce 不是直接滚：表情图、消息里的图都是异步加载的，
   * 每加载完一张高度就变一次，onContentSizeChange 跟着触发一次；
   * 一次一次滚过去，屏幕上就是「反复跳」。攒到最后一口气滚一次，只看得见它落位。
   */
  const 滚动计时 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const 落到最新 = useCallback((animated = false) => {
    if (滚动计时.current) clearTimeout(滚动计时.current);
    滚动计时.current = setTimeout(() => {
      滚动计时.current = null;
      // 倒过来的列表里，最新那条就在偏移 0 那儿
      listRef.current?.scrollToOffset({offset: 0, animated});
    }, 90);
  }, []);

  // 键盘高度：Android 上 KeyboardAvoidingView 不可靠（新系统 edge-to-edge 下
  // adjustResize 经常不生效），自己监听键盘把输入栏顶上去最稳。
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => {
      setKbHeight(e.endCoordinates?.height || 0);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // 键盘一弹出来，可视区矮了一截，得把人推到底——
  // 不然最新的那几条正好被键盘盖住（这就是「回复时键盘挡消息」）。
  useEffect(() => {
    if (!kbHeight) return;
    // 键盘是滑上来的，高度分几帧才到位；这个 debounce 正好吃到最后一帧
    落到最新(false);
  }, [kbHeight, 落到最新]);

  // ---------- 热更新 ----------
  const [updCur, setUpdCur] = useState('');
  const [updMsg, setUpdMsg] = useState('');
  const [updBusy, setUpdBusy] = useState(false);

  // 启动时问一下服务端有没有新版；有就自动装上，下次冷启动生效
  useEffect(() => {
    (async () => {
      const cur = await currentVersion();
      setUpdCur(cur);
      if (!server || !token) return;
      const info = await checkUpdate(server, cur);
      if (!info) return;
      try {
        setUpdBusy(true);
        await applyUpdate(info);
        setUpdCur(info.version);
        setUpdMsg('已更新，下次打开生效');
      } catch (e: any) {
        setUpdMsg(`更新没成功：${e?.message || ''}`);
      } finally {
        setUpdBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, token]);

  const doUpdateCheck = useCallback(async () => {
    if (!server || !token) {
      setUpdMsg('先把地址和令牌填好');
      return;
    }
    setUpdBusy(true);
    setUpdMsg('查着呢…');
    try {
      const cur = await currentVersion();
      const info = await checkUpdate(server, cur);
      if (!info) {
        setUpdMsg('已经是最新的');
      } else {
        setUpdMsg(`正在下 ${info.version}…`);
        await applyUpdate(info);
        setUpdCur(info.version);
        setUpdMsg('装好了，下次打开就是新版');
      }
    } catch (e: any) {
      setUpdMsg(`没成：${e?.message || '不知道为啥'}`);
    } finally {
      setUpdBusy(false);
    }
  }, [server, token]);

  const doRevert = useCallback(async () => {
    try {
      await revert();
      setUpdCur('');
      setUpdMsg('已回到出厂版本，重开一次生效');
    } catch (e: any) {
      setUpdMsg(`没成：${e?.message || ''}`);
    }
  }, []);

  // ---------- 通知自测：设置里点一下就弹一条，不用等我发消息 ----------
  const [通知结果, set通知结果] = useState('');
  const 试通知 = useCallback(async () => {
    set通知结果('发着呢…');
    try {
      const 权 = await notifee.requestPermission();
      const 状态 = 权 && typeof 权.authorizationStatus === 'number' ? 权.authorizationStatus : -9;
      await notifee.createChannel({
        id: 'lanxi',
        name: '新笺',
        importance: AndroidImportance.HIGH,
      });
      await notifee.displayNotification({
        title: 名,
        body: '这是一条试的，看见说明路通了',
        android: {
          channelId: 'lanxi',
          pressAction: {id: 'default'},
        },
      });
      // 发出去之后问一句系统：你手里现在有几条我发的？一条都没有就是没进系统
      let 系统里 = -1;
      try {
        const 列 = await notifee.getDisplayedNotifications();
        系统里 = Array.isArray(列) ? 列.length : -1;
      } catch (e) {}
      set通知结果(
        状态 === 1
          ? `已允许，发出去了${系统里 >= 0 ? `（系统里 ${系统里} 条）` : ''}`
          : `权限没给（状态 ${状态}）`,
      );
      void 报账(`test perm=${状态} shown=${系统里}`);
    } catch (e: any) {
      set通知结果(`没成：${e?.message || e}`);
      void 报账(`test ERR ${String(e?.message || e)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, token]);

  // ---------- 表情包 ----------
  const [memeOpen, setMemeOpen] = useState(false);
  const [memeTag, setMemeTag] = useState('happy');
  const [galleryOpen, setGalleryOpen] = useState(false);

  // ---------- 左侧栏（点头像出来） ----------
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerX = useRef(new Animated.Value(-300)).current;
  useEffect(() => {
    Animated.timing(drawerX, {
      toValue: drawerOpen ? 0 : -300,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [drawerOpen, drawerX]);
  const [memes, setMemes] = useState<{i: number; url: string; caption: string}[]>([]);
  const [memeHas, setMemeHas] = useState(true);
  const [memeLoading, setMemeLoading] = useState(false);

  const MEME_TAGS: [string, string][] = [
    ['happy', '开心'],
    ['angry', '生气'],
    ['sad', '难过'],
    ['shy', '害羞'],
    ['confused', '困惑'],
    ['daily', '日常'],
  ];

  const loadMemes = useCallback(
    async (tag: string) => {
      if (!server || !token) return;
      setMemeLoading(true);
      try {
        const q = `memes?tag=${encodeURIComponent(tag)}&limit=36`;
        const r = await fetch(`${server}/api/${q}`, {
          headers: {'x-lanxi-token': token},
        });
        const j = await r.json();
        if (!j || j.has === false) {
          setMemeHas(false);
          setMemes([]);
        } else {
          setMemeHas(true);
          setMemes(
            (j.memes || []).map((m: any) => ({
              i: m.i,
              caption: m.caption || '',
              url: `${server}${m.url}`,
            })),
          );
        }
      } catch (e) {
        setMemeHas(false);
      } finally {
        setMemeLoading(false);
      }
    },
    [server, token],
  );

  useEffect(() => {
    if (memeOpen) void loadMemes(memeTag);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memeOpen, memeTag]);

  const t: Pal = useMemo(
    () => palette(themeMode === 'system' ? systemDark : themeMode === 'dark'),
    [themeMode, systemDark],
  );

  /** 处了多少天：拿最早那条消息算，没消息就当今天刚认识 */
  const 相伴天数 = useMemo(() => {
    if (!messages.length) return 0;
    const 起 = Math.min(...messages.map(m => m.ts));
    return Math.max(0, Math.floor((Date.now() - 起) / 86400000));
  }, [messages.length, messages]);

  /** 名字下面那行状态。鲸鱼的说法，比「在线／离线」顺眼 */
  const 状态词 = status ? (status.alive ? '浮上来了' : '潜下去了') : '正在浮上来…';

  // 返回键：聊天里退到消息列表，浮层一层一层关
  useEffect(() => {
    const 退 = BackHandler.addEventListener('hardwareBackPress', () => {
      if (看图) {
        set看图(null);
        return true;
      }
      if (galleryOpen) {
        setGalleryOpen(false);
        return true;
      }
      if (drawerOpen) {
        setDrawerOpen(false);
        return true;
      }
      if (页 === 'chat') {
        set页('msg');
        return true;
      }
      return false;
    });
    return () => 退.remove();
  }, [页, drawerOpen, galleryOpen, 看图]);

  // ---------- 本地设置 ----------
  useEffect(() => {
    (async () => {
      let 报地址 = '';
      let 报令牌 = '';
      try {
        // ⚠ 一条读不出来不能拖垮整套：以前是 Promise.all 一起等，
        // 只要有一个 key 抛（比如背景图太大，安卓那边 SQLite 读超 2MB 就报错），
        // 整块 catch 一走，地址令牌全没设上 → 每次启动都弹设置页，头像和背景也回到默认
        const 取 = (k: string) =>
          AsyncStorage.getItem(k).catch(() => {
            // 读不出来的那条多半是存坏了：顺手扔掉，下次写就干净了
            AsyncStorage.removeItem(k).catch(() => {});
            return null;
          });
        const [s, k, m, c, av, ls, li, bg, bgm, pg, alv, nm] = await Promise.all([
          取(KEY_SERVER),
          取(KEY_TOKEN),
          取(KEY_THEME),
          取(KEY_CLEARED),
          取(KEY_AVATAR),
          取(KEY_LINES),
          取(KEY_LINE),
          取(KEY_BG),
          取(KEY_BG_MSG),
          取(KEY_PAGE),
          取(KEY_ALIVE),
          取(KEY_NAME),
        ]);
        // 线表优先：有就用当前那条的地址和令牌
        let 表: 线[] = [];
        try {
          表 = ls ? JSON.parse(ls) : [];
        } catch (e) {
          表 = [];
        }
        // 线可能被改坏（地址或令牌被清空了）。坏的一条用默认值兜住，
        // 不然每次启动 srv/tok 都是空 → 直接弹到设置页，看着就像「一进来就跳设置」
        const 干净: 线[] = (Array.isArray(表) ? 表 : [])
          .filter(x => x && typeof x === 'object')
          .map((x: any, i: number) => ({
            id: String(x.id || `l${i}-${Date.now()}`),
            name: String(x.name || 默认名字),
            server: normalizeServer(String(x.server || '')) || normalizeServer(DEFAULT_SERVER),
            token: String(x.token || '').trim() || DEFAULT_TOKEN,
          }));
        表 = 干净;
        if (!表.length) {
          表 = [
            {
              id: 'lanxi',
              name: 默认名字,
              server: normalizeServer(s || DEFAULT_SERVER),
              token: (k || DEFAULT_TOKEN).trim(),
            },
          ];
        }
        const 用 = 表.find(x => x.id === li) || 表[0];
        set线表(表);
        set当前线(用.id);
        const srv = normalizeServer(用.server);
        const tok = 用.token;
        报地址 = srv;
        报令牌 = tok;
        setServer(srv);
        setToken(tok);
        setServerDraft(srv);
        setTokenDraft(tok);
        if (m === 'light' || m === 'dark' || m === 'system') setThemeMode(m);
        if (c) set清到(Number(c) || 0);
        if (av) set我的头像(av);
        if (bg === 'art') set背景(whaleArt);
        else if (bg === 'none') set背景(null);
        else if (bg) set背景(bg);
        if (bgm === 'art') set消息背景(whaleArt);
        else if (bgm === 'none') set消息背景(null);
        else if (bgm) set消息背景(bgm);
        // 上次停在聊天页的话，这次进来还是聊天页——不用再去点一下账号
        if (pg === 'chat' || pg === 'space') set页(pg);
        if (alv === '0') set常驻(false);
        if (nm) set名(nm);
        setSetupOpen(!(srv && tok));
        // 第一次用（地址还没填）就直接把「账号管理 → 改这条」摊开，
        // 别让人进了设置页还要自己找入口
        if (!srv || !tok) {
          set账号开(true);
          set改线开(true);
        }
      } catch (e) {
        setSetupOpen(true);
      } finally {
        setBooting(false);
        // 开机报一次账：手机上跑的到底是哪一版脚本，一眼看得见
        (async () => {
          try {
            const v = await currentVersion();
            const 文 = `boot ver=${v || 'apk'} alive=1`;
            const b64 = (global as any).btoa ? (global as any).btoa(文) : '';
            if (b64 && 报地址 && 报令牌) {
              await fetch(`${报地址}/api/upload`, {
                method: 'POST',
                headers: {'content-type': 'application/json', 'x-lanxi-token': 报令牌},
                body: JSON.stringify({
                  name: `notice-${Date.now()}.log`,
                  type: 'text/plain',
                  data: b64,
                }),
              });
            }
          } catch (e) {}
        })();
        // 立绘先淡进来（0.9 秒），停一会儿，整页再 420ms 淡出——连人一起淡走
        Animated.timing(artFade, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }).start();
        setTimeout(() => {
          Animated.timing(splashFade, {
            toValue: 0,
            duration: 420,
            useNativeDriver: true,
          }).start(() => setSplashGone(true));
        }, 2100);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 记住停在哪一页：重启回来还是那一页
  useEffect(() => {
    if (booting) return;
    AsyncStorage.setItem(KEY_PAGE, 页).catch(() => {});
  }, [页, booting]);

  const api = useCallback(
    async (path: string, init?: {method?: string; body?: unknown; timeout?: number}) => {
      // 网络半死不活的时候 fetch 能挂很久，轮询就会一条接一条地堆着。
      // 加个自己的倒计时：到点掐掉，交给上层报「连不上」
      const 限时 = init?.timeout ?? 12000;
      const 闸 = new AbortController();
      const 定时 = setTimeout(() => 闸.abort(), 限时);
      let res: Response;
      try {
        res = await fetch(`${server}/api/${path}`, {
          method: init?.method || 'GET',
          headers: {'content-type': 'application/json', 'x-lanxi-token': token},
          body: init?.body === undefined ? undefined : JSON.stringify(init.body),
          signal: 闸.signal,
        });
      } catch (e: any) {
        throw new Error(e?.name === 'AbortError' ? '超时了，那边没应' : e?.message || '连不上');
      } finally {
        clearTimeout(定时);
      }
      let data: any = null;
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }
      if (res.status === 401) {
        const err: any = new Error('unauthorized');
        err.code = 401;
        throw err;
      }
      if (!res.ok || !data || data.ok === false) {
        throw new Error((data && data.say) || `HTTP ${res.status}`);
      }
      return data;
    },
    [server, token],
  );

  /**
   * 同一条消息会从三个口子进来：自己先插的临时项、发送接口回带的那几条、后台轮询拉到的。
   * 按 seq 去重——不去重的话，发一张图它会在屏幕上叠出两三份，看着像刷屏。
   */
  /** 人不在这个界面时，新消息弹一条通知 */
  const 不在前台 = useRef(false);
  /** 同一个事实的 state 版：轮询要按它调快慢，所以得触发重渲染 */
  const [在前台, set在前台] = useState(true);
  useEffect(() => {
    const 订 = AppState.addEventListener('change', st => {
      不在前台.current = st !== 'active';
      set在前台(st === 'active');
    });
    return () => 订.remove();
  }, []);

  // 权限和渠道得在「人还在前台」的时候就要好。
  // 原来这两件事都写进 发通知() 里——那会儿程序已经在后台，授权框弹不出来，
  // 等于一次都没真授过权；渠道 'lanxi' 更是从来没建过，往不存在的渠道投，安卓直接丢掉。
  // ⚠ 授权框不能一进程序就弹：它会整块盖在启动页上，看着就像「启动动画没了」。
  //   渠道先建好（不弹窗），权限等启动页走完再问；已经允许过就不再问。
  useEffect(() => {
    (async () => {
      try {
        await notifee.createChannel({
          id: 'lanxi',
          name: '新笺',
          importance: AndroidImportance.HIGH,
        });
        const 现有 = await notifee.getNotificationSettings();
        if (现有 && 现有.authorizationStatus === 1) return;
        setTimeout(() => {
          notifee.requestPermission().catch(() => {});
        }, 4200);
      } catch (e) {}
    })();
  }, []);

  /**
   * 报账：把手机这边的实情写成一个只有英文数字的小文件，传到电脑上。
   * 通知这种东西在手机上「有没有响」我自己看不见，只能让它自己说。
   */
  const 报账 = useCallback(
    async (文: string) => {
      try {
        const 干净的 = String(文).replace(/[^\x20-\x7e]/g, ' ');
        const b64 = (global as any).btoa ? (global as any).btoa(干净的) : '';
        if (!b64) return;
        await fetch(`${server}/api/upload`, {
          method: 'POST',
          headers: {'content-type': 'application/json', 'x-lanxi-token': token},
          body: JSON.stringify({
            name: `notice-${Date.now()}.log`,
            type: 'text/plain',
            data: b64,
          }),
        });
      } catch (e) {}
    },
    [server, token],
  );

  const 发通知 = useCallback(async () => {
    if (!不在前台.current) return;
    try {
      // 万一上面那次没跑成，这里补一遍（建过的再建是空的）
      await notifee.createChannel({
        id: 'lanxi',
        name: '新笺',
        importance: AndroidImportance.HIGH,
      });
      await notifee.displayNotification({
        title: 名,
        body: '你的胖鲸邮差送来一封新笺',
        android: {
          channelId: 'lanxi',
          // 不写 smallIcon：'ic_launcher' 是 mipmap 不是 drawable，
          // notifee 按 drawable 名字找，找不到就抛异常，整条通知直接没了
          pressAction: {id: 'default'},
        },
      });
      let n = -1;
      try {
        const 列 = await notifee.getDisplayedNotifications();
        n = Array.isArray(列) ? 列.length : -1;
      } catch (e) {}
      void 报账(`notice ok shown=${n}`);
    } catch (e: any) {
      void 报账(`notice ERR ${String(e && e.message ? e.message : e)}`);
      console.warn('通知没弹出来', e);
    }
  }, [报账]);

  // 前后台切换也记一笔：能看出「手机到底有没有被系统挂起」
  useEffect(() => {
    const 订 = AppState.addEventListener('change', st => {
      void 报账(`appstate ${st}`);
    });
    return () => 订.remove();
  }, [报账]);

  // 后台心跳：十五秒写一笔。写得出来 = JS 还活着；一笔都没有 = 被冻住了
  useEffect(() => {
    if (在前台) return;
    const t = setInterval(
      () => void 报账(`tick run=${polling.current ? 1 : 0}`),
      15000,
    );
    return () => clearInterval(t);
  }, [在前台, 报账]);

  /**
   * 后台常驻：开一条前台服务，通知栏常驻一条「鲸笺在看着」。
   * 代价是那条通知消不掉，换来的是切到后台之后轮询照跑、有话就能叫。
   */
  useEffect(() => {
    if (booting) return;
    (async () => {
      try {
        if (常驻) {
          // 渠道只在没有的时候建一次。以前是先删再建，删的那一下会把常驻那条顺手抹掉，
          // 建回来又慢了半拍，看着就是「通知栏时有时没有」
          let 有 = null;
          try {
            有 = await notifee.getChannel('lanxi-alive');
          } catch (e) {}
          if (!有) {
            await notifee.createChannel({
              id: 'lanxi-alive',
              name: '后台常驻',
              importance: AndroidImportance.DEFAULT,
            });
          }
          await notifee.displayNotification({
            id: 'lanxi-alive',
            title: '鲸笺在看着',
            body: '有新笺会叫你',
            android: {
              channelId: 'lanxi-alive',
              asForegroundService: true,
              ongoing: true,
              pressAction: {id: 'default'},
            },
          });
          let 名 = '';
          try {
            const 列 = await notifee.getDisplayedNotifications();
            名 = (Array.isArray(列) ? 列 : []).map((x: any) => String(x.id)).join(',');
          } catch (e) {}
          void 报账(`alive on shown=[${名}]`);
        } else {
          await notifee.stopForegroundService();
          await notifee.cancelNotification('lanxi-alive');
          void 报账('alive off');
        }
      } catch (e: any) {
        void 报账(`alive ERR ${String(e?.message || e)}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [常驻, booting]);



  const 并入 = useCallback((prev: Msg[], 新: Msg[]): Msg[] => {
    const 见 = new Set(prev.map(m => m.seq));
    const 真新 = 新.filter(m => m.seq != null && !见.has(m.seq));
    if (!真新.length) return prev;
    // 还没拿到真 seq 的临时项永远排在最后
    const 位 = (m: Msg) => (m.seq > 0 ? m.seq : Number.MAX_SAFE_INTEGER);
    return [...prev, ...真新].sort((a, b) => 位(a) - 位(b));
  }, []);

  const pullInitial = useCallback(async () => {
    const data = await api('messages?tail=120');
    const list: Msg[] = (data.messages || []).filter((m: Msg) => m.seq != null);
    lastSeq.current = data.lastSeq || (list.length ? list[list.length - 1].seq : 0);
    setMessages(list);
    setStatus(data);
    setBanner('');
  }, [api]);

  const pullNew = useCallback(async () => {
    // 以前用一个布尔锁：请求还没回来就不再发新的。问题是程序被系统冻住的时候，
    // 那个请求可能永远不回来，锁就一直是「在跑」——轮询从此死掉，心跳却还活着。
    // 改成记时间戳，超过十五秒就当它是前一次没回来，照发不误（重复的靠 seq 去重）
    if (polling.current && Date.now() - polling.current < 15000) return;
    polling.current = Date.now();
    try {
      const data = await api(`messages?after=${lastSeq.current}`);
      // 后台里每次问都记一笔：能分清「根本没问」和「问了没拿到新东西」
      if (不在前台.current) {
        void 报账(`poll ok after=${lastSeq.current} got=${(data.messages || []).length}`);
      }
      const fresh: Msg[] = (data.messages || []).filter((m: Msg) => m.seq > lastSeq.current);
      if (fresh.length) {
        lastSeq.current = fresh[fresh.length - 1].seq;
        setMessages(prev => 并入(prev, fresh));
        void 报账(`poll fresh n=${fresh.length} bg=${不在前台.current ? 1 : 0}`);
        发通知();
      }
      setStatus(data);
      setBanner('');
    } catch (e: any) {
      void 报账(`poll ERR ${String(e?.message || e)} bg=${不在前台.current ? 1 : 0}`);
      if (e.code === 401) {
        setSetupErr('令牌不对，重新填一下');
        setSetupOpen(true);
      } else {
        setBanner(`连不上：${e.message}`);
      }
    } finally {
      polling.current = 0;
    }
  }, [api, 并入, 报账]);

  // 首屏拉一次；之后靠轮询。两块分开写：轮询的间隔会随前后台变，
  // 混在一起的话每切换一次前后台就要重拉一屏，白费流量也闪一下
  useEffect(() => {
    if (booting || setupOpen || !server || !token) return;
    pullInitial().catch((e: any) => {
      if (e.code === 401) setSetupErr('令牌不对，重新填一下');
      else setBanner(`连不上：${e.message}`);
      setSetupOpen(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, setupOpen, server, token]);

  useEffect(() => {
    if (booting || setupOpen || !server || !token) return;
    // 人在看着的时候勤一点；退到后台就放慢到 4 秒——通知还是照弹，电省一点
    const timer = setInterval(() => pullNew(), 在前台 ? POLL_MS : 4000);
    return () => clearInterval(timer);
  }, [booting, setupOpen, server, token, pullNew, 在前台]);

  // 新消息到了就滚到底（设计稿：FlatList 不用 inverted）
  // 只在「真的多了一条」时动，而且人在上面翻旧消息时不动——轮询每 1.5 秒会换一次数组引用，
  // 按引用触发的话每隔一会儿就把人从上面拽回底部，看着就像自己往下滑
  const lastLen = useRef(0);
  useEffect(() => {
    if (!messages.length) return;
    const 多了 = messages.length > lastLen.current;
    lastLen.current = messages.length;
    if (firstDrop.current) {
      // 头一回进来：直接落到底，别让人看着它从顶上滑下来
      firstDrop.current = false;
      stickBottom.current = true;
      落到最新(false);
      return;
    }
    if (!多了 || !stickBottom.current) return;
    落到最新(true);
  }, [messages, 落到最新]);

  const tryConnect = useCallback(
    async (srv: string, tok: string) => {
      const res = await fetch(`${srv}/api/state`, {
        headers: {'x-lanxi-token': tok},
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) throw new Error('令牌不对');
      if (!res.ok || !data || data.ok === false) throw new Error('插件没应答');
      return data as ApiState;
    },
    [],
  );

  /** 切到某一条线：换地址和令牌，把记录重新拉一遍 */
  const 切到 = useCallback(
    async (l: 线) => {
      const srv = normalizeServer(l.server);
      set当前线(l.id);
      setServer(srv);
      setToken(l.token);
      setServerDraft(srv);
      setTokenDraft(l.token);
      setMessages([]);
      lastSeq.current = 0;
      setShown(PAGE);
      try {
        await AsyncStorage.multiSet([
          [KEY_LINE, l.id],
          [KEY_SERVER, srv],
          [KEY_TOKEN, l.token],
        ]);
      } catch (e) {}
      try {
        const r = await fetch(`${srv}/api/messages?tail=${PAGE}`, {
          headers: {'x-lanxi-token': l.token},
        });
        const d = await r.json();
        const list: Msg[] = (d.messages || []).filter((m: Msg) => m.seq != null);
        lastSeq.current = d.lastSeq || (list.length ? list[list.length - 1].seq : 0);
        setMessages(list);
        setStatus(d);
      } catch (e) {}
    },
    [],
  );

  /** 存线表 */
  const 存线 = useCallback(async (next: 线[]) => {
    set线表(next);
    try {
      await AsyncStorage.setItem(KEY_LINES, JSON.stringify(next));
    } catch (e) {}
  }, []);

  /** 换背景：立绘 / 相册里的图 / 不要。两个页面各存各的，互不影响 */
  const 换壁纸 = useCallback((哪页: 'chat' | 'msg') => {
    const 键 = 哪页 === 'chat' ? KEY_BG : KEY_BG_MSG;
    // 相册挑来的图不再塞进设置里存：安卓那边一条记录过了 2MB 就读不出来了，
    // 之前就是这么把整套设置带崩的。现在落成文件，设置里只存一行路径
    const 记 = async (v: string | null) => {
      let 存值 = v;
      if (v && v.startsWith('data:')) {
        try {
          const 名 = `bg-${哪页}-${Date.now()}.jpg`;
          const 到 = `${RNFS.DocumentDirectoryPath}/${名}`;
          await RNFS.writeFile(到, v.slice(v.indexOf(',') + 1), 'base64');
          存值 = `file://${到}`;
        } catch (e: any) {
          Alert.alert('存不下来', e?.message || '');
          return;
        }
      }
      if (哪页 === 'chat') set背景(存值);
      else set消息背景(存值);
      AsyncStorage.setItem(键, 存值 === null ? 'none' : 存值 === whaleArt ? 'art' : 存值).catch(
        () => {},
      );
    };
    Alert.alert(哪页 === 'chat' ? '聊天页背景' : '消息页背景', '想换哪张', [
      {
        text: '用立绘',
        onPress: () => void 记(whaleArt),
      },
      {
        text: '从相册选',
        onPress: async () => {
          try {
            const res = await launchImageLibrary({
              mediaType: 'photo',
              selectionLimit: 1,
              includeBase64: true,
              maxWidth: 1080,
              maxHeight: 1920,
              quality: 0.8,
            });
            if (res.didCancel || !res.assets || !res.assets.length) return;
            const a = res.assets[0];
            if (!a.base64) return;
            await 记(`data:${a.type || 'image/jpeg'};base64,${a.base64}`);
          } catch (e: any) {
            Alert.alert('换不了', e?.message || '');
          }
        },
      },
      {
        text: '不要背景',
        onPress: () => void 记(null),
      },
    ]);
  }, []);

  /** 改当前这条线的地址/令牌（换了网或换过令牌都得能改，不能只能新加一条） */
  const 存当前这条 = useCallback(async () => {
    const srv = normalizeServer(serverDraft);
    const tok = tokenDraft.trim();
    if (!srv) return setSetupErr('先填电脑那边的地址');
    if (!tok) return setSetupErr('令牌不能空');
    const 新表 = 线表.map(x => (x.id === 当前线 ? {...x, server: srv, token: tok} : x));
    await 存线(新表);
    setServer(srv);
    setToken(tok);
    setBanner('');
    setSetupErr('改好了，已经换成这条');
  }, [serverDraft, tokenDraft, 线表, 当前线, 存线]);

  const pickTheme = useCallback(async (m: ThemeMode) => {
    setThemeMode(m);
    try {
      await AsyncStorage.setItem(KEY_THEME, m);
    } catch (e) {}
  }, []);

  /**
   * 自己发出去的东西一定要看得见。走同一个 debounce 入口，
   * 别另外再排一组定时器——两组叠在一起就是你看到的来回弹。
   */
  const 滚到底 = useCallback(() => {
    落到最新(true);
  }, [落到最新]);

  const postSend = useCallback(
    async (text: string, tempKey: number) => {
      try {
        const data = await api('send', {
          method: 'POST',
          body: {text, clientId: `a${tempKey}`},
        });
        const real: Msg[] = data.messages || [];
        setMessages(prev =>
          并入(
            prev.filter(m => m.seq !== tempKey),
            real.map(m => ({...m, failed: false})),
          ),
        );
        if (real.length) lastSeq.current = Math.max(lastSeq.current, real[real.length - 1].seq);
        滚到底();
      } catch (e: any) {
        setMessages(prev =>
          prev.map(m => (m.seq === tempKey ? {...m, failed: true} : m)),
        );
        setBanner(`没发出去：${e.message}`);
      }
    },
    [api, 并入, 滚到底],
  );

  /** 把电脑上的文件存到这台手机（应用自己的目录，不用权限） */
  const 存文件 = useCallback(
    async (名: string) => {
      try {
        const 到 = `${RNFS.DocumentDirectoryPath}/${名}`;
        const 任务 = RNFS.downloadFile({
          fromUrl: `${server}/api/file?n=${encodeURIComponent(名)}&t=${encodeURIComponent(token)}`,
          toFile: 到,
        });
        const r = await 任务.promise;
        if (r.statusCode === 200) Alert.alert('存好了', 到);
        else Alert.alert('没存上', `状态 ${r.statusCode}`);
      } catch (e: any) {
        Alert.alert('没存上', e?.message || '');
      }
    },
    [server, token],
  );

  /** 发任意文件：选一个，读成 base64 交给电脑那边存，消息里留一条 [文件] 路径 */
  const 发文件 = useCallback(async () => {
    try {
      const [挑中] = await pick({type: [types.allFiles]});
      if (!挑中 || !挑中.uri) return;
      const 名 = 挑中.name || `文件-${Date.now()}`;
      const b64 = await RNFS.readFile(挑中.uri.replace(/^file:\/\//, ''), 'base64');
      const r = await fetch(`${server}/api/upload`, {
        method: 'POST',
        headers: {'content-type': 'application/json', 'x-lanxi-token': token},
        body: JSON.stringify({name: 名, type: 挑中.type || '', data: b64}),
      });
      const j = await r.json();
      if (!j || j.ok === false) {
        Alert.alert('发不出去', (j && j.say) || '电脑那边没收下');
        return;
      }
      const text = `[文件] ${j.path}`;
      const tempKey = -Date.now();
      setMessages(prev => [...prev, {seq: tempKey, role: 'user', text, ts: Date.now()}]);
      const data = await api('send', {method: 'POST', body: {text, clientId: `a${tempKey}`}});
      const real: Msg[] = data.messages || [];
      setMessages(prev =>
        并入(
          prev.filter(m => m.seq !== tempKey),
          real.map(m => ({...m, failed: false})),
        ),
      );
      滚到底();
    } catch (e: any) {
      if (String(e?.message || '').includes('cancelled')) return;
      Alert.alert('发文件出错', e?.message || '');
    }
  }, [api, server, token, 并入, 滚到底]);

  // ---------- 发图 / 发文件 ----------
  const [picking, setPicking] = useState(false);

  /** 换头像：挑一张，压到 256，存本机，不动安装包里的那张 */
  const 换头像 = useCallback(async () => {
    try {
      const res = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        includeBase64: true,
        maxWidth: 256,
        maxHeight: 256,
        quality: 0.8,
      });
      if (res.didCancel || !res.assets || !res.assets.length) return;
      const a = res.assets[0];
      if (!a.base64) {
        Alert.alert('这张读不出来', '换一张试试');
        return;
      }
      const uri = `data:${a.type || 'image/jpeg'};base64,${a.base64}`;
      set我的头像(uri);
      try {
        await AsyncStorage.setItem(KEY_AVATAR, uri);
      } catch (e) {}
    } catch (e: any) {
      Alert.alert('换不了', e?.message || '');
    }
  }, []);

  const pickAndSend = useCallback(async () => {
    if (picking) return;
    try {
      setPicking(true);
      const res = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        includeBase64: true,
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.8,
      });
      if (res.didCancel || !res.assets || !res.assets.length) return;
      const a = res.assets[0];
      if (!a.base64) {
        setBanner('这张读不出来，换一张试试');
        return;
      }
      const r = await fetch(`${server}/api/upload`, {
        method: 'POST',
        headers: {'content-type': 'application/json', 'x-lanxi-token': token},
        body: JSON.stringify({
          name: a.fileName || `photo-${Date.now()}`,
          type: a.type || '',
          data: a.base64,
        }),
      });
      const j = await r.json();
      if (!j || j.ok === false) {
        setBanner(`发不出去：${(j && j.say) || '服务端没收下'}`);
        return;
      }
      const text = `[图片] ${j.path}`;
      const tempKey = -Date.now();
      setMessages(prev => [...prev, {seq: tempKey, role: 'user', text, ts: Date.now()}]);
      const data = await api('send', {
        method: 'POST',
        body: {text, clientId: `a${tempKey}`},
      });
      const real: Msg[] = data.messages || [];
      setMessages(prev =>
        并入(
          prev.filter(m => m.seq !== tempKey),
          real.map(m => ({...m, failed: false})),
        ),
      );
      滚到底();
    } catch (e: any) {
      setBanner(`发图出错：${e?.message || ''}`);
    } finally {
      setPicking(false);
    }
  }, [api, picking, server, token, 并入, 滚到底]);

  const sendMeme = useCallback(
    async (url: string) => {
      setMemeOpen(false);
      const text = `[表情] ${url}`;
      const tempKey = -Date.now();
      setMessages(prev => [...prev, {seq: tempKey, role: 'user', text, ts: Date.now()}]);
      try {
        const data = await api('send', {
          method: 'POST',
          body: {text, clientId: `a${tempKey}`},
        });
        const real: Msg[] = data.messages || [];
        setMessages(prev =>
          并入(
            prev.filter(m => m.seq !== tempKey),
            real.map(m => ({...m, failed: false})),
          ),
        );
        if (real.length) lastSeq.current = Math.max(lastSeq.current, real[real.length - 1].seq);
        滚到底();
      } catch (e: any) {
        setMessages(prev => prev.map(m => (m.seq === tempKey ? {...m, failed: true} : m)));
        setBanner(`表情没发出去：${e?.message || ''}`);
      }
    },
    [api, 并入, 滚到底],
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setSending(true);
    const tempKey = -Date.now();
    setMessages(prev => [...prev, {seq: tempKey, role: 'user', text, ts: Date.now()}]);
    try {
      await postSend(text, tempKey);
    } finally {
      setSending(false);
    }
  }, [draft, sending, postSend]);

  const retry = useCallback((m: Msg) => {
    setMessages(prev => prev.map(x => (x.seq === m.seq ? {...x, failed: false} : x)));
    void postSend(m.text, m.seq);
  }, [postSend]);

  // ---------- 列表：消息 + 时间分隔 ----------
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    let prev = 0;
    // 清过聊天记录的话，水位以下的就不摆出来了（电脑上那份还在）
    for (const m of messages) {
      if (m.seq <= 清到) continue;
      if (!prev || m.ts - prev > GAP_MS) out.push({kind: 'time', key: `t${m.seq}`, ts: m.ts});
      out.push({kind: 'msg', key: `m${m.seq}`, msg: m});
      prev = m.ts;
    }
    return out;
  }, [messages, 清到]);

  /**
   * 只铺最后 shown 条。聊天记录像 QQ 那样往上翻才加载——
   * 一次把几百条全塞进列表，进来那一下既卡又会被 scrollToEnd 拽着从头滑下来。
   */
  const visibleRows: Row[] = useMemo(
    () => (rows.length > shown ? rows.slice(rows.length - shown) : rows),
    [rows, shown],
  );

  /** 倒叙给 inverted 列表用：数组第 0 条画在最底下 */
  const 倒序: Row[] = useMemo(() => visibleRows.slice().reverse(), [visibleRows]);

  /** 本地这条已经铺完了，就跟电脑要更早的一屏（只有人主动翻到顶才会走到这儿） */
  const pullingOlder = useRef(false);
  const pullOlder = useCallback(async () => {
    const oldest = messages.length ? messages[0].seq : 0;
    if (!oldest || pullingOlder.current) return false;
    pullingOlder.current = true;
    try {
      const data = await api(`messages?before=${oldest}&tail=${PAGE}`);
      const 更早: Msg[] = (data.messages || []).filter((m: Msg) => m.seq < oldest);
      if (!更早.length) return false;
      setMessages(prev => [...更早, ...prev]);
      return true;
    } catch (e) {
      return false;
    } finally {
      pullingOlder.current = false;
    }
  }, [api, messages]);

  /**
   * 往顶上添旧消息时不用再管视野了：列表是倒过来的，更早的消息追加在尾部，
   * 你正在看的那一段原地不动。原先那套「记高度再补回去」的补偿全部撤掉了。
   */

  /** 往上翻到顶了：先把手里攒着的放出来，手里没了再跟电脑要 */
  const loadOlder = useCallback(() => {
    if (shown < rows.length) {
      setShown(v => v + PAGE);
      return;
    }
    void pullOlder().then(有更早 => {
      if (有更早) setShown(v => v + PAGE);
    });
  }, [rows.length, shown, pullOlder]);

  /**
   * 别的入口发来的图，地址里的 IP 可能是旧的、还常常没带令牌。
   * 只留 /api/meme、/api/file 这段路和参数，重新挂到当前连着的服务上，补令牌。
   */
  const 归到本站 = (u: string): string => {
    const m = /\/api\/(meme|memes|file)(\?[^#]*)?$/.exec(u);
    if (!m) return u;
    const 头 = `/api/${m[1]}${m[2] || ''}`
      .replace(/([?&])t=[^&]*/, '$1')
      .replace(/[?&]$/, '');
    return `${server}${头}${头.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`;
  };

  /** 正文里的网址做成能点的：点一下交给浏览器，不用再长按复制 */
  const 带链接 = (v: string, 色: string) => {
    const 网 = /https?:\/\/[^\s]+/g;
    const 片: (string | {url: string})[] = [];
    let 起 = 0;
    let m: RegExpExecArray | null;
    while ((m = 网.exec(v))) {
      if (m.index > 起) 片.push(v.slice(起, m.index));
      片.push({url: m[0]});
      起 = m.index + m[0].length;
    }
    if (起 < v.length) 片.push(v.slice(起));
    return (
      <Text style={[styles.bubbleText, {color: 色}]}>
        {片.map((p, i) =>
          typeof p === 'string' ? (
            p
          ) : (
            <Text
              key={i}
              style={{color: t.accent, textDecorationLine: 'underline'}}
              onPress={() => {
                Linking.openURL(p.url).catch(() => {});
              }}>
              {p.url}
            </Text>
          ),
        )}
      </Text>
    );
  };

  /** 把一段文字按 [表情: 描述] 切开，标记段交给 MarkedMeme 渲染 */
  const renderBody = (text: string, me: boolean) => {
    // 「[图片] 路径」→ 显示成缩略图（图在电脑上，走 /api/file 取），点一下放大看
    const imgHit = /^\[图片\]\s*(.+)$/.exec(text || '');
    if (imgHit) {
      const full = imgHit[1].trim();
      const name = full.split(/[\\/]/).pop() || '';
      // 令牌放 query 也带一份：Image 的 header 在部分 Android 机型上会丢
      const 图 = `${server}/api/file?n=${encodeURIComponent(name)}&t=${encodeURIComponent(token)}`;
      return (
        <Pressable onPress={() => set看图(图)}>
          <Image
            source={{uri: 图, headers: {'x-lanxi-token': token}}}
            style={styles.memeImg}
            resizeMode="cover"
          />
        </Pressable>
      );
    }

    // 「[文件] 路径」→ 一行文件名 + 保存
    const 文件hit = /^\[文件\]\s*(.+)$/.exec(text || '');
    if (文件hit) {
      const 名 = 文件hit[1].trim().split(/[\\/]/).pop() || '文件';
      return (
        <View style={styles.fileRow}>
          <SetIcon name="doc" color={me ? t.mineText : t.herText} />
          <Text style={[styles.fileName, {color: me ? t.mineText : t.herText}]} numberOfLines={1}>
            {名}
          </Text>
          <Pressable onPress={() => void 存文件(名)} hitSlop={8} style={styles.fileBtn}>
            <Text style={{color: t.accent, fontSize: 12}}>保存</Text>
          </Pressable>
        </View>
      );
    }

    // 「[表情] http://…/api/meme?…」→ 直接当成一张图。地址里带 q/tag 参数，
    // 归一到我们自己的服务上、补上令牌，免得因为没带令牌拿回 401
    const memeUrl = /^\[表情\]\s*(https?:\/\/\S+)$/.exec((text || '').trim());
    if (memeUrl) {
      const 图 = 归到本站(memeUrl[1]);
      if (图) {
        return (
          <Pressable onPress={() => set看图(图)}>
            <Image source={{uri: 图}} style={styles.memeImg} resizeMode="contain" />
          </Pressable>
        );
      }
    }

    const re = /\[表情:\s*([^\]]+)\]/g;
    const parts: {t: 'text' | 'meme'; v: string}[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) parts.push({t: 'text', v: text.slice(last, m.index)});
      parts.push({t: 'meme', v: m[1].trim()});
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({t: 'text', v: text.slice(last)});
    if (!parts.length) return null;

    return (
      <>
        {parts.map((p, i) =>
          p.t === 'meme' ? (
            <MarkedMeme key={i} desc={p.v} dim={t.dim} onOpen={set看图} />
          ) : p.v.trim() ? (
            <View key={i}>{带链接(p.v, me ? t.mineText : t.herText)}</View>
          ) : null,
        )}
      </>
    );
  };

  const renderRow = useCallback(
    ({item}: {item: Row}) => {
      if (item.kind === 'time') {
        return (
          <View style={styles.timeWrap}>
            <Text style={[styles.timeText, {color: t.dim}]}>{dayTime(item.ts)}</Text>
          </View>
        );
      }
      const m = item.msg;
      const me = m.role === 'user';
      // 「[表情] http://…」这种消息渲染成图，不显示那串标记
      const memeHit = /^\[表情\]\s*(\S+)/.exec(m.text || '');
      const memeUrl = memeHit ? memeHit[1] : '';
      return (
        <View style={[styles.row, me ? styles.rowMe : styles.rowHer]}>
          <View style={styles.bubbleWrap}>
            <Pressable
              onLongPress={() => {
                Clipboard.setString(m.text);
                飘一句(m.text.startsWith('[表情]') ? '表情的地址复制了' : '已复制');
              }}
              delayLongPress={350}>
              <View
                style={[
                  styles.bubble,
                  me
                    ? {backgroundColor: t.mine, borderBottomRightRadius: 4}
                    : {
                        // 我发的气泡做成半透明：底下那张背景能透上来，
                        // 看着像字浮在水面上，而不是一块实心板压着
                        backgroundColor: t.dark
                          ? 'rgba(38,38,64,0.62)'
                          : 'rgba(236,234,244,0.68)',
                        borderBottomLeftRadius: 4,
                      },
                  memeUrl ? styles.bubbleMeme : null,
                ]}>
                {memeUrl ? (
                  <Image
                    // 地址里必须带令牌：Image 的 header 在部分安卓机上会被丢掉，
                    // 一丢就是 401，气泡里只剩一块空白（他上次就是长按才拷出这串标记）
                    source={{uri: 归到本站(memeUrl), headers: {'x-lanxi-token': token}}}
                    style={styles.memeImg}
                    resizeMode="contain"
                  />
                ) : (
                  renderBody(m.text, me)
                )}
              </View>
            </Pressable>
            {me && (
              <View style={styles.tail}>
                <WhaleTail size={12} color={t.wave} />
              </View>
            )}
          </View>
          {m.failed ? (
            <Pressable onPress={() => retry(m)}>
              <Text style={[styles.failed, {color: t.danger}]}>没发出去，点一下重发</Text>
            </Pressable>
          ) : (
            <Text style={[styles.meta, {color: t.dim}]}>{hhmm(m.ts)}</Text>
          )}
        </View>
      );
    },
    [t, retry],
  );

  // ---------- 启动页 ----------
  const splash = !splashGone && (
    <Animated.View
      style={[styles.splash, {opacity: splashFade}]}
      pointerEvents="none">
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#12121F" />
            <Stop offset="1" stopColor="#303054" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#sea)" />
      </Svg>
      <Animated.Image
        source={{uri: whaleArt}}
        style={[styles.splashArt, {opacity: artFade}]}
        resizeMode="contain"
      />
      <View style={styles.splashWords}>
        <Text style={styles.splashTitle}>鲸笺</Text>
        <Text style={styles.splashEn}>Whaletter</Text>
        <View style={styles.splashWave}>
          <WaveLine width={96} color="#6478AA" />
        </View>
        <Text style={styles.splashMotto}>A little letter from the deep</Text>
      </View>
    </Animated.View>
  );

  // ---------- 设置页 ----------
  if (booting) {
    return <View style={styles.fill}>{splash}</View>;
  }

  if (setupOpen) {
    const 外观名 =
      themeMode === 'system' ? '跟随系统' : themeMode === 'light' ? '浅色' : '深色';
    const 换外观 = () =>
      pickTheme(themeMode === 'system' ? 'light' : themeMode === 'light' ? 'dark' : 'system');
    return (
      <SafeAreaView style={[styles.fill, {backgroundColor: t.bg}]}>
        <StatusBar barStyle={t.dark ? 'light-content' : 'dark-content'} backgroundColor={t.bg} />

        <View style={styles.setHead}>
          <Pressable onPress={() => setSetupOpen(false)} hitSlop={16} style={styles.setBack}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path
                d="M15 5 L8 12 L15 19"
                fill="none"
                stroke={t.text}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
          <Text style={[styles.setTitle, {color: t.text}]}>设置</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.setBody}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {/* 第一组：账号 / 数据 */}
          <View style={[styles.setCard, {backgroundColor: t.surface}]}>
            <SetRow
              icon="person"
              label="账号管理"
              value={server ? server.replace(/^https?:\/\//, '') : '还没连'}
              onPress={() => set账号开(v => !v)}
              colors={t}
            />
            {账号开 && (
              <View style={styles.setPanel}>
                {/* 已有的线，点一条就切过去 */}
                {线表.map(l => (
                  <Pressable
                    key={l.id}
                    onPress={() => void 切到(l)}
                    style={({pressed}) => [
                      styles.lineRow,
                      {borderColor: 当前线 === l.id ? t.accent : t.line},
                      pressed && {opacity: 0.6},
                    ]}>
                    <Text style={[styles.lineName, {color: t.text}]}>
                      {当前线 === l.id ? 名 : l.name}
                    </Text>
                    <Text style={[styles.lineAddr, {color: t.dim}]} numberOfLines={1}>
                      {l.server.replace(/^https?:\/\//, '')}
                    </Text>
                    {当前线 === l.id && (
                      <Text style={{color: t.accent, fontSize: 12, marginLeft: 8}}>在用</Text>
                    )}
                  </Pressable>
                ))}

                {/* 改当前这条：换了网、换过令牌，得能就地改，不能只能新加一条 */}
                {改线开 ? (
                  <>
                    <Text style={[styles.setHint, {color: t.dim}]}>服务器地址</Text>
                    <TextInput
                      style={[styles.setInput, {backgroundColor: t.bg, color: t.text, borderColor: t.line}]}
                      value={serverDraft}
                      onChangeText={setServerDraft}
                      placeholder="192.168.1.10:8791"
                      placeholderTextColor={t.dim}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                    />
                    <Text style={[styles.setHint, {color: t.dim}]}>访问令牌</Text>
                    <TextInput
                      style={[styles.setInput, {backgroundColor: t.bg, color: t.text, borderColor: t.line}]}
                      value={tokenDraft}
                      onChangeText={setTokenDraft}
                      placeholder="那边定的那串"
                      placeholderTextColor={t.dim}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                    />
                    <View style={styles.setBtns}>
                      <Pressable
                        onPress={() => {
                          set改线开(false);
                          setSetupErr('');
                        }}
                        style={({pressed}) => [
                          styles.ghostBtn,
                          {borderColor: t.line, opacity: pressed ? 0.7 : 1},
                        ]}>
                        <Text style={[styles.ghostBtnText, {color: t.text}]}>算了</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void 存当前这条()}
                        style={({pressed}) => [
                          styles.primaryBtn,
                          {backgroundColor: t.accent, opacity: pressed ? 0.85 : 1},
                        ]}>
                        <Text style={styles.primaryBtnText}>存下</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <Pressable
                    onPress={() => {
                      setServerDraft(server);
                      setTokenDraft(token);
                      set加线开(false);
                      set改线开(true);
                      setSetupErr('');
                    }}
                    style={({pressed}) => [
                      styles.addLineRow,
                      {borderColor: t.line},
                      pressed && {opacity: 0.6},
                    ]}>
                    <Text style={{color: t.accent, fontSize: 18, marginRight: 6}}>✎</Text>
                    <Text style={{color: t.text, fontSize: 14}}>改这条的地址和令牌</Text>
                  </Pressable>
                )}

                {加线开 ? (
                  <>
                    <Text style={[styles.setHint, {color: t.dim}]}>名字</Text>
                    <TextInput
                      style={[styles.setInput, {backgroundColor: t.bg, color: t.text, borderColor: t.line}]}
                      value={新线名}
                      onChangeText={set新线名}
                      placeholder="比如 家里那台"
                      placeholderTextColor={t.dim}
                    />
                    <Text style={[styles.setHint, {color: t.dim}]}>服务器地址</Text>
                    <TextInput
                      style={[styles.setInput, {backgroundColor: t.bg, color: t.text, borderColor: t.line}]}
                      value={serverDraft}
                      onChangeText={setServerDraft}
                      placeholder="192.168.1.10:8791"
                      placeholderTextColor={t.dim}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                    />
                    <Text style={[styles.setHint, {color: t.dim}]}>访问令牌</Text>
                    <TextInput
                      style={[styles.setInput, {backgroundColor: t.bg, color: t.text, borderColor: t.line}]}
                      value={tokenDraft}
                      onChangeText={setTokenDraft}
                      placeholder="那边定的那串"
                      placeholderTextColor={t.dim}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                    />
                    <View style={styles.setBtns}>
                      <Pressable
                        onPress={async () => {
                          setChecking(true);
                          setSetupErr('');
                          try {
                            await tryConnect(normalizeServer(serverDraft), tokenDraft.trim());
                            setSetupErr('连上了，点「加进来」');
                          } catch (e: any) {
                            setSetupErr(`连不上：${e.message}`);
                          } finally {
                            setChecking(false);
                          }
                        }}
                        style={({pressed}) => [
                          styles.ghostBtn,
                          {borderColor: t.line, opacity: pressed || checking ? 0.7 : 1},
                        ]}>
                        <Text style={[styles.ghostBtnText, {color: t.text}]}>
                          {checking ? '检测中…' : '检测'}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={async () => {
                          const srv = normalizeServer(serverDraft);
                          const tok = tokenDraft.trim();
                          if (!srv || !tok) return setSetupErr('地址和令牌都要填');
                          const 新: 线 = {
                            id: `l${Date.now()}`,
                            name: 新线名.trim() || '新的线',
                            server: srv,
                            token: tok,
                          };
                          await 存线([...线表, 新]);
                          set加线开(false);
                          set新线名('');
                          setSetupErr('');
                        }}
                        style={({pressed}) => [
                          styles.primaryBtn,
                          {backgroundColor: t.accent, opacity: pressed ? 0.85 : 1},
                        ]}>
                        <Text style={styles.primaryBtnText}>加进来</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <Pressable
                    onPress={() => set加线开(true)}
                    style={({pressed}) => [
                      styles.addLineRow,
                      {borderColor: t.line},
                      pressed && {opacity: 0.6},
                    ]}>
                    <Text style={{color: t.accent, fontSize: 18, marginRight: 6}}>＋</Text>
                    <Text style={{color: t.text, fontSize: 14}}>加一条线</Text>
                  </Pressable>
                )}

                {!!setupErr && (
                  <Text
                    style={[
                      styles.err,
                      {color: setupErr.startsWith('连上了') ? t.accent : t.danger},
                    ]}>
                    {setupErr}
                  </Text>
                )}
              </View>
            )}
            <SetDivider line={t.line} />
            <SetRow
              icon="data"
              label="清空聊天窗口"
              value="只清这台手机"
              onPress={() => {
                Alert.alert(
                  '清空聊天窗口',
                  '只清这台手机上看得见的，电脑那份一个字都不动，随时能再拉回来。',
                  [
                    {text: '算了', style: 'cancel'},
                    {
                      text: '清',
                      style: 'destructive',
                      onPress: async () => {
                        const 最高 = messages.reduce((a, m) => Math.max(a, m.seq), 0);
                        set清到(最高);
                        setShown(PAGE);
                        try {
                          await AsyncStorage.setItem(KEY_CLEARED, String(最高));
                        } catch (e) {}
                      },
                    },
                  ],
                );
              }}
              colors={t}
              last
            />
          </View>

          {/* 应用 */}
          <Text style={[styles.setSection, {color: t.dim}]}>应用</Text>
          <View style={[styles.setCard, {backgroundColor: t.surface}]}>
            <SetRow
              icon="person"
              label="对方的名字"
              value={名}
              onPress={() => {
                set名字稿(名);
                set名字开(v => !v);
              }}
              colors={t}
            />
            {名字开 && (
              <View style={styles.setPanel}>
                <TextInput
                  style={[styles.setInput, {backgroundColor: t.bg, color: t.text, borderColor: t.line}]}
                  value={名字稿}
                  onChangeText={set名字稿}
                  placeholder="比如 鲸鱼娘"
                  placeholderTextColor={t.dim}
                />
                <View style={styles.setBtns}>
                  <Pressable
                    onPress={() => set名字开(false)}
                    style={({pressed}) => [
                      styles.ghostBtn,
                      {borderColor: t.line, opacity: pressed ? 0.7 : 1},
                    ]}>
                    <Text style={[styles.ghostBtnText, {color: t.text}]}>算了</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const 新名 = 名字稿.trim() || 默认名字;
                      set名(新名);
                      set名字开(false);
                      AsyncStorage.setItem(KEY_NAME, 新名).catch(() => {});
                      // 消息列表和账号管理里显示的是「这条线的名字」，
                      // 光改 名 那两处不会跟着变——顺手把当前这条线也改名
                      void 存线(线表.map(x => (x.id === 当前线 ? {...x, name: 新名} : x)));
                    }}
                    style={({pressed}) => [
                      styles.primaryBtn,
                      {backgroundColor: t.accent, opacity: pressed ? 0.85 : 1},
                    ]}>
                    <Text style={styles.primaryBtnText}>存下</Text>
                  </Pressable>
                </View>
              </View>
            )}
            <SetDivider line={t.line} />
            <SetRow icon="moon" label="外观" value={外观名} onPress={换外观} colors={t} />
            <SetDivider line={t.line} />
            <SetRow
              icon="chat"
              label="后台常驻"
              value={常驻 ? '开着（通知栏有一条）' : '关着（切出去就不响）'}
              onPress={() => {
                const 新 = !常驻;
                set常驻(新);
                AsyncStorage.setItem(KEY_ALIVE, 新 ? '1' : '0').catch(() => {});
              }}
              colors={t}
              last
            />
          </View>

          {/* 关于 */}
          <Text style={[styles.setSection, {color: t.dim}]}>关于</Text>
          <View style={[styles.setCard, {backgroundColor: t.surface}]}>
            <SetRow
              icon="info"
              label="试一下通知"
              value={通知结果}
              onPress={试通知}
              colors={t}
            />
            <SetDivider line={t.line} />
            <SetRow
              icon="info"
              label="检查更新"
              value={updBusy ? '处理中…' : updCur || '出厂这版'}
              onPress={doUpdateCheck}
              colors={t}
            />
            <SetDivider line={t.line} />
            <SetRow
              icon="doc"
              label="回到出厂版本"
              value={updMsg || ''}
              onPress={doRevert}
              colors={t}
            />
            <SetDivider line={t.line} />
            <SetRow
              icon="doc"
              label="说明"
              onPress={() => set说明开(true)}
              colors={t}
              last
            />
          </View>

          <View style={styles.setFoot}>
            <Text style={[styles.footText, {color: t.dim}]}>鲸笺 · Whaletter</Text>
          </View>
        </ScrollView>

        {/* 说明：单独铺一层，内容先占位，慢慢补 */}
        {说明开 && (
          <View style={[StyleSheet.absoluteFill, {backgroundColor: t.bg, zIndex: 35}]}>
            <View style={styles.setHead}>
              <Pressable onPress={() => set说明开(false)} hitSlop={16} style={styles.setBack}>
                <Svg width={22} height={22} viewBox="0 0 24 24">
                  <Path
                    d="M15 5 L8 12 L15 19"
                    fill="none"
                    stroke={t.text}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </Pressable>
              <Text style={[styles.setTitle, {color: t.text}]}>说明</Text>
            </View>
            <ScrollView contentContainerStyle={styles.setBody} showsVerticalScrollIndicator={false}>
              <Text style={[styles.aboutText, {color: t.text}]}>{说明文字}</Text>
              <View style={styles.setFoot}>
                <Text style={[styles.footText, {color: t.dim}]}>鲸笺 · Whaletter</Text>
              </View>
            </ScrollView>
          </View>
        )}
        {/* 设置页也盖一下启动页，不然一进来直接是设置，看着像没有开场 */}
        {splash}
      </SafeAreaView>
    );
  }

  /** 背景层：哪一页要哪张就传哪张。铺满 = cover（消息页要全屏），
   *  淡 = 透明度（聊天页半透明，免得压过字）。zIndex 0，内容永远在它上面 */
  const 背景层 = (图: string | null, 铺满 = false, 淡 = 1) =>
    图 ? (
      <Image
        source={{uri: 图}}
        style={[styles.chatBg, 淡 === 1 ? null : {opacity: 淡}]}
        resizeMode={铺满 || 图 !== whaleArt ? 'cover' : 'contain'}
      />
    ) : null;

  /** 表情库：消息页和聊天页共用一个（侧栏那一行两边都能点，别只挂在一个页上） */
  const 表情库 = galleryOpen ? (
    <View style={[StyleSheet.absoluteFill, {zIndex: 30, backgroundColor: t.bg}]}>
      <MemeGallery
        onClose={() => setGalleryOpen(false)}
        colors={{
          bg: t.bg,
          surface: t.surface,
          text: t.text,
          dim: t.dim,
          line: t.line,
          accent: t.accent,
        }}
      />
    </View>
  ) : null;

  /** 侧栏本体：消息页和聊天页共用一个 */
  const 抽屉 = (
    <>
      {/* 左侧栏：点头像从左边推出来 */}
      {drawerOpen && (
        <Pressable style={styles.drawerMask} onPress={() => setDrawerOpen(false)} />
      )}
      <Animated.View
        pointerEvents={drawerOpen ? 'auto' : 'none'}
        style={[
          styles.drawer,
          {backgroundColor: t.surface, transform: [{translateX: drawerX}]},
        ]}>
        <View style={[styles.drawerHead, {borderBottomColor: t.line}]}>
          <Pressable onPress={换头像} hitSlop={8}>
            <Image source={{uri: 我的头像}} style={styles.drawerAvatar} />
          </Pressable>
          <View style={styles.who}>
            <Text style={[styles.drawerName, {color: t.text}]}>{名}</Text>
            <Text style={[styles.sub, {color: t.dim}]}>{状态词}</Text>
          </View>
        </View>

        <Pressable
          style={styles.drawerItem}
          onPress={() => {
            setDrawerOpen(false);
            setGalleryOpen(true);
          }}>
          <Text style={[styles.drawerItemText, {color: t.text}]}>表情包</Text>
          <Text style={[styles.drawerItemHint, {color: t.dim}]}>我有的都在这儿</Text>
        </Pressable>

        <Pressable
          style={styles.drawerItem}
          onPress={() => {
            setDrawerOpen(false);
            换壁纸('chat');
          }}>
          <SetIcon name="picture" color={t.dim} />
          <Text style={[styles.drawerItemText, {color: t.text}]}>聊天页背景</Text>
          <Text style={[styles.drawerItemHint, {color: t.dim}]}>{背景 ? '有' : '没有'}</Text>
        </Pressable>

        <Pressable
          style={styles.drawerItem}
          onPress={() => {
            setDrawerOpen(false);
            换壁纸('msg');
          }}>
          <SetIcon name="picture" color={t.dim} />
          <Text style={[styles.drawerItemText, {color: t.text}]}>消息页背景</Text>
          <Text style={[styles.drawerItemHint, {color: t.dim}]}>{消息背景 ? '有' : '没有'}</Text>
        </Pressable>

        {/* 设置挂在最底下，跟系统里那些抽屉一个位置感 */}
        <View style={[styles.drawerBottom, {borderTopColor: t.line}]}>
          <Pressable
            style={styles.drawerItem}
            onPress={() => {
              setDrawerOpen(false);
              setServerDraft(server);
              setTokenDraft(token);
              setSetupErr('');
              setSetupOpen(true);
            }}>
            <SetIcon name="gear" color={t.dim} />
            <Text style={[styles.drawerItemText, {color: t.text}]}>设置</Text>
          </Pressable>
        </View>
      </Animated.View>

    </>
  );

  // ---------- 底下两栏：消息 / 空间 ----------
  if (页 !== 'chat') {
    const 末条 = messages.length ? messages[messages.length - 1] : null;
    const 末句 = !末条
      ? '还没说话呢'
      : 末条.text.startsWith('[图片]')
      ? '[图片]'
      : 末条.text.startsWith('[表情]')
      ? '[表情]'
      : 末条.text.replace(/\n+/g, ' ').slice(0, 30);

    return (
      <SafeAreaView style={[styles.fill, {backgroundColor: t.bg}]}>
        {/* 顶上这条是白纱：半透明白，底下的图还能透出来一点，字也压得住 */}
        <StatusBar
          barStyle={页 === 'msg' || !t.dark ? 'dark-content' : 'light-content'}
          backgroundColor={页 === 'msg' ? 'rgba(255,255,255,0.86)' : t.bg}
        />

        {/* 消息页铺它自己那张，顶到边；空间有自己的海面，别串过去 */}
        {页 === 'msg' && 背景层(消息背景, true)}

        {页 === 'msg' ? (
          <View style={[styles.fill, {zIndex: 1}]}>
            {/* 顶上这一排是白纱：半透明，图透得出来，字也还看得清 */}
            <View style={[styles.homeHead, {backgroundColor: 'rgba(255,255,255,0.86)'}]}>
              <Pressable
                onPress={() => setDrawerOpen(true)}
                hitSlop={14}
                style={styles.hamburger}>
                <View style={[styles.hamLine, styles.hamTop, {backgroundColor: '#242448'}]} />
                <View style={[styles.hamLine, styles.hamBottom, {backgroundColor: '#242448'}]} />
              </Pressable>
              <Text style={[styles.homeTitle, {color: '#242448'}]}>消息</Text>
            </View>

            {/* 连不上要当场说出来，别让人对着一个看着正常的列表干等 */}
            {!!banner && (
              <View style={[styles.banner, {backgroundColor: t.surface}]}>
                <Text style={[styles.bannerText, {color: t.danger}]}>{banner}</Text>
              </View>
            )}

            {线表.map(l => {
              const 在用 = 当前线 === l.id;
              const 预览 = 在用
                ? 末句
                : '点开看看';
              return (
                <Pressable
                  key={l.id}
                  style={({pressed}) => [
                    styles.convRow,
                    {
                      // 一行一块长方形底：压在背景图上面，字就不会被图吃掉
                      backgroundColor: t.surface,
                      borderBottomWidth: 0,
                      borderRadius: 14,
                      marginHorizontal: 12,
                      marginTop: 8,
                    },
                    pressed && {opacity: 0.6},
                  ]}
                  onPress={() => {
                    if (!在用) void 切到(l);
                    set页('chat');
                    setDrawerOpen(false);
                  }}>
                  <Image source={{uri: 我的头像}} style={styles.convAvatar} />
                  <View style={styles.convBody}>
                    <View style={styles.convTop}>
                      <Text style={[styles.convName, {color: t.text}]}>
                        {在用 ? 名 : l.name}
                      </Text>
                      <Text style={[styles.convTime, {color: t.dim}]}>
                        {在用 && 末条 ? hhmm(末条.ts) : ''}
                      </Text>
                    </View>
                    <Text style={[styles.convLast, {color: t.dim}]} numberOfLines={1}>
                      {预览}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

          </View>
        ) : (
          // 底下垫一块深海色：海面图是半透明的，底下要是浅色底，一眼看过去就是白纱
          <View style={[styles.fill, {backgroundColor: '#0B1A2E'}]}>
            {/* 空间永远当深色看：海面是深色的图，跟着外观切浅色字就全糊了 */}
            <空间页
              server={server}
              头像={我的头像}
              名={名}
              主题={{
                ...palette(true),
                text: '#EAF1FF',
                dim: '#A8BCDD',
                line: 'rgba(255,255,255,0.18)',
                accent: '#8FB8FF',
              }}
            />
          </View>
        )}

        {/* 底下那排 */}
        <View style={[styles.tabBar, {backgroundColor: t.surface, borderTopColor: t.line}]}>
          {(
            [
              ['msg', '消息', 'chat'],
              ['space', '空间', 'planet'],
            ] as ['msg' | 'space', string, string][]
          ).map(([k, label, icon]) => (
            <Pressable key={k} onPress={() => set页(k)} style={styles.tabItem}>
              <SetIcon name={icon} color={页 === k ? t.accent : t.dim} />
              <Text
                style={{
                  color: 页 === k ? t.accent : t.dim,
                  fontSize: 11,
                  marginTop: 2,
                }}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* 侧栏本体挂在消息页这一层：汉堡在这儿，抽屉也得在这儿，不然点了没东西出来 */}
        {抽屉}

        {/* 表情库同理：从这一页点的，就得在这一页弹出来 */}
        {表情库}

        {看图 && (
          <Pressable
            style={[styles.zoomWrap, {backgroundColor: 'rgba(0,0,0,0.94)'}]}
            onPress={() => set看图(null)}>
            <Image source={{uri: 看图}} style={styles.zoomImg} resizeMode="contain" />
          </Pressable>
        )}
        {splash}
      </SafeAreaView>
    );
  }

  // ---------- 聊天 ----------
  return (
    <SafeAreaView style={[styles.fill, {backgroundColor: t.bg}]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={t.header}
      />
      {背景层(背景)}
      <KeyboardAvoidingView
        style={[styles.fill, {paddingBottom: Platform.OS === 'ios' ? kbHeight : 0}]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.topbar, {backgroundColor: t.header}]}>
          <Image source={{uri: 我的头像}} style={styles.avatar} />
          <View style={styles.who}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, {color: t.headerText}]}>{名}</Text>
              <小鲸鱼 天={相伴天数} />
            </View>
            <Text style={[styles.sub, {color: '#B4A8C0'}]}>{状态词}</Text>
          </View>
        </View>

        {!!banner && (
          <View style={[styles.banner, {backgroundColor: t.surface}]}>
            <Text style={[styles.bannerText, {color: t.danger}]}>{banner}</Text>
          </View>
        )}

        <FlatList
          ref={listRef}
          style={styles.fill}
          // 倒过来排（跟 QQ / 微信一样）：最新那条在底下，往上翻是往数组后面走。
          // 这样「添更早的消息」永远是往尾部追加，不会在你看的地方上面插东西，
          // 位置从结构上就不会跳——之前用像素补偿补了两次都没治住。
          // 空的时候不翻，不然那张空状态的图会倒过来
          inverted={visibleRows.length > 0}
          contentContainerStyle={
            visibleRows.length ? styles.listPad : styles.listPadEmpty
          }
          data={倒序}
          keyExtractor={item => item.key}
          renderItem={renderRow}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.12}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Image
                source={{uri: whaleArt}}
                style={styles.emptyArt}
                resizeMode="contain"
              />
              <Text style={[styles.emptyTitle, {color: t.dim}]}>还没说话呢</Text>
            </View>
          }
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={32}
          onScroll={e => {
            const {contentOffset} = e.nativeEvent;
            // 倒过来的列表里，偏移越小越靠近最新那条
            stickBottom.current = contentOffset.y <= 120;
          }}
          onContentSizeChange={() => {
            // 贴着底部时才跟着沉下去；人翻在上面就别动他
            if (stickBottom.current) 落到最新(false);
          }}
          onLayout={() => {
            if (stickBottom.current) 落到最新(false);
          }}
        />

        <View style={[styles.composer, {backgroundColor: t.surface, borderTopColor: t.line}]}>
          <Pressable
            onPress={() => { Keyboard.dismiss(); setMemeOpen(v => !v); }}
            hitSlop={8}
            style={styles.memeBtn}>
            <Svg width={23} height={23} viewBox="0 0 48 48">
              <G
                fill="none"
                stroke={t.dim}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round">
                <Path d="M10.5 24a13.5 13.5 0 1 1 27 0 13.5 13.5 0 0 1-27 0" />
                <Path d="M17 19.6c1.4-1.1 3.6-1.1 5 0" />
                <Path d="M26 19.6c1.4-1.1 3.6-1.1 5 0" />
                <Path d="M17.4 27.6c2.2 3.1 5.2 4.5 6.6 4.5s4.4-1.4 6.6-4.5" />
                <Path d="M17 37.6c2.6-2.3 5.2-2.3 7 0s4.4 2.3 7 0" />
              </G>
            </Svg>
          </Pressable>
          <Pressable
            onPress={() =>
              Alert.alert('发点什么', '', [
                {text: '发图片', onPress: () => void pickAndSend()},
                {text: '发文件', onPress: () => void 发文件()},
                {text: '算了', style: 'cancel'},
              ])
            }
            disabled={picking}
            hitSlop={8}
            style={styles.memeBtn}>
            {picking ? (
              <ActivityIndicator size="small" color={t.dim} />
            ) : (
              <Svg width={22} height={22} viewBox="0 0 48 48">
                <G fill="none" stroke={t.dim} strokeWidth={2.4} strokeLinecap="round">
                  <Path d="M24 12v24" />
                  <Path d="M12 24h24" />
                </G>
              </Svg>
            )}
          </Pressable>
          <TextInput
            style={[
              styles.textInput,
              {backgroundColor: t.dark ? t.bg : '#FFFFFF', color: t.text, borderColor: t.line},
            ]}
            value={draft}
            onChangeText={setDraft}
            onFocus={() => {
              // 点输入框、键盘升起来之前先贴近底部，能少露一截被挡的
              落到最新(true);
            }}
            placeholder="说点什么…"
            placeholderTextColor={t.dim}
            multiline
            maxLength={8000}
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim() || sending}
            style={({pressed}) => [
              styles.sendBtn,
              {
                backgroundColor: !draft.trim() || sending ? t.line : t.accent,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text
                style={[
                  styles.sendArrow,
                  {color: !draft.trim() ? t.dim : '#FFFFFF'},
                ]}>
                ↑
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* 表情面板：从底部长出来，盖在输入栏上方 */}
      {memeOpen && (
        <View style={[styles.memePanel, {backgroundColor: t.surface, borderTopColor: t.line}]}>
          <View style={styles.memeTabs}>
            {MEME_TAGS.map(([k, label]) => (
              <Pressable
                key={k}
                onPress={() => setMemeTag(k)}
                style={[
                  styles.memeTab,
                  {
                    backgroundColor: memeTag === k ? t.accent : 'transparent',
                    borderColor: t.line,
                  },
                ]}>
                <Text
                  style={{
                    color: memeTag === k ? '#fff' : t.dim,
                    fontSize: 12,
                  }}>
                  {label}
                </Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setMemeOpen(false)} style={styles.memeClose}>
              <Text style={{color: t.dim, fontSize: 15}}>×</Text>
            </Pressable>
          </View>

          {memeLoading ? (
            <ActivityIndicator style={{marginTop: 24}} color={t.accent} />
          ) : !memeHas ? (
            <Text style={{color: t.dim, fontSize: 12, textAlign: 'center', marginTop: 24}}>
              表情库还没打开
            </Text>
          ) : memes.length === 0 ? (
            <Text style={{color: t.dim, fontSize: 12, textAlign: 'center', marginTop: 24}}>
              这个分类还没图
            </Text>
          ) : (
            <ScrollView contentContainerStyle={styles.memeGrid}>
              {memes.map(m => (
                <Pressable
                  key={m.i}
                  onPress={() => void sendMeme(m.url)}
                  style={styles.memeCell}>
                  <Image
                    source={{uri: m.url, headers: {'x-lanxi-token': token}}}
                    style={styles.memeThumb}
                    resizeMode="contain"
                  />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}
      {抽屉}

      {/* 复制之后飘一句，别让人猜到底复制上没有 */}
      {!!提示 && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{提示}</Text>
        </View>
      )}

      {splash}

      {/* 点开的大图：铺满一屏，点哪儿都关 */}
      {看图 && (
        <Pressable
          style={[styles.zoomWrap, {backgroundColor: 'rgba(0,0,0,0.94)'}]}
          onPress={() => set看图(null)}>
          <Image source={{uri: 看图}} style={styles.zoomImg} resizeMode="contain" />
        </Pressable>
      )}
    </SafeAreaView>
  );
}

/** 凡是带字号的样式，都挂上默认字体；不想改字号的旁支就不动 */
function 补字体(表: Record<string, any>) {
  const 出: Record<string, any> = {};
  for (const k of Object.keys(表)) {
    const v = 表[k];
    出[k] =
      v && typeof v === 'object' && !Array.isArray(v) && 'fontSize' in v
        ? {...v, fontFamily: 字体}
        : v;
  }
  return 出;
}

const styles = StyleSheet.create(补字体({
  fill: {flex: 1},

  // 左侧栏
  drawerMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
    zIndex: 20,
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 272,
    zIndex: 21,
    paddingTop: 54,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  drawerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerAvatar: {width: 48, height: 48, borderRadius: 24, marginRight: 12, backgroundColor: '#303054'},
  drawerName: {fontSize: 16, fontWeight: '600'},
  drawerItem: {paddingHorizontal: 18, paddingVertical: 16, flexDirection: 'row', alignItems: 'center'},
  drawerItemText: {fontSize: 15},
  drawerItemHint: {fontSize: 11, marginLeft: 10},
  drawerBottom: {marginTop: 'auto', borderTopWidth: StyleSheet.hairlineWidth},

  // 设置页（仿系统设置的卡片式）
  setHead: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 6, paddingBottom: 10},
  setBack: {width: 40, height: 40, alignItems: 'center', justifyContent: 'center'},
  setTitle: {fontSize: 18, fontWeight: '600'},
  setBody: {paddingHorizontal: 16, paddingBottom: 40},
  setCard: {borderRadius: 16, overflow: 'hidden', marginBottom: 22},
  setRow: {flexDirection: 'row', alignItems: 'center', minHeight: 54, paddingHorizontal: 16},
  setLabel: {fontSize: 16, flex: 1},
  setValue: {fontSize: 13, maxWidth: 190, textAlign: 'right'},
  setArrow: {fontSize: 20, marginLeft: 8, marginTop: -2},
  setSection: {fontSize: 12, marginLeft: 18, marginBottom: 8, letterSpacing: 0.5},
  setPanel: {paddingHorizontal: 16, paddingBottom: 16},
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  lineName: {fontSize: 14, fontWeight: '600'},
  lineAddr: {fontSize: 11, flex: 1, marginLeft: 10},
  addLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 12,
  },
  setHint: {fontSize: 12, marginBottom: 6, marginTop: 10},
  setInput: {borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14},
  setBtns: {flexDirection: 'row', gap: 10, marginTop: 14},
  setFoot: {alignItems: 'center', marginTop: 4},
  aboutText: {fontSize: 15, lineHeight: 25},
  zoomWrap: {...StyleSheet.absoluteFillObject, zIndex: 50, alignItems: 'center', justifyContent: 'center'},
  zoomImg: {width: '100%', height: '100%'},
  // 背景图：两个页面共用一张，铺在内容下面。以前压到 0.1 几乎看不见，
  // 他要「透明」——那就让这页自己的底色让开，图照原样露出来
  chatBg: {...StyleSheet.absoluteFillObject, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none"},
  fileRow: {flexDirection: 'row', alignItems: 'center', maxWidth: 230},
  fileName: {fontSize: 13, flex: 1, marginRight: 8},
  fileBtn: {paddingHorizontal: 8, paddingVertical: 4},

  // 首页两栏
  homeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: (StatusBar.currentHeight || 24) + 8,
    paddingBottom: 10,
  },
  homeTitle: {fontSize: 26, fontWeight: '700', flex: 1, pointerEvents: 'none'} as any,
  hamburger: {width: 44, height: 44, justifyContent: 'center', paddingLeft: 2, marginRight: 2},
  hamLine: {height: 2, borderRadius: 1},
  hamTop: {width: 22},
  hamBottom: {width: 14, marginTop: 5},
  homeAdd: {width: 40, height: 40, alignItems: 'center', justifyContent: 'center'},
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  convAvatar: {width: 50, height: 50, borderRadius: 25, marginRight: 12, backgroundColor: '#303054'},
  convBody: {flex: 1},
  convTop: {flexDirection: 'row', alignItems: 'baseline'},
  convName: {fontSize: 16, fontWeight: '600', flex: 1},
  convTime: {fontSize: 11},
  convLast: {fontSize: 13, marginTop: 4},
  homeHint: {fontSize: 11, textAlign: 'center', marginTop: 18, paddingHorizontal: 30, lineHeight: 18},
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 10,
  },
  tabItem: {flex: 1, alignItems: 'center'},

  // 空间
  spaceSea: {flex: 1, backgroundColor: 'transparent'},
  seaBack: {...StyleSheet.absoluteFillObject, width: '100%', height: '100%', opacity: 0.55},
  spaceBody: {paddingHorizontal: 16, paddingTop: 34, paddingBottom: 30},
  bottle: {flexDirection: 'row', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12},
  spaceHero: {alignItems: 'center'},
  spaceArt: {height: 190, width: '100%', opacity: 0.92, marginTop: 4},
  spaceTop: {alignItems: 'center', paddingTop: 64, paddingBottom: 22},
  spaceAvatar: {width: 72, height: 72, borderRadius: 36, backgroundColor: '#303054'},
  spaceEn: {fontSize: 11, letterSpacing: 4, marginTop: 5, textTransform: 'uppercase'},
  spaceName: {fontSize: 19, fontWeight: '600', marginTop: 12},
  spaceSub: {fontSize: 12, marginTop: 4},
  spaceMotto: {fontSize: 11, marginTop: 8, fontStyle: 'italic', letterSpacing: 0.6},
  spaceEmpty: {fontSize: 13, textAlign: 'center', marginTop: 24},
  spaceCard: {borderRadius: 14, padding: 14, marginBottom: 10},
  spaceTime: {fontSize: 11, marginBottom: 6},
  spaceText: {fontSize: 15, lineHeight: 24},
  spaceFoot: {fontSize: 11, textAlign: 'center', marginTop: 14},

  // 屏幕中间飘一下的小提示
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 120,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: 'rgba(20,20,32,0.86)',
    zIndex: 55,
  },
  toastText: {color: '#F2F1F7', fontSize: 13},

  // 启动页
  // ⚠ zIndex 要给足：下面那层内容提到 1 以后，没写 zIndex 的启动页就被压到后面去了，
  //   看上去就是「启动动画没了」。60 比侧栏(21)、看图(50) 都高
  splash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
  },
  // 全身立绘：让图吃掉剩下的高度，等比缩放，别裁脚
  splashArt: {flex: 1, width: '100%', marginTop: 8},
  splashWords: {alignItems: 'center', paddingBottom: 52, paddingTop: 10},
  splashTitle: {color: '#F0F0F0', fontSize: 34, fontWeight: '600', letterSpacing: 10},
  splashEn: {color: '#8E93B8', fontSize: 13, letterSpacing: 4, marginTop: 6, textTransform: 'uppercase'},
  splashWave: {marginTop: 10},
  splashMotto: {color: '#B4A8C0', fontSize: 13, letterSpacing: 1.5, marginTop: 18, fontStyle: 'italic'},

  // 顶部
  topbar: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10},
  avatar: {width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: '#303054'},
  who: {flex: 1},
  name: {fontSize: 15, fontWeight: '600'},
  nameRow: {flexDirection: 'row', alignItems: 'center'},
  sub: {fontSize: 11, marginTop: 2},
  gear: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},

  banner: {paddingVertical: 7, paddingHorizontal: 14},
  bannerText: {fontSize: 12, textAlign: 'center'},

  // 列表
  listPad: {paddingHorizontal: 14, paddingVertical: 6},
  listPadEmpty: {flexGrow: 1, justifyContent: 'center', alignItems: 'center'},
  empty: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  emptyArt: {flex: 1, width: '94%', marginBottom: 4},
  emptyTitle: {fontSize: 15},
  timeWrap: {alignItems: 'center', marginVertical: 8},
  timeText: {fontSize: 11},

  row: {marginVertical: 6, maxWidth: '86%'},
  rowMe: {alignSelf: 'flex-end', alignItems: 'flex-end'},
  rowHer: {alignSelf: 'flex-start', alignItems: 'flex-start'},
  bubbleWrap: {position: 'relative'},
  bubble: {paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18},
  bubbleText: {fontSize: 15, lineHeight: 15 * 1.45},
  tail: {position: 'absolute', right: -11, bottom: 1},
  meta: {fontSize: 11, marginTop: 3, marginHorizontal: 4},
  failed: {fontSize: 11, marginTop: 3, marginHorizontal: 4},

  // 输入区
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 132,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 15,
    marginRight: 10,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendArrow: {fontSize: 22, fontWeight: '600', marginTop: -2},

  // 设置页
  setupWrap: {flex: 1, justifyContent: 'center', paddingHorizontal: 22},
  setupAvatar: {width: 64, height: 64, borderRadius: 32, alignSelf: 'center', marginBottom: 10},
  setupTitle: {fontSize: 24, fontWeight: '600', letterSpacing: 6, textAlign: 'center', marginBottom: 8},
  label: {fontSize: 11, marginTop: 16, marginBottom: 6},
  input: {
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  setupBtns: {flexDirection: 'row', gap: 10, marginTop: 20},
  ghostBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: {fontSize: 14},
  primaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {color: '#FFFFFF', fontSize: 15, fontWeight: '600'},
  err: {fontSize: 12.5, marginTop: 12, textAlign: 'center'},
  themeRow: {flexDirection: 'row', gap: 8},
  themeChip: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memeBtn: {width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginRight: 2},
  memePanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '58%',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 12,
  },
  memeTabs: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, marginBottom: 8},
  memeTab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  memeClose: {marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 4},
  memeGrid: {flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, gap: 6},
  memeCell: {width: '23%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden'},
  memeThumb: {width: '100%', height: '100%'},
  bubbleMeme: {padding: 3, backgroundColor: 'transparent'},
  memeImg: {width: 132, height: 132},

  setupFoot: {marginTop: 28, alignItems: 'center', gap: 10},
  footText: {fontSize: 11},
  footBack: {fontSize: 13},
}));
