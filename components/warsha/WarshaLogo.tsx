import Svg,{Circle,Path} from 'react-native-svg';
import { StyleSheet,View } from 'react-native';
import { AppText } from './Typography';
import { colors,typography } from '@/constants/theme';

type Props={size?:number;variant?:'light'|'dark';compact?:boolean;wordmark?:boolean};

export function WarshaLogo({size=40,variant='light',compact=false,wordmark=false}:Props){
  const ink=variant==='light'?colors.white:colors.background;
  const mark=<Svg accessibilityRole="image" accessibilityLabel="Warsha" width={size} height={size} viewBox="0 0 100 100">
    <Path d="M25 18 C8 32 10 63 30 79 L50 39 L70 79 C90 63 92 32 75 18" fill="none" stroke={ink} strokeWidth={compact?10:8} strokeLinecap="round" strokeLinejoin="round"/>
    <Circle cx="50" cy="18" r="6" fill={ink}/>
  </Svg>;
  if(!wordmark)return mark;
  return <View style={styles.wordmark}>{mark}<AppText style={[styles.name,{color:ink,fontSize:size*.43}]}>WARSHA</AppText></View>;
}
const styles=StyleSheet.create({wordmark:{flexDirection:'row',alignItems:'center',gap:14},name:{fontWeight:typography.medium,letterSpacing:5.5}});

