import { useEffect, useRef, useState } from 'react';

type Note = {id:string;text:string;version:number;createdAt:string;updatedAt:string};
type NotesResponse = {notes:Note[];limits:{count:number;length:number}};

export default function PlayerPersonalNotes({token,language,active}:{token:string;language:string;active:boolean}) {
  const english = String(language).toUpperCase() === 'EN';
  const t = (fr:string,en:string) => english ? en : fr;
  const [notes,setNotes] = useState<Note[]>([]);
  const [limits,setLimits] = useState({count:100,length:4000});
  const [loaded,setLoaded] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [status,setStatus] = useState('');
  const [editor,setEditor] = useState<{id:string;version?:number;original:string}|null>(null);
  const [text,setText] = useState('');
  const [conflict,setConflict] = useState(false);
  const requestVersion = useRef(0);
  const dirty = !!editor && text !== editor.original;

  function message(code:string) {
    const messages:Record<string,[string,string]> = {
      PLAYER_NOTE_CONFLICT:['Cette note a changé sur un autre appareil. Votre texte est conservé. Vous pouvez l’enregistrer comme une nouvelle note.','This note changed on another device. Your text is kept. You can save it as a new note.'],
      PLAYER_NOTE_NOT_FOUND:['Cette note a été supprimée. Votre texte est conservé. Vous pouvez l’enregistrer comme une nouvelle note.','This note was deleted. Your text is kept. You can save it as a new note.'],
      PLAYER_NOTE_LIMIT_REACHED:['Vous avez atteint la limite de 100 notes. Supprimez une ancienne note.','You have reached the limit of 100 notes. Delete an old note.'],
      PLAYER_NOTE_INVALID_TEXT:['Écrivez une note de 1 à 4 000 caractères.','Write a note of 1 to 4,000 characters.'],
      PLAYER_LINK_NOT_FOUND:['Votre lien joueur n’est plus actif. Contactez le MJ.','Your player link is no longer active. Contact the GM.'],
      SESSION_ARCHIVED:['Cette session est archivée.','This session is archived.'],
    };
    const pair = messages[code];
    return pair ? t(...pair) : t('Impossible de joindre le serveur. Votre texte est conservé : réessayez.','Could not reach the server. Your text is kept: please try again.');
  }
  async function request(body?:object):Promise<NotesResponse> {
    const res = await fetch(body ? '/api/player/notes' : `/api/player/notes?token=${encodeURIComponent(token)}`, body ? {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({token,...body}), cache:'no-store'
    } : {cache:'no-store'});
    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.message || 'PLAYER_NOTES_FAILED');
    return result;
  }
  async function load() {
    const version = ++requestVersion.current;
    try {
      const result = await request();
      if (requestVersion.current !== version) return;
      setNotes(result.notes); setLimits(result.limits); setLoaded(true); setError('');
    } catch(e) {
      if (requestVersion.current === version) setError(message(e instanceof Error ? e.message : ''));
    }
  }
  useEffect(() => { if (active) void load(); },[active,token]);
  useEffect(() => () => { requestVersion.current++; },[]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event:BeforeUnloadEvent) => {event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return () => window.removeEventListener('beforeunload',warn);
  },[dirty]);

  function open(note?:Note) {
    if (dirty && !window.confirm(t('Abandonner le texte non enregistré ?','Discard your unsaved text?'))) return;
    setEditor(note ? {id:note.id,version:note.version,original:note.text} : {id:crypto.randomUUID(),original:''});
    setText(note?.text ?? ''); setError(''); setStatus(''); setConflict(false);
  }
  function cancel() {
    if (dirty && !window.confirm(t('Abandonner le texte non enregistré ?','Discard your unsaved text?'))) return;
    setEditor(null); setText(''); setConflict(false); setError('');
  }
  async function save(asNew=false) {
    if (!editor || busy || !text.trim()) return;
    setBusy(true); setError(''); setStatus(''); requestVersion.current++;
    const target = asNew ? {id:crypto.randomUUID(),original:''} : editor;
    // Keep the same ID on retries even if the network loses the response.
    if (asNew) setEditor(target);
    try {
      const result = await request({operation:target.version ? 'update' : 'create',id:target.id,version:target.version,text});
      requestVersion.current++;
      setNotes(result.notes);setLimits(result.limits);setEditor(null);setText('');setConflict(false);
      setStatus(t('Note enregistrée.','Note saved.'));
    } catch(e) {
      const code = e instanceof Error ? e.message : '';
      setConflict(['PLAYER_NOTE_CONFLICT','PLAYER_NOTE_NOT_FOUND'].includes(code));setError(message(code));
    } finally {setBusy(false);}
  }
  async function remove(note:Note) {
    if (busy || !window.confirm(t('Supprimer définitivement cette note personnelle ?','Permanently delete this personal note?'))) return;
    setBusy(true); setError(''); setStatus(''); requestVersion.current++;
    try {
      const result = await request({operation:'delete',id:note.id,version:note.version});
      requestVersion.current++;
      setNotes(result.notes);setStatus(t('Note supprimée.','Note deleted.'));
    } catch(e) {setError(message(e instanceof Error ? e.message : ''));}
    finally {setBusy(false);}
  }
  return <section className="playerCard personalNotes">
    <div className="playerSectionHead">
      <div><p className="playerSectionKicker">{t('VOTRE CARNET PERSONNEL','YOUR PRIVATE NOTEBOOK')}</p><h2>{t('Mes notes','My notes')}</h2></div>
      {loaded && <span>{notes.length}</span>}
    </div>
    <p className="personalNotesIntro">{t('Consignez vos soupçons, vos pistes et vos idées. Ces notes sont privées, réservées à votre joueur dans cette session. Elles ne coûtent aucun PA.','Record your suspicions, leads and ideas. These notes are private to your player in this session. They cost no AP.')}</p>
    {error && <p className="playerError" role="alert">{error}</p>}
    {status && <p className="playerFlash" role="status">{status}</p>}
    {!loaded && !error && <p role="status">{t('Chargement des notes…','Loading notes…')}</p>}
    {!editor && <div className="personalNoteActions">
      <button type="button" className="primary" disabled={busy || !loaded || notes.length>=limits.count} onClick={()=>open()}>{t('+ Ajouter une note','+ Add a note')}</button>
      <button type="button" disabled={busy} onClick={()=>void load()}>{t('Actualiser','Refresh')}</button>
    </div>}
    {editor && <form className="personalNoteEditor" onSubmit={event=>{event.preventDefault();void save();}}>
      <label htmlFor="personal-note-text">{editor.version ? t('Modifier ma note','Edit my note') : t('Nouvelle note','New note')}</label>
      <textarea id="personal-note-text" autoFocus rows={7} maxLength={limits.length} value={text} disabled={busy}
        onChange={event=>{setText(event.target.value);setStatus('');}}
        placeholder={t('Qui avez-vous rencontré ? Que souhaitez-vous vérifier ?','Who did you meet? What would you like to check?')}
        aria-describedby="personal-note-hint" />
      <small id="personal-note-hint">{text.length}/{limits.length} · {t('Appuyez sur Enregistrer pour conserver votre note.','Press Save to keep your note.')}</small>
      <div className="personalNoteActions">
        <button type="submit" className="primary" disabled={busy || !text.trim() || conflict}>{busy ? t('Enregistrement…','Saving…') : t('Enregistrer','Save')}</button>
        {conflict && <button type="button" className="primary" disabled={busy || !text.trim()} onClick={()=>void save(true)}>{t('Enregistrer comme nouvelle note','Save as a new note')}</button>}
        <button type="button" disabled={busy} onClick={cancel}>{t('Annuler','Cancel')}</button>
      </div>
    </form>}
    {loaded && notes.length===0 && !editor && <p className="personalNotesEmpty">{t('Aucune note pour le moment. Ajoutez votre première piste.','No notes yet. Add your first lead.')}</p>}
    <div className="personalNoteList">
      {notes.map(note=><article className="personalNote" key={note.id}>
        <time dateTime={note.updatedAt}>{new Date(note.updatedAt).toLocaleString(english?'en-GB':'fr-BE',{dateStyle:'short',timeStyle:'short'})}</time>
        <p>{note.text}</p>
        <div className="personalNoteActions">
          <button type="button" disabled={busy} onClick={()=>open(note)}>{t('Modifier','Edit')}</button>
          <button type="button" disabled={busy || !!editor} onClick={()=>void remove(note)}>{t('Supprimer','Delete')}</button>
        </div>
      </article>)}
    </div>
  </section>;
}
