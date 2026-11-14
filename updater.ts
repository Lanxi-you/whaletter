import {NativeModules} from 'react-native';

/**
 * 热更新的 JS 半边。
 *
 * 真活儿在 Kotlin 那边（BundleUpdaterModule）：RN 没有可写的文件系统 API，
 * 下载、校验 SHA-256、落到 filesDir/bundle/index.android.bundle 都得走原生。
 * 这里只负责问服务端有没有新版、然后把地址丢过去。
 */

type UpdaterNative = {
  currentVersion(): Promise<string>;
  download(url: string, version: string, sha256: string, note: string): Promise<{version: string; size: number}>;
  clear(): Promise<boolean>;
};

const Native: UpdaterNative | undefined = (NativeModules as any).BundleUpdater;

export type UpdateInfo = {
  version: string;
  note: string;
  size: number;
  sha256: string;
  url: string;
};

/** 问服务端：有没有比 now 更新的包 */
export async function checkUpdate(
  server: string,
  nowVersion: string,
): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(`${server}/update/version.json`, {cache: 'no-store'});
    if (!res.ok) return null;
    const j = await res.json();
    if (!j || !j.version) return null;
    if (String(j.version) === String(nowVersion)) return null;
    return {
      version: String(j.version),
      note: String(j.note || ''),
      size: Number(j.size || 0),
      sha256: String(j.sha256 || ''),
      url: `${server}/update/index.android.bundle`,
    };
  } catch (e) {
    return null;
  }
}

/** 当前跑的是哪一版（空串 = APK 自带的那份） */
export async function currentVersion(): Promise<string> {
  if (!Native) return '';
  try {
    return await Native.currentVersion();
  } catch (e) {
    return '';
  }
}

/** 下载并启用 */
export async function applyUpdate(info: UpdateInfo): Promise<{version: string; size: number}> {
  if (!Native) throw new Error('这个包还不支持热更新，得装新包');
  return await Native.download(info.url, info.version, info.sha256, info.note);
}

/** 丢掉热更新、回到 APK 自带那份（万一新版本起不来） */
export async function revert(): Promise<boolean> {
  if (!Native) return false;
  return await Native.clear();
}

export const hasUpdater = !!Native;