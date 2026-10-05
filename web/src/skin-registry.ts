export const SKIN_OPTIONS = [
  {
    id:'RETRO_1900_1930',
    label:'Retro 1900–1930',
    subtitle:'Mafia · Prohibition · Art déco',
    defaultAccent:'#C59A4A',
    preview:'♠',
  },
  {
    id:'WESTERN',
    label:'Western',
    subtitle:'Far West · Saloon · Poussière',
    defaultAccent:'#B56A34',
    preview:'★',
  },
  {
    id:'CONTEMPORARY_1980_2000',
    label:'Contemporary',
    subtitle:'Thriller · Police · Monde moderne',
    defaultAccent:'#49677A',
    preview:'●',
  },
  {
    id:'FUTURISTIC',
    label:'Futuristic',
    subtitle:'Science-fiction · Technologie · Dystopie',
    defaultAccent:'#35D0BA',
    preview:'◇',
  },
  {
    id:'CLASSIC_MYSTERY',
    label:'Classic Mystery',
    subtitle:'Manoir · Huis clos · Héritage',
    defaultAccent:'#8C6B3D',
    preview:'⌕',
  },
  {
    id:'MEDIEVAL_FANTASY',
    label:'Medieval Fantasy',
    subtitle:'Château · Cour · Guildes · Légendes',
    defaultAccent:'#9A6A32',
    preview:'⚜',
  },
  {
    id:'VICTORIAN_GOTHIC',
    label:'Victorian Gothic',
    subtitle:'Occultisme · Vampires · Spiritisme',
    defaultAccent:'#84576F',
    preview:'✦',
  },
  {
    id:'NOIR_1940_1950',
    label:'Noir 1940–1950',
    subtitle:'Détective · Jazz · Dossier criminel',
    defaultAccent:'#A58C61',
    preview:'◼',
  },
  {
    id:'VINTAGE_1960_1970',
    label:'Vintage 1960–1970',
    subtitle:'Espionnage · Jet-set · Pop rétro',
    defaultAccent:'#C26B3D',
    preview:'✺',
  },
] as const;

export type SkinId = typeof SKIN_OPTIONS[number]['id'];

export function asSkinId(value:unknown):SkinId{
  const id=String(value??'').trim().toUpperCase();
  return SKIN_OPTIONS.some(s=>s.id===id)
    ? id as SkinId
    : 'CONTEMPORARY_1980_2000';
}

export function skinOptionFor(value:unknown){
  const id=asSkinId(value);
  return SKIN_OPTIONS.find(s=>s.id===id) ?? SKIN_OPTIONS[2];
}

export function defaultAccentForSkin(value:unknown){
  return skinOptionFor(value).defaultAccent;
}

export function skinClassFor(value:unknown){
  return `skin-${asSkinId(value).toLowerCase().replaceAll('_','-')}`;
}
