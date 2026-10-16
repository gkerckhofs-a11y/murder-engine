import { useEffect, useMemo, useRef, useState } from 'react';
import { playerReadEntries, unreadCount } from './player-navigation';

export default function usePlayerReading(portal:any,blocked:boolean,onNotificationRead:(id:string)=>Promise<unknown>) {
  const root=useRef<HTMLElement>(null);
  const key=portal?`murderRead:v1:${portal.session.id}:${portal.character.externalId}:${portal.participant.id}`:'';
  const [state,setState]=useState<{key:string;seen:Record<string,string>}>({key:'',seen:{}});
  const entries=useMemo(()=>playerReadEntries(portal),[portal]);
  const callbacks=useRef(onNotificationRead);callbacks.current=onNotificationRead;
  const notified=useRef(new Set<string>());
  useEffect(()=>{
    let seen:Record<string,string>={};
    try {const data=JSON.parse(localStorage.getItem(key)??'{}');if(data&&typeof data==='object'&&!Array.isArray(data))seen=data;}catch{}
    setState({key,seen});notified.current.clear();
  },[key]);
  useEffect(()=>{
    if(!key||state.key!==key)return;
    try{localStorage.setItem(key,JSON.stringify(state.seen));}catch{}
  },[state,key]);
  useEffect(()=>{
    const handler=(event:StorageEvent)=>{
      if(event.key!==key||!event.newValue)return;
      try{const seen=JSON.parse(event.newValue);if(seen&&typeof seen==='object'&&!Array.isArray(seen))setState(previous=>({key,seen:{...previous.seen,...seen}}));}catch{}
    };
    window.addEventListener('storage',handler);return()=>window.removeEventListener('storage',handler);
  },[key]);
  useEffect(()=>{
    const element=root.current;
    if(!element||!key||state.key!==key||blocked)return;
    const byId=new Map(entries.map(entry=>[entry.id,entry]));
    const timers=new Map<Element,ReturnType<typeof setTimeout>>();
    const visible=new Set<Element>();
    const observed=new Set<Element>();
    function cancel(node:Element){clearTimeout(timers.get(node));timers.delete(node);}
    function schedule(node:Element){
      if(document.visibilityState!=='visible'||element?.querySelector('.qrScannerOverlay')||timers.has(node))return;
      timers.set(node,setTimeout(()=>{
        timers.delete(node);
        const entry=byId.get(node.getAttribute('data-read-id')??'');
        if(!entry||!visible.has(node)||document.visibilityState!=='visible'||element?.querySelector('.qrScannerOverlay')||!(node as HTMLElement).offsetHeight||node.closest('[hidden]'))return;
        setState(previous=>previous.key!==key||previous.seen[entry.id]===entry.revision?previous:{key,seen:{...previous.seen,[entry.id]:entry.revision}});
        if(entry.notificationId&&!entry.read&&!notified.current.has(entry.notificationId)) {
          const id=entry.notificationId;notified.current.add(id);
          void callbacks.current(id).catch(()=>notified.current.delete(id));
        }
      },600));
    }
    const observer=new IntersectionObserver(changes=>{
      for(const change of changes){
        if(change.isIntersecting&&change.intersectionRect.height>=Math.min(70,change.boundingClientRect.height)) {visible.add(change.target);schedule(change.target);}
        else {visible.delete(change.target);cancel(change.target);}
      }
    },{threshold:[0,0.1,0.5,1],rootMargin:'0px 0px -90px 0px'});
    function scan(){
      for(const node of element!.querySelectorAll('[data-read-id]'))if(!observed.has(node)){observed.add(node);observer.observe(node);}
      for(const node of observed)if(!element!.contains(node)){observer.unobserve(node);observed.delete(node);visible.delete(node);cancel(node);}
      for(const node of visible)schedule(node);
    }
    scan();
    const mutations=new MutationObserver(scan);mutations.observe(element,{childList:true,subtree:true});
    const visibility=()=>{for(const node of visible){cancel(node);if(document.visibilityState==='visible')schedule(node);}};
    document.addEventListener('visibilitychange',visibility);
    return()=>{observer.disconnect();mutations.disconnect();for(const timer of timers.values())clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
  },[entries,key,state.key,blocked]);
  const seen=state.key===key?state.seen:{};
  return {root,count:(section:string)=>unreadCount(entries,seen,section)};
}
