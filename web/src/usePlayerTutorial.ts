import {useEffect,useRef,useState} from 'react';
import {tutorialStorageKey} from './player-tutorial';

function stored(key:string){try{return localStorage.getItem(key)==='1';}catch{return false;}}

export default function usePlayerTutorial(portal:any,introOpen:boolean){
  const key=tutorialStorageKey(portal);
  const [openKey,setOpenKey]=useState('');
  const dismissed=useRef(new Set<string>());
  const summary=portal?.session?.playerSummary;
  const introKey=portal?`murderIntroSeen:${portal.session.id}:${portal.character.externalId}`:'';
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    // A QR return link must lead straight back to the action; printing has no overlay.
    if(!key||introOpen||params.has('print')||params.get('tab')==='play')return;
    if(summary&&!stored(introKey))return;
    if(!dismissed.current.has(key)&&!stored(key))setOpenKey(key);
  },[key,introOpen,summary,introKey]);
  function close(){
    dismissed.current.add(key);
    try{if(key)localStorage.setItem(key,'1');}catch{/* Still dismiss for this visit. */}
    setOpenKey('');
  }
  return {open:!!key&&openKey===key,show:()=>setOpenKey(key),close};
}
