import { useEffect, useState } from 'react';
import { organizerJson } from './organizer-api';

export type SessionAccess = {sessionId: string; enabled: boolean; selfServiceEnabled: boolean;
  organizerEmail: string; realSessionStartedAt: string | null; activeRehearsalId: string | null;
  workingSessionId: string; mode: 'PREPARATION' | 'REHEARSAL' | 'REAL'};
const errors: Record<string, string> = {
  USE_START_REAL_SESSION: 'Commencez une répétition ou utilisez « Démarrer la partie réelle ».',
  SESSION_ACCESS_STATE_CHANGED: 'La session a changé. Actualisez avant de modifier son accès.',
  SESSION_PREPARATION_LOCKED: 'La préparation est verrouillée après le début des essais.',
  SESSION_MUST_BE_READY: 'La session doit être prête avant de commencer. Terminez le casting et passez-la à l’état « Prête ».',
  SESSION_INCARNATIONS_NOT_FROZEN: 'Figez les fiches personnages avant de commencer.',
  SELF_SERVICE_STATE_CHANGED: 'La session a changé dans un autre onglet. Actualisez avant de continuer.',
  REAL_SESSION_ALREADY_STARTED: 'La partie réelle a déjà été lancée. La remise à zéro des essais est verrouillée.',
  SESSION_ACCESS_DENIED: 'Ce compte ne dispose pas d’un accès à cette session.',
  CASTING_INCOMPLETE: 'Attribuez un personnage à chaque participant avant de commencer.',
};
export function accessError(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return errors[message] || message;
}

export default function SessionLicensePanel({sessionId, admin, onChanged, onState}: {
  sessionId: string; admin: boolean; onChanged?: (access: SessionAccess) => void; onState?: (access: SessionAccess) => void;
}) {
  const [access, setAccess] = useState<SessionAccess | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  async function load() {
    try {
      const result = await organizerJson<{access: SessionAccess}>(`/api/organizer/access?sessionId=${encodeURIComponent(sessionId)}`);
      setAccess(result.access); setEmail(result.access.organizerEmail); onState?.(result.access); return result.access;
    } catch (e) { setError(accessError(e)); return null; }
  }
  useEffect(() => { setError(''); setAccess(null); void load(); }, [sessionId]);
  async function act(action: 'reset' | 'real') {
    const real = action === 'real';
    const question = real
      ? 'Démarrer la partie réelle ? Les essais seront fermés et la partie démarrera avec les valeurs initiales. Vous ne pourrez plus la remettre à zéro.'
      : 'Recommencer les essais ? La progression et les liens joueurs des essais précédents seront désactivés. La configuration et le casting seront conservés.';
    if (!window.confirm(question)) return;
    setBusy(true); setError('');
    try {
      await organizerJson(`/api/organizer/${real ? 'real/start' : 'rehearsal/reset'}`, {
        sessionId, confirm: real ? 'START_REAL_SESSION' : 'RESET_REHEARSAL',
      });
      const next = await load(); if (next) onChanged?.(next);
    } catch (e) { setError(accessError(e)); }
    finally { setBusy(false); }
  }
  async function configure(enabled: boolean) {
    setBusy(true); setError('');
    try {
      await organizerJson('/api/organizer/access/configure', {sessionId, email, enabled});
      const next = await load(); if (next) onChanged?.(next);
    } catch (e) { setError(accessError(e)); }
    finally { setBusy(false); }
  }
  const link = `${window.location.origin}/?organizer=${encodeURIComponent(sessionId)}`;
  return <section className={`card sessionLicense mode-${access?.mode || 'PREPARATION'}`}>
    <p className="eyebrow">{access?.mode === 'REAL' ? 'PARTIE RÉELLE' : access?.mode === 'REHEARSAL' ? 'MODE RÉPÉTITION' : 'PRÉPARATION'}</p>
    <h3>{admin ? 'Accès organisateur client' : 'Votre murder prête à animer'}</h3>
    {error && <p role="alert" className="errorbox">{error}</p>}
    {admin && <div className="formGrid"><label>Adresse Google de l’organisateur
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" />
    </label><div className="formActions">
      <button disabled={busy || !email.trim()} onClick={() => void configure(true)}>Enregistrer et autoriser</button>
      {access?.enabled && <button className="secondary" disabled={busy} onClick={() => void configure(false)}>Révoquer l’accès</button>}
    </div></div>}
    {access?.selfServiceEnabled && <>
      {admin && <label>Lien à transmettre à l’organisateur<input readOnly value={link} onFocus={e => e.target.select()} />
        <button className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setError('Sélectionnez le lien pour le copier.'); } }}>{copied ? 'Lien copié' : 'Copier le lien'}</button>
      </label>}
      <p>{access.mode === 'REAL'
        ? 'La partie réelle a démarré. Les essais sont fermés et la remise à zéro est verrouillée.'
        : 'Vous pouvez essayer les commandes et recommencer autant que nécessaire. Chaque répétition utilise ses propres liens joueurs. Pour jouer le jour prévu, démarrez la partie réelle puis utilisez les liens de cette partie.'}</p>
      {admin ? <div className="formActions"><a href={link} target="_blank" rel="noreferrer">Ouvrir l’espace organisateur</a></div> : <div className="formActions">
        {access.mode !== 'REAL' && <>
          <button className="secondary" disabled={busy || (!access.enabled && !admin)} onClick={() => void act('reset')}>{access.activeRehearsalId ? 'Remettre les essais à zéro' : 'Commencer les essais'}</button>
          <button disabled={busy || (!access.enabled && !admin)} onClick={() => void act('real')}>Démarrer la partie réelle</button>
        </>}
        <button className="secondary" disabled={busy} onClick={async () => { const next = await load(); if (next) onChanged?.(next); }}>Actualiser</button>
      </div>}
    </>}
  </section>;
}
