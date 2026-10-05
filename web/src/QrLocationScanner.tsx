import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';

function locationFromQr(text:string):string|null {
  const raw=String(text??'').trim();
  if(!raw)return null;

  try {
    const url=new URL(raw,window.location.origin);
    const match=url.pathname.match(/^\/scan\/([^/]+)\/?$/);

    if(
      match &&
      match[1]!=='character'
    ){
      return decodeURIComponent(match[1]);
    }
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
    return en?'No usable camera was found on this device.':'Aucune caméra utilisable n’a été trouvée sur cet appareil.';

  if(name==='NotReadableError')
    return en?'The camera is already being used by another application. Close it and try again.':'La caméra est déjà utilisée par une autre application. Ferme-la puis réessaie.';

  if(name==='OverconstrainedError')
    return en?'The camera does not support the requested settings. Try again.':'La caméra ne supporte pas les réglages demandés. Réessaie.';

  return error instanceof Error
    ? error.message
    : (en?'Unable to open the camera.':'Impossible d’ouvrir la caméra.');
}

export default function QrLocationScanner({
  token,
  onClose,
  language='FR'
}:{
  token:string;
  onClose:()=>void;
  language?:string;
}){
  const en=String(language).toUpperCase()==='EN';
  const videoRef=useRef<HTMLVideoElement|null>(null);
  const controlsRef=useRef<{stop:()=>void}|null>(null);

  const tokenRef=useRef(token);
  const doneRef=useRef(false);

  const [error,setError]=useState('');
  const [status,setStatus]=useState(en?'Starting camera…':'Activation de la caméra…');
  const [attempt,setAttempt]=useState(0);

  useEffect(()=>{
    tokenRef.current=token;
  },[token]);

  useEffect(()=>{
    let cancelled=false;

    doneRef.current=false;
    setError('');
    setStatus(en?'Starting camera…':'Activation de la caméra…');

    const reader=new BrowserQRCodeReader(undefined,{
      delayBetweenScanAttempts:150,
      delayBetweenScanSuccess:300,
      tryPlayVideoTimeout:7000
    });

    async function start(){
      try{
        const video=videoRef.current;
        if(!video)return;

        const constraints:MediaStreamConstraints={
          audio:false,
          video:{
            facingMode:{ideal:'environment'},
            width:{ideal:1280},
            height:{ideal:720}
          }
        };

        const controls=await reader.decodeFromConstraints(
          constraints,
          video,
          (result,_scanError,callbackControls)=>{
            if(
              cancelled ||
              doneRef.current ||
              !result
            ) return;

            const locationExternalId=
              locationFromQr(result.getText());

            if(!locationExternalId){
              setStatus(
                en?'QR detected, but this is not a Murder Engine location QR code.':'QR détecté, mais ce n’est pas un QR de lieu Murder Engine.'
              );
              return;
            }

            doneRef.current=true;

            callbackControls.stop();
            controlsRef.current=null;

            try{
              if('vibrate' in navigator)
                navigator.vibrate(80);
            }catch{}

            setStatus(
              en?`Location recognized · ${locationExternalId}`:`Lieu reconnu · ${locationExternalId}`
            );

            window.location.assign(
              `/scan/${encodeURIComponent(locationExternalId)}` +
              `?player=${encodeURIComponent(tokenRef.current)}`
            );
          }
        );

        if(cancelled){
          controls.stop();
          return;
        }

        controlsRef.current=controls;

        try{
          const stream=
            video.srcObject as MediaStream|null;

          const track=
            stream?.getVideoTracks?.()[0];

          if(track){
            const capabilities=
              typeof track.getCapabilities==='function'
                ? track.getCapabilities() as any
                : null;

            if(
              capabilities?.focusMode &&
              Array.isArray(capabilities.focusMode) &&
              capabilities.focusMode.includes('continuous')
            ){
              await track.applyConstraints({
                advanced:[
                  {focusMode:'continuous'} as any
                ]
              });
            }
          }
        }catch{}

        if(!cancelled)
          setStatus(
            en?'Fit the location QR code entirely inside the frame.':'Cadre le QR du lieu entièrement dans le viseur.'
          );

      }catch(e){
        if(!cancelled)
          setError(cameraErrorMessage(e,language));
      }
    }

    void start();

    return()=>{
      cancelled=true;
      controlsRef.current?.stop();
      controlsRef.current=null;

      const video=videoRef.current;

      try{
        const stream=
          video?.srcObject as MediaStream|null;

        stream?.getTracks()
          .forEach(track=>track.stop());
      }catch{}

      if(video)
        video.srcObject=null;
    };
  },[attempt]);

  function retry(){
    controlsRef.current?.stop();
    controlsRef.current=null;
    setAttempt(v=>v+1);
  }

  return <div
    className="qrScannerOverlay"
    role="dialog"
    aria-modal="true"
    aria-label={en?'Scan a location QR code':'Scanner un QR de lieu'}
  >
    <div className="qrScannerPanel">

      <div className="qrScannerHead">
        <div>
          <p className="eyebrow">{en?'SEARCH · QR':'FOUILLE · QR'}</p>
          <h2>{en?'Scan the location':'Scanner le lieu'}</h2>
        </div>

        <button
          className="playerSecondary scannerClose"
          onClick={onClose}
        >
          Fermer
        </button>
      </div>

      <p className="playerHelp">
        {en
          ? 'The QR code validates your current location. No search starts before the scan.'
          : 'Le QR valide le lieu où tu te trouves. Aucune fouille n’est lancée avant le scan.'}
      </p>

      <div className="qrVideoFrame qrVideoFrameLive">
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
        />

        <div
          className="qrScannerTarget"
          aria-hidden="true"
        >
          <i/><i/><i/><i/>
        </div>
      </div>

      {error
        ? <div className="scannerErrorBlock">
            <p className="playerError">{error}</p>

            <button
              className="playerPrimary"
              onClick={retry}
            >
              Réessayer la caméra
            </button>
          </div>
        : <p className="scannerStatus">
            {status}
          </p>
      }

    </div>
  </div>;
}
