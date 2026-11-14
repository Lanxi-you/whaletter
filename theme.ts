/**
 * 色板：浅色 / 深色各一套，取自立绘上采的藏青，不是海蓝。
 * 所有页面都从这里拿颜色，别在组件里写死色值。
 */
import type {ThemeMode} from './types';

export /** DESIGN-鲸屋.md 的色板：浅色 / 深色各一套 */
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
export type {Pal};
export type {ThemeMode};
