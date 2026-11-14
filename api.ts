/**
 * 跟电脑那边说话的唯一入口。
 * 三件事在这儿一次做完：带令牌、掐超时、把「没成」翻译成人话。
 */
export type ApiInit = {method?: string; body?: unknown; timeout?: number};

export function makeApi(server: string, token: string) {
  return async function api(path: string, init?: ApiInit): Promise<any> {
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
  };
}
