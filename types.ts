export type Role = 'user' | 'assistant';
export type Msg = {seq: number; role: Role; text: string; ts: number; failed?: boolean};
/** 一条线 = 一个联系人的后端：填个名字、地址和令牌就能加 */
export type 线 = {id: string; name: string; server: string; token: string};
export type Row = {kind: 'time'; key: string; ts: number} | {kind: 'msg'; key: string; msg: Msg};
export type ThemeMode = 'system' | 'light' | 'dark';
export type ApiState = {
  ok: boolean;
  name: string;
  target: {id: string; title: string};
  alive: boolean;
  lastSeq: number;
  count: number;
};
