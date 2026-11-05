import {useEffect,useId,useRef,useState} from 'react';
import {tutorialSteps,type TutorialLanguage,type TutorialStepId} from './player-tutorial';
import './player-tutorial.css';

function TutorialIcon({kind}:{kind:TutorialStepId}){
  const paths:Record<TutorialStepId,string>={
    welcome:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    sheets:'M5 3h14v18H5z M9 7h6 M9 11h6 M9 15h3',
    notebook:'M4 3h16v18H4z M8 3v18 M11 8h5 M11 12h5 M11 16h3',
    bag:'M7 8V6a5 5 0 0 1 10 0v2 M4 8h16l1 13H3z M8 12h8',
    play:'M13 2L3 14h8l-1 8 11-12h-8z',
    qr:'M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6 M8 8h2v2H8z M14 8h2v2h-2z M8 14h2v2H8z M14 14h2v2h-2z',
    updates:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/></svg>;
}

function TutorialVisual({id,en}:{id:TutorialStepId;en:boolean}){
  const t=(fr:string,eng:string)=>en?eng:fr;
  return <div className={`tutorialVisual tutorialVisual-${id}`} aria-hidden="true">
    {id==='welcome'&&<><div className="tutorialOrbit"/><div className="tutorialWelcome"><span className="tutorialIcon"><TutorialIcon kind="welcome"/></span><span>{t('DISCUTER · OBSERVER · DÉDUIRE','TALK · OBSERVE · DEDUCE')}</span></div><span className="tutorialSeal">M<span>E</span></span></>}
    {id==='sheets'&&<div className="tutorialSheet"><span className="tutorialIcon"><TutorialIcon kind="sheets"/></span><div><b>{t('Votre personnage','Your character')}</b><span className="tutorialSkeleton"/><span className="tutorialSkeleton short"/></div><div className="tutorialChipRow">{(en?['Story','Missions','Roleplay','My QR']:['Histoire','Missions','Interprétation','Mon QR']).map(x=><span key={x}>{x}</span>)}</div></div>}
    {id==='notebook'&&<div className="tutorialNotebook"><div className="tutorialVisualHeading"><TutorialIcon kind="notebook"/><b>{t('Le fil de votre enquête','Your investigation feed')}</b></div><div className="tutorialFilters">{(en?['All','Clues','Information','Vote']:['Tout','Indices','Informations','Vote']).map((x,i)=><span className={i===0?'selected':''} key={x}>{x}</span>)}</div><div className="tutorialFeedLine"><i/><span>{t('Un indice découvert','A discovered clue')}</span></div><div className="tutorialFeedLine"><i/><span>{t('Une nouvelle reçue','A received update')}</span></div></div>}
    {id==='bag'&&<div className="tutorialBag"><div className="tutorialBagRow"><span>{t('Ressources','Resources')}</span><span className="tutorialResource">{t('PA','AP')}</span></div><div className="tutorialEvidence"><TutorialIcon kind="sheets"/><div><b>{t('Objets & indices','Items & clues')}</b><span>{t('Ouvrir · Lire · Examiner','Open · Read · Examine')}</span></div></div></div>}
    {id==='play'&&<div className="tutorialAction"><span className="tutorialIcon"><TutorialIcon kind="play"/></span><b>{t('Votre action','Your action')}</b><div><span>{t('Conditions','Conditions')}</span><span>{t('Coût affiché','Displayed cost')}</span></div><span className="tutorialMockButton">{t('Vérifier avant d’agir','Check before acting')} <span>→</span></span></div>}
    {id==='qr'&&<div className="tutorialQr"><div className="tutorialScanFrame"><TutorialIcon kind="qr"/></div><ol><li><b>1</b>{t('Ouvrir Jouer','Open Play')}</li><li><b>2</b>{t('Choisir l’action','Choose the action')}</li><li><b>3</b>{t('Scanner la cible','Scan the target')}</li></ol></div>}
    {id==='updates'&&<div className="tutorialUpdates"><div className="tutorialNotification"><span className="tutorialIcon"><TutorialIcon kind="notebook"/></span><b>{t('Carnet','Notebook')}</b><em>2</em></div><span className="tutorialUpdateArrow">↓</span><div className="tutorialNotification read"><span>✓</span><b>{t('Un élément consulté','One item viewed')}</b><em>1</em></div><small>{t('Exemple de compteur','Example counter')}</small></div>}
  </div>;
}

export default function PlayerTutorial({language='FR',onClose}:{language?:string;onClose:()=>void}){
  const lang:TutorialLanguage=language.toUpperCase()==='EN'?'EN':'FR';
  const en=lang==='EN';
  const [index,setIndex]=useState(0);
  const dialog=useRef<HTMLDialogElement>(null);
  const title=useRef<HTMLHeadingElement>(null);
  const titleId=useId();
  const step=tutorialSteps[lang][index];
  const last=index===tutorialSteps[lang].length-1;
  useEffect(()=>{
    const element=dialog.current;
    const previousFocus=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow='hidden';
    return()=>{element?.close();document.body.style.overflow=overflow;previousFocus?.focus();};
  },[]);
  useEffect(()=>{title.current?.focus();dialog.current?.scrollTo({top:0});},[index]);
  return <dialog ref={dialog} className="playerTutorialDialog" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();onClose();}}>
    <div className="tutorialTop"><span>MURDER ENGINE <i>/</i> {en?'QUICK GUIDE':'GUIDE EXPRESS'}</span><button type="button" onClick={onClose}>{en?'Skip':'Passer'} <span aria-hidden="true">×</span></button></div>
    <div className="tutorialProgress" role="progressbar" aria-label={en?'Tutorial progress':'Progression du tutoriel'} aria-valuemin={1} aria-valuemax={7} aria-valuenow={index+1} aria-valuetext={`${index+1} / 7`}><span style={{width:`${(index+1)/7*100}%`}}/></div>
    <TutorialVisual id={step.id} en={en}/>
    <div className="tutorialCopy"><p className="tutorialKicker"><span>{String(index+1).padStart(2,'0')}</span> {step.label}</p><h2 id={titleId} ref={title} tabIndex={-1}>{step.title}</h2><p className="tutorialBody">{step.body}</p><div className="tutorialTip"><span aria-hidden="true">↳</span><p>{step.tip}</p></div></div>
    <footer className="tutorialFooter"><div className="tutorialControls"><button type="button" className="tutorialBack" disabled={index===0} onClick={()=>setIndex(n=>n-1)}>{en?'Back':'Retour'}</button><button type="button" className="tutorialNext" onClick={()=>last?onClose():setIndex(n=>n+1)}>{last?(en?'Let’s play':'À moi de jouer'):(en?'Next':'Suivant')} <span aria-hidden="true">→</span></button></div><nav className="tutorialDots" aria-label={en?'Tutorial screens':'Écrans du tutoriel'}>{tutorialSteps[lang].map((item,n)=><button type="button" key={item.id} aria-label={`${n+1} / 7 — ${item.label}`} aria-current={n===index?'step':undefined} onClick={()=>setIndex(n)}><span/></button>)}</nav></footer>
  </dialog>;
}
