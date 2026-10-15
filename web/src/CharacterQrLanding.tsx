type CharacterQrLandingProps = {
  characterExternalId: string;
};

function storedPlayerToken() {
  try {
    return window.localStorage
      .getItem('murderEnginePlayerToken')
      ?.trim() ?? '';
  } catch {
    return '';
  }
}

export default function CharacterQrLanding({
  characterExternalId,
}: CharacterQrLandingProps) {
  const playerToken = storedPlayerToken();

  function openPlayerPortal() {
    if (!playerToken) return;

    window.location.assign(
      `/?player=${encodeURIComponent(playerToken)}`
    );
  }

  return (
    <main className="publicShell">
      <section className="publicCard card">
        <p className="eyebrow">MURDER ENGINE · INTERACTION</p>
        <h1>Character QR detected</h1>

        <p>
          This QR identifies another character. To perform an interaction,
          open your Murder Engine player sheet and use the scanner inside
          <strong> Actions</strong>.
        </p>

        <div className="privacyNote">
          Ce QR doit être scanné depuis l’onglet <strong>Actions</strong> de
          votre fiche joueur. Le scanner photo du téléphone ne déclenche
          aucune action de jeu.
        </div>

        {playerToken ? (
          <button
            className="playerPrimary"
            type="button"
            onClick={openPlayerPortal}
          >
            Open my player sheet
          </button>
        ) : (
          <p className="playerHelp">
            Reopen the personal link sent by the organizer, then choose
            <strong> Actions → Scan the target’s QR</strong>.
          </p>
        )}

        <small className="playerHelp">
          Character code: {characterExternalId || 'unknown'}
        </small>
      </section>
    </main>
  );
}
