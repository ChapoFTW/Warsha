import { Tabs } from 'expo-router'; import { BottomNavigation } from '@/components/warsha/BottomNavigation';
import { useThemeColors } from '@/src/appearance/appearance-context';
export default function TabLayout(){
  const colors = useThemeColors();return <Tabs tabBar={(props)=><BottomNavigation {...props}/>} screenOptions={{headerShown:false,sceneStyle:{backgroundColor:colors.background}}}><Tabs.Screen name="index"/><Tabs.Screen name="orders"/><Tabs.Screen name="chat" options={{href:null}}/><Tabs.Screen name="profile"/></Tabs>}
