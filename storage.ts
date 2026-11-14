/**
 * 手机本地那点存储。只有一件事要小心：
 * 某一条存坏了（比如图太大撑爆了 SQLite 的读窗口）不能连带把整套设置拖垮。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** 读一条，读不出来就当没有——顺手把坏掉的那条扔掉，下次写就干净了 */
export async function 安全读(k: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(k);
  } catch (e) {
    AsyncStorage.removeItem(k).catch(() => {});
    return null;
  }
}

/** 写一条（失败也不吵，下次还会写） */
export function 存(k: string, v: string) {
  AsyncStorage.setItem(k, v).catch(() => {});
}

/** 删一条 */
export function 删(k: string) {
  AsyncStorage.removeItem(k).catch(() => {});
}
