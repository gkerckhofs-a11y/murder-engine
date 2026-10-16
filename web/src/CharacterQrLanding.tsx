type CharacterQrLandingProps = { characterExternalId: string };
function storedValue(key:string) {
  try {return window.localStorage.getItem(key)?.trim()??'';}catch{return '';}
}
export default function CharacterQrLanding(_props:CharacterQrLandingProps) {
  const token=storedValue('murderEnginePlayerToken');
  const language=storedValue('murderEnginePlayerLanguage');
  const english=language==='EN'||(!language&&!navigator.language.toLowerCase().startsWith('fr'));
  const t=(fr:string,en:string)=>english?en:fr;
  return <main className="publicShell">
    <section className="publicCard card interactionLanding">
      <p className="eyebrow">MURDER ENGINE · INTERACTION</p>
      <h1>{t('Scannez ce QR depuis Murder Engine','Scan this QR inside Murder Engine')}</h1>
      <p>{t('Les interactions se font avec le scanner de l’application. La caméra de votre téléphone vous a simplement amené sur cette page.','Interactions use the scanner inside the app. Your phone’s camera has only opened this help page.')}</p>
      <ol>
        <li>{t('Ouvrez votre propre partie.','Open your own game.')}</li>
        <li>{t('Dans Jouer, choisissez votre interaction.','In Play, choose your interaction.')}</li>
        <li>{t('Appuyez sur Scanner la cible et scannez à nouveau ce QR.','Tap Scan target and scan this QR again.')}</li>
      </ol>
      {token
        ? <a className="playerPrimary" href={`/?player=${encodeURIComponent(token)}&tab=play`}>{t('Ouvrir Jouer dans ma partie','Open Play in my game')}</a>
        : <p className="playerHelp">{t('Rouvrez le lien personnel envoyé par l’organisateur pour retrouver votre partie.','Reopen the personal link sent by the organizer to return to your game.')}</p>}
      <p className="playerHelp">{t('Aucune action n’a été déclenchée et aucun PA n’a été dépensé.','No action was triggered and no AP were spent.')}</p>
    </section>
  </main>;
}
