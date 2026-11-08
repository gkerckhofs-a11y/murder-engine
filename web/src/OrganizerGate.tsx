import { useEffect, useState, type ReactNode } from 'react';
import { getOrganizerUser, signInOrganizer, signOutOrganizer } from './admin-auth';
import { organizerJson } from './organizer-api';

export default function OrganizerGate({children}: {children: (identity: {email: string; admin: boolean}) => ReactNode}) {
  const [identity, setIdentity] = useState<{email: string; admin: boolean} | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  async function load(interactive = false) {
    setBusy(true); setError('');
    try {
      const user = interactive ? await signInOrganizer() : await getOrganizerUser();
      if (user) setIdentity(await organizerJson('/api/organizer/identity'));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  if (identity) return <>
    <div className="organizerIdentity"><span>{identity.email}</span><button className="secondary" onClick={async () => {
      await signOutOrganizer(); setIdentity(null);
    }}>Se déconnecter</button></div>
    {children(identity)}
  </>;
  return <main className="shell"><section className="card organizerLogin">
    <p className="eyebrow">MURDER ENGINE</p><h1>Espace organisateur</h1>
    <p>Connectez-vous avec le compte Google correspondant à l’adresse à laquelle votre session a été attribuée.</p>
    {error && <p role="alert" className="errorbox">{error}</p>}
    <button disabled={busy} onClick={() => void load(true)}>{busy ? 'Connexion…' : 'Se connecter avec Google'}</button>
  </section></main>;
}
