import React, { useEffect, useState } from 'react';
import { Alert, Button, FlatList, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { auth, db } from './src/firebase';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({length: 10}, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const err = e => Alert.alert('Atenção', e?.message || String(e));
const dayString = date => date.toLocaleDateString('pt-BR', {weekday:'short',day:'2-digit',month:'short'});
export default function App() {
  const [user,setUser] = useState(null), [loading,setLoading]=useState(true);
  const [email,setEmail]=useState(''), [password,setPassword]=useState('');
  const [code,setCode]=useState(''), [family,setFamily]=useState(''), [role,setRole]=useState('');
  const [events,setEvents]=useState([]), [title,setTitle]=useState(''), [when,setWhen]=useState('');
  const [week,setWeek]=useState(0);
  useEffect(()=>onAuthStateChanged(auth,u=>{setUser(u);setLoading(false);}),[]);
  useEffect(()=>{if(!user){setFamily('');setRole('');return;} let active=true;
    // MVP: family selection is local to the current session; reenter code after relaunch.
    return ()=>{active=false;};
  },[user]);
  useEffect(()=>{if(!family||!user)return;
    const unsubMember=onSnapshot(doc(db,'families',family,'members',user.uid),s=>setRole(s.data()?.role||''),err);
    const unsubEvents=onSnapshot(collection(db,'families',family,'events'),s=>setEvents(s.docs.map(d=>({id:d.id,...d.data()}))),err);
    return ()=>{unsubMember();unsubEvents();};
  },[family,user]);
  const login=async(register)=>{try{if(register)await createUserWithEmailAndPassword(auth,email.trim(),password);else await signInWithEmailAndPassword(auth,email.trim(),password);}catch(e){err(e)}};
  const join=async(value)=>{try{const id=value.trim().toUpperCase();const f=await getDoc(doc(db,'families',id));if(!f.exists())throw Error('Código não encontrado.');
    const m=doc(db,'families',id,'members',user.uid);const existing=await getDoc(m);
    if(!existing.exists())await setDoc(m,{role:'viewer',email:user.email,joinedAt:serverTimestamp()});
    setFamily(id);setCode(id);
  }catch(e){err(e)}};
  const createFamily=async()=>{try{let id;for(let i=0;i<5;i++){const candidate=makeCode();if(!(await getDoc(doc(db,'families',candidate))).exists()){id=candidate;break;}}if(!id)throw Error('Tente novamente.');
    await setDoc(doc(db,'families',id),{createdBy:user.uid,createdAt:serverTimestamp()});
    await setDoc(doc(db,'families',id,'members',user.uid),{role:'admin',email:user.email,joinedAt:serverTimestamp()});setFamily(id);setCode(id);
  }catch(e){err(e)}};
  const addEvent=async()=>{try{if(role!=='admin')return;const d=new Date(when.trim());if(!title.trim()||Number.isNaN(d.getTime()))throw Error('Preencha título e data no formato 2026-10-22T14:30.');
    await addDoc(collection(db,'families',family,'events'),{title:title.trim(),startsAt:Timestamp.fromDate(d),createdBy:user.uid,createdAt:serverTimestamp()});
    const seconds=Math.round((d.getTime()-Date.now())/1000)-3600;
    if(seconds>0){const permission=await Notifications.requestPermissionsAsync();if(permission.granted)await Notifications.scheduleNotificationAsync({content:{title:'Família em Dia',body:`Em 1 hora: ${title.trim()}`},trigger:{type:Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,seconds}});}
    setTitle('');setWhen('');
  }catch(e){err(e)}};
  const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-((start.getDay()+6)%7)+week*7);
  const end=new Date(start);end.setDate(end.getDate()+7);
  const visible=events.filter(e=>{const d=e.startsAt?.toDate?.();return d>=start&&d<end}).sort((a,b)=>a.startsAt.toMillis()-b.startsAt.toMillis());
  if(loading)return <SafeAreaView style={styles.page}><Text>Carregando...</Text></SafeAreaView>;
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.header}>💜 Família em Dia</Text>
    {!user?<View><Text>Entre ou crie uma conta</Text><TextInput style={styles.input} placeholder="E-mail" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail}/><TextInput style={styles.input} placeholder="Senha (mínimo 6 caracteres)" secureTextEntry value={password} onChangeText={setPassword}/><Button title="Entrar" onPress={()=>login(false)}/><Button title="Criar conta" onPress={()=>login(true)}/></View>:
    !family?<View><Text>Olá, {user.email}</Text><TextInput style={styles.input} placeholder="Código da família" autoCapitalize="characters" value={code} onChangeText={setCode}/><Button title="Entrar com código" onPress={()=>join(code)}/><View style={styles.space}/><Button title="Criar uma nova família" onPress={createFamily}/><Button title="Sair" onPress={()=>signOut(auth)}/></View>:
    <View><Text style={styles.sub}>Código da família: {family}</Text><Text style={styles.sub}>Seu perfil: {role==='admin'?'Administrador':'Visualização'}</Text><View style={styles.row}><Button title="‹ Semana" onPress={()=>setWeek(w=>w-1)}/><Button title="Próxima ›" onPress={()=>setWeek(w=>w+1)}/></View><Text style={styles.sub}>{dayString(start)} — {dayString(new Date(end.getTime()-86400000))}</Text>
    {visible.length===0?<Text>Nenhum compromisso nesta semana.</Text>:visible.map(e=><View key={e.id} style={styles.event}><Text style={styles.eventTitle}>{e.title}</Text><Text>{e.startsAt.toDate().toLocaleString('pt-BR')}</Text>{role==='admin'&&<Button title="Excluir" color="#a33" onPress={()=>deleteDoc(doc(db,'families',family,'events',e.id)).catch(err)}/>}</View>)}
    {role==='admin'&&<View style={styles.form}><Text style={styles.sub}>Novo compromisso</Text><TextInput style={styles.input} placeholder="Título" value={title} onChangeText={setTitle}/><TextInput style={styles.input} placeholder="Data/hora: 2026-10-22T14:30" value={when} onChangeText={setWhen}/><Button title="Salvar compromisso" onPress={addEvent}/><Text style={styles.hint}>O administrador recebe um lembrete local 1 hora antes, se permitir notificações.</Text></View>}
    <Button title="Trocar família" onPress={()=>{setFamily('');setRole('');setEvents([])}}/><Button title="Sair" onPress={()=>signOut(auth)}/></View>}
  </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#faf8ff'},container:{padding:22,gap:14},header:{fontSize:27,fontWeight:'800',color:'#7655b7',marginBottom:16},sub:{fontSize:17,fontWeight:'600',marginVertical:10},input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#ddd5ed',borderRadius:10,padding:14,marginVertical:7},row:{flexDirection:'row',justifyContent:'space-between',marginVertical:12},event:{padding:15,borderRadius:12,backgroundColor:'#eee7ff',marginVertical:7},eventTitle:{fontSize:17,fontWeight:'700'},form:{marginVertical:20},hint:{fontSize:12,color:'#555',marginTop:9},space:{height:20}});
