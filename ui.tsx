/**
 * 界面里反复用的小零件：鲸尾、波浪线、设置页的图标和行。
 * 抽出来是为了让 App.tsx 只管「页面怎么排」，不管「一个小图标怎么画」。
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Ellipse, Path} from 'react-native-svg';

/** 小鲸尾（气泡旁边那个尖、图标同一套形）：两瓣、上翘 */
export function WhaleTail({size = 12, color = '#B4A8C0'}: {size?: number; color?: string}) {
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
export function WaveLine({width = 108, color = '#B4A8C0'}) {
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
export function SetIcon({name, color}: {name: string; color: string}) {
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
      {name === 'chat' && <Path d="M4.5 6.5h15v10h-9l-4.5 3.4v-3.4H4.5z" {...笔} />}
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
export function SetRow({
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
        样式.row,
        !last && {borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line},
        pressed && {opacity: 0.55},
      ]}>
      <SetIcon name={icon} color={colors.text} />
      <Text style={[样式.label, {color: colors.text}]}>{label}</Text>
      {!!value && (
        <Text style={[样式.value, {color: colors.dim}]} numberOfLines={1}>
          {value}
        </Text>
      )}
      <Text style={[样式.arrow, {color: colors.dim}]}>›</Text>
    </Pressable>
  );
}

/** 卡片里两行之间的那条细线（跟行自带的下边线错开用） */
export function SetDivider({line}: {line: string}) {
  return <View style={{height: StyleSheet.hairlineWidth, backgroundColor: line}} />;
}

const 样式 = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', minHeight: 54, paddingHorizontal: 16},
  label: {fontSize: 16, flex: 1},
  value: {fontSize: 13, maxWidth: 190, textAlign: 'right'},
  arrow: {fontSize: 20, marginLeft: 8, marginTop: -2},
});
