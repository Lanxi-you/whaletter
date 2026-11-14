/** 时间、地址这类到处都要用的小函数 */

/** 10:24 这种 */
export const hhmm = (ts: number) => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 今天的只说时分，不是今天的带上月日 */
export function dayTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${sameDay ? '' : `${d.getMonth() + 1}月${d.getDate()}日 `}${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 「10.0.0.2:8791」「http://x/」都认，统一成不带结尾斜杠的基址 */
export function normalizeServer(raw: string) {
  let s = (raw || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  return s.replace(/\/+$/, '');
}
