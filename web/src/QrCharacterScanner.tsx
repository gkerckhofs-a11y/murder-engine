import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';

type Target = {
  characterExternalId:string;
  name:string;
  publicRole?:string|null;
  participantName?:string|null;
};

function normalizeId(value:string){
  return String(value??'').trim().toUpperCase();
}

function characterFromQr(text:string):string|null {
  const raw=String(text??'').trim();

  if(!raw)
    return null;

  try {
    const url=new URL(raw,window.location.origin);

    const match=
      url.pathname.match(
        /^\/scan\/character\/([^/]+)\/?$/
      );

    if(match)
      return decodeURIComponent(match[1]).trim();

  } catch {}

  return /^[A-Za-z0-9_.:-]{1,120}$/.test(raw)
    ? raw
    : null;
}

function cameraErrorMessage(error:unknown,language='FR'){
  const en=String(language).toUpperCase()==='EN';
  const name=
    error &&
    typeof error==='object' &&
    'name' in error
      ? String((error as any).name)
      : '';

  if(name==='NotAllowedError')
    return en?'Camera access denied. Allow camera access in your browser settings.':'Accès à la caméra refusé. Autorise la caméra dans les réglages du navigateur.';

  if(name==='NotFoundError')
    return en?'No usable camera was found.':'Aucune caméra utilisable n’a été trouvée.';

  if(name==='NotReadableError')
    return en?'The camera appears to be in use by another application.':'La caméra semble déjà utilisée par une autre application.';

  return error instanceof Error
    ? error.message
    : (en?'Unable to open the camera.':'Impossible d’ouvrir la caméra.');
}

export default function QrCharacterScanner({
  targets,
  onSelect,
  onClose,
  title='Scanner le personnage',
  mode='DIRECT',
  language='FR'
}:{
  targets:Target[];
  onSelect:(target:Target)=>void;
  onClose:()=>void;
  title?:string;
  mode?:'DIRECT'|'DISCRET';
  language?:string;
}){
  const en=String(language).toUpperCase()==='EN';

  const videoRef=
    useRef<HTMLVideoElement|null>(null);

  const controlsRef=
    useRef<{stop:()=>void}|null>(null);

  const targetMapRef=
    useRef<Map<string,Target>>(new Map());

  const onSelectRef=
    useRef(onSelect);

  const doneRef=
    useRef(false);

  const [error,setError]=
    useState('');

  const [status,setStatus]=
    useState(en?'Starting camera…':'Activation de la caméra…');

  const [attempt,setAttempt]=
    useState(0);


  /*
   * Mise à jour des cibles sans redémarrer
   * la caméra.
   */
  useEffect(()=>{
    targetMapRef.current=
      new Map(
        targets.map(target=>[
          normalizeId(target.characterExternalId),
          target
        ])
      );
  },[targets]);


  /*
   * Même chose pour le callback React.
   */
  useEffect(()=>{
    onSelectRef.current=onSelect;
  },[onSelect]);


  /*
   * La caméra ne dépend QUE de attempt.
   * Aucun rerender du portail ne doit
   * la redémarrer.
   */
  useEffect(()=>{
    let cancelled=false;

    doneRef.current=false;

    setError('');
    setStatus(en?'Starting camera…':'Activation de la caméra…');

    const reader=
      new BrowserQRCodeReader(
        undefined,
        {
          delayBetweenScanAttempts:200,
          delayBetweenScanSuccess:500,
          tryPlayVideoTimeout:7000
        }
      );

    async function start(){

      try{

        const video=
          videoRef.current;

        if(!video)
          return;


        /*
         * IMPORTANT
         *
         * On laisse ZXing sélectionner
         * lui-même la caméra principale arrière.
         *
         * Pas de résolution forcée.
         * Pas d'autofocus forcé.
         */
        const controls=
          await reader.decodeFromVideoDevice(
            undefined,
            video,
            (
              result,
              _scanError,
              callbackControls
            )=>{

              if(
                cancelled ||
                doneRef.current ||
                !result
              )
                return;


              const raw=
                result.getText();

              const characterExternalId=
                characterFromQr(raw);


              if(!characterExternalId){

                setStatus(
                  en?'QR detected, but this code does not match a Murder Engine character.':'QR détecté, mais ce code ne correspond pas à un personnage Murder Engine.'
                );

                return;
              }


              const normalized=
                normalizeId(characterExternalId);


              const target=
                targetMapRef.current.get(
                  normalized
                );


              /*
               * Très utile pendant le pilote :
               * si ZXing lit correctement le QR
               * mais que la cible n'existe pas,
               * on voit l'identifiant lu.
               */
              if(!target){

                setStatus(
                  en?`QR read: ${characterExternalId} · character not available as a target.`:`QR lu : ${characterExternalId} · personnage non disponible comme cible.`
                );

                return;
              }


              doneRef.current=true;

              callbackControls.stop();
              controlsRef.current=null;


              try{
                navigator.vibrate?.(80);
              }catch{}


              setStatus(
                en?`✓ ${target.name} recognized`:`✓ ${target.name} reconnu`
              );


              /*
               * Petit délai uniquement pour
               * laisser apparaître la validation
               * et stabiliser la fermeture caméra.
               */
              window.setTimeout(
                ()=>{
                  if(!cancelled)
                    onSelectRef.current(target);
                },
                120
              );
            }
          );


        if(cancelled){

          controls.stop();

          return;
        }


        controlsRef.current=
          controls;


        setStatus(
          en?'Fit the entire QR code inside the frame.':'Cadre entièrement le QR dans le viseur.'
        );

      }catch(e){

        if(!cancelled)
          setError(
            cameraErrorMessage(e,language)
          );
      }
    }


    void start();


    return()=>{

      cancelled=true;

      try{
        controlsRef.current?.stop();
      }catch{}

      controlsRef.current=null;


      /*
       * Sécurité supplémentaire :
       * on coupe réellement les pistes caméra.
       */
      try{

        const stream =
          videoRef.current?.srcObject as MediaStream | null;

        stream
          ?.getTracks()
          .forEach(
            track=>track.stop()
          );

      }catch{}


      if(videoRef.current)
        videoRef.current.srcObject=null;
    };

  },[attempt]);


  function retry(){

    try{
      controlsRef.current?.stop();
    }catch{}

    controlsRef.current=null;

    setAttempt(
      value=>value+1
    );
  }


  return <div
    className="qrScannerOverlay"
    role="dialog"
    aria-modal="true"
    aria-label={title}
  >

    <div className="qrScannerPanel">

      <div className="qrScannerHead">

        <div>

          <p className="eyebrow">
            INTERACTION · QR
          </p>

          <h2>
            {title}
          </h2>

        </div>

        <button
          className="playerSecondary scannerClose"
          onClick={onClose}
        >
          {en?'Close':'Fermer'}
        </button>

      </div>


      <p className="playerHelp">

        {mode==='DISCRET'
          ? (en?'DISCREET mode: scan the target’s unique QR code from the copy held by the GM.':'Mode DISCRET : scanne le QR unique de la cible depuis la copie disponible chez le MJ.')
          : (en?'DIRECT mode: scan the unique QR code presented or worn by the target.':'Mode DIRECT : scanne le QR unique présenté ou porté par la cible.')
        }

      </p>


      <div className="qrVideoFrame qrVideoFrameLive">

        <video
          ref={videoRef}
          muted
          playsInline
        />

        <div
          className="qrScannerTarget"
          aria-hidden="true"
        >
          <i/>
          <i/>
          <i/>
          <i/>
        </div>

      </div>


      {error

        ? <div className="scannerErrorBlock">

            <p className="playerError">
              {error}
            </p>

            <button
              className="playerPrimary"
              onClick={retry}
            >
              {en?'Retry camera':'Réessayer la caméra'}
            </button>

          </div>

        : <p className="scannerStatus">
            {status}
          </p>
      }

    </div>

  </div>;
}
