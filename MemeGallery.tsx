import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import RNFS from 'react-native-fs';
import {launchImageLibrary} from 'react-native-image-picker';

import {EXTRA_MEMES, MATCH_MEMES, BundledMeme} from './memes-bundled';

/**
 * 表情包库：翻一翻我有哪些表情。
 *
 * 图都在安装包里（memes-bundled.ts），没网也翻得开。
 * 点一张能选「保存到相册」或「从这儿删掉」；另外单开一栏「其它」，
 * 放你自己从手机相册加进来的图 —— 那些只存在这台手机上。
 */

const TAGS: [string, string][] = [
  ['happy', '开心'],
  ['angry', '生气'],
  ['sad', '难过'],
  ['shy', '害羞'],
  ['confused', '困惑'],
  ['daily', '日常'],
  ['other', '其它'],
];

const KEY_HIDDEN = 'lanxi.meme.hidden';
const KEY_MINE = 'lanxi.meme.mine';

type Mine = {tag: string; caption: string; src: string};

const 编号 = (m: {tag: string; caption: string}) => `${m.tag}|${m.caption}`;

type Props = {
  onClose: () => void;
  colors: {bg: string; surface: string; text: string; dim: string; line: string; accent: string};
};

export function MemeGallery({onClose, colors}: Props) {
  const [tag, setTag] = useState('happy');
  const [hidden, setHidden] = useState<string[]>([]);
  const [mine, setMine] = useState<Mine[]>([]);
  const [选中, set选中] = useState<BundledMeme | Mine | null>(null);
  const [加着, set加着] = useState(false);

  // 读本地状态：删过哪些、自己加过哪些
  useEffect(() => {
    (async () => {
      try {
        const [h, m] = await AsyncStorage.multiGet([KEY_HIDDEN, KEY_MINE]);
        if (h[1]) setHidden(JSON.parse(h[1]));
        if (m[1]) setMine(JSON.parse(m[1]));
      } catch (e) {}
    })();
  }, []);

  const 存隐藏 = useCallback(async (list: string[]) => {
    setHidden(list);
    try {
      await AsyncStorage.setItem(KEY_HIDDEN, JSON.stringify(list));
    } catch (e) {}
  }, []);

  const 存自己 = useCallback(async (list: Mine[]) => {
    setMine(list);
    try {
      await AsyncStorage.setItem(KEY_MINE, JSON.stringify(list));
    } catch (e) {}
  }, []);

  // 按当前栏筛出来该显示哪些
  const items = useMemo(() => {
    if (tag === 'other') return mine;
    const 全 = [...MATCH_MEMES, ...EXTRA_MEMES].filter(m => m.tag === tag);
    const 藏 = new Set(hidden);
    return 全.filter(m => !藏.has(编号(m)));
  }, [tag, mine, hidden]);

  // 从相册挑一张塞进「其它」
  const 加图 = useCallback(async () => {
    if (加着) return;
    try {
      set加着(true);
      const res = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        includeBase64: true,
        maxWidth: 640,
        maxHeight: 640,
        quality: 0.7,
      });
      if (res.didCancel || !res.assets || !res.assets.length) return;
      const a = res.assets[0];
      if (!a.base64) {
        Alert.alert('这张读不出来', '换一张试试');
        return;
      }
      const 新: Mine = {
        tag: 'other',
        caption: a.fileName || `我加的-${Date.now()}`,
        src: `data:${a.type || 'image/jpeg'};base64,${a.base64}`,
      };
      await 存自己([新, ...mine]);
      setTag('other');
    } catch (e: any) {
      Alert.alert('加不进来', e?.message || '');
    } finally {
      set加着(false);
    }
  }, [加着, mine, 存自己]);

  const 删掉 = useCallback(
    async (m: BundledMeme | Mine) => {
      set选中(null);
      if (m.tag === 'other') {
        await 存自己(mine.filter(x => !(x.tag === m.tag && x.caption === m.caption)));
        return;
      }
      await 存隐藏([...hidden, 编号(m)]);
    },
    [hidden, mine, 存自己, 存隐藏],
  );

  /**
   * 存到相册：图是 base64 在代码里的，相册模块只认文件路径，
   * 所以先落到缓存目录，再交给系统图库。缓存文件留着不管，系统会自己清。
   */
  const 保存 = useCallback(async (m: BundledMeme | Mine) => {
    set选中(null);
    try {
      let 路径 = m.src;
      if (m.src.startsWith('data:')) {
        const b64 = m.src.slice(m.src.indexOf(',') + 1);
        路径 = `${RNFS.CachesDirectoryPath}/meme-${Date.now()}.jpg`;
        await RNFS.writeFile(路径, b64, 'base64');
      }
      await CameraRoll.saveAsset(路径, {type: 'photo'});
      Alert.alert('存好了', '去相册翻一下就看见');
    } catch (e: any) {
      Alert.alert('没存上', e?.message || '不知道哪儿卡住了');
    }
  }, []);

  return (
    <View style={[styles.fill, {backgroundColor: colors.bg}]}>
      <View style={[styles.head, {borderBottomColor: colors.line}]}>
        <Text style={[styles.title, {color: colors.text}]}>表情包</Text>
        <Text style={[styles.sub, {color: colors.dim}]}>{items.length} 张</Text>
        <Pressable onPress={onClose} hitSlop={14} style={styles.close}>
          <Text style={{color: colors.text, fontSize: 26, lineHeight: 28}}>×</Text>
        </Pressable>
      </View>

      <View style={styles.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TAGS.map(([k, label]) => (
            <Pressable
              key={k}
              onPress={() => setTag(k)}
              style={[
                styles.tab,
                {borderColor: colors.line},
                tag === k && {backgroundColor: colors.accent, borderColor: colors.accent},
              ]}>
              <Text style={{color: tag === k ? '#fff' : colors.dim, fontSize: 13}}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <FlatList
        style={styles.fill}
        data={items}
        keyExtractor={(it, i) => `${it.tag}-${it.caption}-${i}`}
        numColumns={3}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={
          tag === 'other' ? (
            <Pressable
              onPress={() => void 加图()}
              style={[styles.addCell, {borderColor: colors.line, backgroundColor: colors.surface}]}>
              <Text style={{color: colors.accent, fontSize: 26}}>+</Text>
              <Text style={{color: colors.dim, fontSize: 11, marginTop: 2}}>从相册加一张</Text>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{color: colors.dim, fontSize: 13}}>
              {tag === 'other' ? '还没加过图，点上面的加号' : '这一类都删光了'}
            </Text>
          </View>
        }
        renderItem={({item}) => (
          <Pressable
            onPress={() => set选中(item)}
            style={[styles.cell, {backgroundColor: colors.surface}]}>
            <Image source={{uri: item.src}} style={styles.thumb} resizeMode="contain" />
          </Pressable>
        )}
      />

      {/* 点了一张之后：这个小小的操作条 */}
      {选中 && (
        <View style={styles.sheetWrap}>
          <Pressable style={styles.sheetMask} onPress={() => set选中(null)} />
          <View style={[styles.sheet, {backgroundColor: colors.surface, borderColor: colors.line}]}>
            <Image source={{uri: 选中.src}} style={styles.sheetImg} resizeMode="contain" />
            <View style={styles.sheetBtns}>
              <Pressable onPress={() => void 保存(选中)} style={styles.sheetBtn}>
                <Text style={{color: colors.text, fontSize: 15}}>保存到相册</Text>
              </Pressable>
              <Pressable onPress={() => void 删掉(选中)} style={styles.sheetBtn}>
                <Text style={{color: '#E08A88', fontSize: 15}}>从这儿删掉</Text>
              </Pressable>
              <Pressable onPress={() => set选中(null)} style={styles.sheetBtn}>
                <Text style={{color: colors.dim, fontSize: 15}}>算了</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      <Text style={[styles.foot, {color: colors.dim}]}>
        {tag === 'other' ? '这些只存在这台手机上' : '都在手机里，没网也翻得开'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {fontSize: 20, fontWeight: '600'},
  sub: {fontSize: 12, marginLeft: 10},
  close: {marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 2},
  tabsWrap: {paddingVertical: 10},
  tabs: {paddingHorizontal: 14, gap: 8},
  tab: {paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth},
  grid: {paddingHorizontal: 10, paddingBottom: 20},
  row: {gap: 8, marginBottom: 8},
  cell: {flex: 1, aspectRatio: 1, borderRadius: 12, overflow: 'hidden'},
  thumb: {width: '100%', height: '100%'},
  addCell: {
    marginHorizontal: 10,
    marginBottom: 10,
    height: 92,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60},
  foot: {fontSize: 11, textAlign: 'center', paddingBottom: 24, paddingTop: 4},
  sheetWrap: {...StyleSheet.absoluteFillObject, zIndex: 40, justifyContent: 'flex-end'},
  sheetMask: {...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)'},
  sheet: {borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, alignItems: 'center'},
  sheetImg: {width: 132, height: 132, marginBottom: 12},
  sheetBtns: {flexDirection: 'row', gap: 10, alignSelf: 'stretch'},
  sheetBtn: {flex: 1, alignItems: 'center', paddingVertical: 12},
});
