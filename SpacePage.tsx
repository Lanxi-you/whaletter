/**
 * 「空间」那一页：往那儿贴的东西，做成海面上的漂流瓶——越新越浮越亮，越旧越沉越暗。
 * 内容来自电脑上的 space.json，多一条就多一个瓶子，不用改代码。
 */
import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Image, ScrollView, StyleSheet, Text, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {seaBg} from './images';
import {dayTime} from './utils';

type 说说 = {ts: number; text: string; img?: string};

/** 空间里的一条：我往那儿贴的东西 */


/**
 * 「空间」那一页：我发的东西，他打开就能看。
 * 内容是电脑上一个静态清单，我写了就多一条，不用重启什么。
 */
export function SpacePage({
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
    <View style={样式.fill}>
      <Image source={{uri: seaBg}} style={样式.seaBack} resizeMode="cover" />
      <ScrollView style={样式.spaceSea} contentContainerStyle={样式.spaceBody} showsVerticalScrollIndicator={false}>
      <View style={样式.spaceHero}>
        <View style={样式.spaceTop}>
          <Image source={{uri: 头像}} style={样式.spaceAvatar} />
          <Text style={[样式.spaceName, {color: 主题.text}]}>{名}</Text>
          <Text style={[样式.spaceEn, {color: '#B9CDF0'}]}>Whaletter</Text>
          <Text style={[样式.spaceMotto, {color: '#B9CDF0'}]}>
            A little letter from the deep
          </Text>
        </View>
      </View>

      {拉中 ? (
        <ActivityIndicator style={{marginTop: 30}} color={主题.accent} />
      ) : 错 ? (
        <Text style={[样式.spaceEmpty, {color: 主题.danger || '#E08A88'}]}>{错}</Text>
      ) : 列表.length === 0 ? (
        <Text style={[样式.spaceEmpty, {color: 主题.dim}]}>还没往这儿贴过东西</Text>
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
                样式.bottle,
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
                <Text style={[样式.spaceTime, {color: '#8FB6E8'}]}>{dayTime(p.ts)}</Text>
                <Text style={[样式.spaceText, {color: '#E8F0FF'}]}>{p.text}</Text>
              </View>
            </View>
          );
        })
      )}

      <Text style={[样式.spaceFoot, {color: '#DCE8FF'}]}>海面是新的，越往下越旧</Text>
      </ScrollView>
    </View>
  );
}


const 样式 = StyleSheet.create({
  fill: {flex: 1},
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

});
