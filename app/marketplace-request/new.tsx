import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { WarshaIcon } from '@/components/warsha/WarshaIcon';
import { categoryIconName } from '@/src/brand/warsha-icons';
import { router,useLocalSearchParams } from 'expo-router';
import { useMemo,useState } from 'react';
import { Alert,Pressable,ScrollView,StyleSheet,TextInput,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { SpecificServiceSelector } from '@/components/warsha/SpecificServiceSelector';
import { BrandLoadingMark as ActivityIndicator } from '@/components/warsha/BrandMark';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useAddresses } from '@/src/addresses/address-context';
import { useAuth } from '@/src/auth/auth-context';
import { useMarketplaceData } from '@/src/data/marketplace-context';
import { useLocalization } from '@/src/i18n/localization';
import { useMarketplaceIntelligence } from '@/src/marketplace-intelligence/marketplace-context';
import { marketplaceRepository } from '@/src/marketplace-intelligence/marketplace-repository';
import { useMarketplaceText } from '@/src/marketplace-intelligence/marketplace-translations';
import { catalogueServiceLabel, specificServicePickerCopy } from '@/src/services/specific-services';
import type { MarketplacePaymentCompatibility,MarketplaceRequestInput,MarketplaceScheduleKind } from '@/src/marketplace-intelligence/marketplace-types';

export default function NewMarketplaceRequest(){
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const params=useLocalSearchParams<{providerId?:string;serviceId?:string;categoryId?:string;flow?:'get_quotes'|'emergency'}>();
  const mt=useMarketplaceText();const{t,isRTL,language}=useLocalization();const{user,mode}=useAuth();const{addresses}=useAddresses();const{categories,services:catalogue,getProvider}=useMarketplaceData();const market=useMarketplaceIntelligence();
  const provider=params.providerId?getProvider(params.providerId):undefined;
  const[categoryId,setCategoryId]=useState(params.categoryId??provider?.categoryId??categories[0]?.id??'');/* A deep link naming a service is a real choice and is honoured. The
     provider's first service was not chosen by anybody -- it was defaulted in,
     and then persisted as though the customer had asked for it. Web has always
     started empty here; native now agrees. */
  const[serviceId,setServiceId]=useState(params.serviceId??'');const[description,setDescription]=useState('');const[notes,setNotes]=useState('');const[addressId,setAddressId]=useState(addresses.find(item=>item.isDefault)?.id??addresses[0]?.id??'');const[schedule,setSchedule]=useState<MarketplaceScheduleKind>('asap');const[payment,setPayment]=useState<MarketplacePaymentCompatibility>('either');const[saving,setSaving]=useState(false);
  const services=useMemo(()=>provider?.services??[],[provider]);const valid=description.trim().length>=8&&Boolean(categoryId&&addressId)&&(schedule!=='scheduled'&&schedule!=='flexible'||true);
  const submit=async(approvalToken?:string)=>{if(mode==='supabase'&&!user){router.push('/(tabs)/profile');return}if(!valid)return;setSaving(true);try{const start=schedule==='scheduled'||schedule==='flexible'?new Date(Date.now()+2*60*60*1000).toISOString():undefined;const input:MarketplaceRequestInput={flowKind:params.flow==='emergency'?'emergency':provider?'browse_worker':'get_quotes',categoryId,serviceId:serviceId||undefined,targetedProviderId:provider?.id,addressId,issueDescription:description.trim(),notes:notes.trim(),complexity:'unknown',scheduleKind:schedule,requestedStartAt:start,requestedEndAt:schedule==='flexible'?new Date(Date.now()+5*60*60*1000).toISOString():undefined,paymentCompatibility:payment,emergencyApprovalToken:approvalToken};if(input.flowKind==='emergency'&&!approvalToken){const preview=await marketplaceRepository.previewEmergency(input);setSaving(false);Alert.alert(mt('emergencySurcharge'),`${(preview.surchargeMinor/100).toFixed(2)} ${preview.currency}`,[{text:mt('back'),style:'cancel'},{text:mt('approveSurcharge'),onPress:()=>void submit(preview.approvalToken)}]);return}const id=await market.create(input);router.replace({pathname:'/marketplace-request/[id]',params:{id}})}catch{Alert.alert(mt('error'))}finally{setSaving(false)}};
  if(market.loading)return <Center><ActivityIndicator color={colors.white}/></Center>;
  if(!market.capabilities?.enabled)return <SafeAreaView style={styles.safe}><ScreenHeader title={mt('newRequest')}/><Center><MaterialIcons name="lock-outline" size={38} color={colors.textMuted}/><AppText style={styles.centerText}>{mt('unavailable')}</AppText></Center></SafeAreaView>;
  return <SafeAreaView style={styles.safe}><ScreenHeader title={provider?mt('requestQuote'):mt('getQuotes')}/><ScrollView contentContainerStyle={[styles.content,isRTL&&styles.rtl]} keyboardShouldPersistTaps="handled">
    {provider?<View style={styles.summary}><MaterialIcons name="person" size={22} color={colors.white}/><View><AppText style={styles.strong}>{provider.name}</AppText><AppText style={styles.muted}>{mt('requestQuote')}</AppText></View></View>:<><AppText style={styles.label}>{mt('getQuotes')}</AppText><View style={styles.wrap}>{categories.map(item=><Chip key={item.id} icon={categoryIconName(item.id)} label={t(item.label)} selected={categoryId===item.id} onPress={()=>{setCategoryId(item.id);setServiceId('')}}/>)}</View>
    {/* Optional, and scoped to the chosen category: offering a service from
        another category would build a payload the backend rejects (22023).
        Changing category clears it above, so a stale choice cannot survive. */}
    <SpecificServiceSelector services={catalogue} categoryId={categoryId} selectedServiceId={serviceId} onChange={setServiceId} closeLabel={mt('back')}/></>}
    {services.length?<><AppText style={styles.label}>{specificServicePickerCopy[language].label}</AppText><View style={styles.wrap}>{/* Tapping the chosen one again returns to "any service", so a targeted
    request is never forced to name a service it does not need. */}<Chip label={specificServicePickerCopy[language].anyService} selected={!serviceId} onPress={()=>setServiceId('')}/>{services.map(item=><Chip key={item.id} label={catalogueServiceLabel(item,language)} selected={serviceId===item.id} onPress={()=>setServiceId(serviceId===item.id?'':item.id)}/>)}</View></>:null}
    <AppText style={styles.label}>{mt('describe')}</AppText><TextInput accessibilityLabel={mt('describe')} value={description} onChangeText={setDescription} placeholder={mt('descriptionPlaceholder')} placeholderTextColor={colors.textMuted} multiline style={[styles.input,styles.description,{textAlign:isRTL?'right':'left'}]}/><TextInput accessibilityLabel={mt('editClarification')} value={notes} onChangeText={setNotes} placeholder={mt('editClarification')} placeholderTextColor={colors.textMuted} style={[styles.input,{textAlign:isRTL?'right':'left'}]}/>
    <AppText style={styles.label}>{mt('schedule')}</AppText><View style={styles.wrap}>{(['asap','today','scheduled','flexible'] as MarketplaceScheduleKind[]).map(item=><Chip key={item} label={mt(item)} selected={schedule===item} onPress={()=>setSchedule(item)}/>)}</View>
    <AppText style={styles.label}>{mt('payment')}</AppText><View style={styles.wrap}>{(['either','cash','online'] as MarketplacePaymentCompatibility[]).map(item=><Chip key={item} label={mt(item)} selected={payment===item} onPress={()=>setPayment(item)}/>)}</View>
    <AppText style={styles.label}>{mt('newRequest')}</AppText><View style={styles.wrap}>{addresses.map(item=><Chip key={item.id} label={`${item.label} · ${item.district}`} selected={addressId===item.id} onPress={()=>setAddressId(item.id)}/>)}</View>
    <Pressable accessibilityRole="button" accessibilityLabel={mt('sendRequest')} disabled={!valid||saving} onPress={()=>void submit()} style={[styles.primary,(!valid||saving)&&styles.disabled]}>{saving?<ActivityIndicator color={colors.background}/>:<><MaterialIcons name="send" size={21} color={colors.background}/><AppText style={styles.primaryText}>{params.flow==='emergency'?mt('approveSurcharge'):mt('sendRequest')}</AppText></>}</Pressable>
  </ScrollView></SafeAreaView>;
}
/* The mark is decorative: the localized category name is right beside it and
   announcing the same word twice helps nobody. Selection changes ground and
   ink only -- the approved spec is explicit that the geometry never changes. */
function Chip({icon,label,selected,onPress}:{icon?:string;label:string;selected:boolean;onPress:()=>void}){
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);return <Pressable accessibilityRole="radio" accessibilityState={{selected}} onPress={onPress} style={[styles.chip,selected&&styles.selected]}>{icon?<WarshaIcon name={icon} size="md" color={selected?colors.white:colors.textSecondary}/>:null}<AppText style={styles.chipText}>{label}</AppText></Pressable>}
function Center({children}:{children:React.ReactNode}){
  const styles = useThemedStyles(makeStyles);return <View style={styles.center}>{children}</View>}
const makeStyles = (colors: ThemeColors) => StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},content:{padding:spacing.lg,paddingBottom:spacing.xxxl,gap:spacing.md,maxWidth:720,width:'100%',alignSelf:'center'},rtl:{direction:'rtl'},center:{flex:1,alignItems:'center',justifyContent:'center',gap:spacing.md,padding:spacing.xl},centerText:{textAlign:'center',color:colors.textSecondary},summary:{flexDirection:'row',alignItems:'center',gap:spacing.md,padding:spacing.lg,borderRadius:radii.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},strong:{fontWeight:typography.bold,fontSize:17},muted:{color:colors.textMuted},label:{fontWeight:typography.semibold,fontSize:16,marginTop:spacing.sm},wrap:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm},chip:{minHeight:46,paddingHorizontal:spacing.md,borderRadius:radii.pill,borderWidth:1,borderColor:colors.border,flexDirection:'row',gap:spacing.sm,alignItems:'center',justifyContent:'center'},selected:{backgroundColor:colors.surfaceSoft,borderColor:colors.white},chipText:{textTransform:'capitalize'},input:{minHeight:54,borderWidth:1,borderColor:colors.border,borderRadius:radii.md,backgroundColor:colors.surface,color:colors.white,padding:spacing.md},description:{minHeight:130,textAlignVertical:'top'},primary:{minHeight:58,marginTop:spacing.md,backgroundColor:colors.white,borderRadius:radii.lg,flexDirection:'row',gap:spacing.sm,alignItems:'center',justifyContent:'center'},primaryText:{color:colors.background,fontWeight:typography.bold},disabled:{opacity:.45}});
