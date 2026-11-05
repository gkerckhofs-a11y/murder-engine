export type TutorialLanguage = 'FR' | 'EN';
export type TutorialStepId = 'welcome' | 'sheets' | 'notebook' | 'bag' | 'play' | 'qr' | 'updates';
export type TutorialStep = {id:TutorialStepId; label:string; title:string; body:string; tip:string};

export const tutorialSteps:Record<TutorialLanguage,TutorialStep[]> = {
  FR:[
    {id:'welcome',label:'LE PRINCIPE',title:'L’enquête commence entre vous.',body:'Incarnez votre personnage, discutez et confrontez vos pistes. L’app garde vos informations et vous accompagne pour les actions de jeu.',tip:'Un doute sur une règle ? Demandez au maître du jeu (MJ).'},
    {id:'sheets',label:'FICHES',title:'Entrez dans votre rôle.',body:'Relisez votre histoire, vos missions et vos conseils de roleplay. Votre QR personnel se trouve aussi ici.',tip:'Gardez vos secrets pour vous… ou choisissez à qui les confier.'},
    {id:'notebook',label:'CARNET',title:'Reliez les informations.',body:'Notez vos idées, retrouvez vos relations et suivez le fil Infos. Il rassemble vos découvertes, les nouvelles reçues et les résultats de vote.',tip:'Les rappels d’indices vous aident à faire des liens. À vous d’en tirer vos conclusions.'},
    {id:'bag',label:'SAC',title:'Examinez ce que vous avez.',body:'Vos ressources, objets et indices sont réunis sur une seule page. Ouvrez les documents pour lire leur contenu complet.',tip:'Carnet : ce que vous savez. Sac : vos ressources et les pièces de votre enquête.'},
    {id:'play',label:'JOUER',title:'Choisissez votre action.',body:'Fouillez un lieu, utilisez une compétence ou participez à un vote ouvert. Vérifiez les conditions et le coût affichés avant d’agir.',tip:'Les PA sont vos points d’action. Les coûts et délais suivent les règles de votre partie.'},
    {id:'qr',label:'LES QR',title:'Scannez depuis l’app.',body:'Pour interagir avec un personnage, choisissez d’abord l’action dans Jouer, puis utilisez son bouton de scan. Pour une fouille, utilisez « Scanner un lieu ».',tip:'La caméra seule du téléphone ouvre une page d’aide. Pour présenter votre QR : Fiches → Mon QR.'},
    {id:'updates',label:'LES NOUVEAUTÉS',title:'Un chiffre ? Du nouveau.',body:'Les petits chiffres signalent des éléments non vus. Consultez-les : le compteur diminue à mesure que vous les voyez.',tip:'Les résultats de vote sont dans Carnet → Infos → Vote. Retrouvez les règles et ce tutoriel dans Contexte.'},
  ],
  EN:[
    {id:'welcome',label:'THE IDEA',title:'The investigation starts with you.',body:'Play your character, talk to others and compare your leads. The app keeps your information together and supports your game actions.',tip:'Unsure about a rule? Ask the game master (GM).'},
    {id:'sheets',label:'SHEETS',title:'Step into your role.',body:'Read your story, missions and roleplay advice. Your personal QR code is here too.',tip:'Keep your secrets to yourself… or choose who to trust with them.'},
    {id:'notebook',label:'NOTEBOOK',title:'Connect the information.',body:'Write down ideas, revisit your relationships and follow the Info feed. It brings together discoveries, received updates and vote results.',tip:'Clue reminders help you make connections. The conclusions are yours to draw.'},
    {id:'bag',label:'BAG',title:'Examine what you have.',body:'Your resources, items and clues are together on one page. Open documents to read their full contents.',tip:'Notebook: what you know. Bag: your resources and the pieces of your investigation.'},
    {id:'play',label:'PLAY',title:'Choose your action.',body:'Search a location, use an ability or take part in an open vote. Check the conditions and displayed cost before acting.',tip:'AP means action points. Costs and waiting times follow the rules of your game.'},
    {id:'qr',label:'QR CODES',title:'Scan from inside the app.',body:'To interact with a character, choose the action in Play first, then use its scan button. To search a room, use “Scan a location”.',tip:'Your phone’s camera alone opens a help page. To show your QR: Sheets → My QR.'},
    {id:'updates',label:'UPDATES',title:'A number means something new.',body:'Small counters flag items you haven’t seen. Read them: the counters decrease as you view the items.',tip:'Vote results are in Notebook → Info → Vote. Find the rules and this tutorial again in Context.'},
  ],
};

// Browser-local dismissal, isolated between participants, characters and sessions.
// No player access token or scenario content is stored here.
export function tutorialStorageKey(portal:any):string {
  const {session,character,participant}=portal??{};
  if(!session?.id||!character?.externalId||!participant?.id)return '';
  return `murderTutorial:v1:${session.id}:${character.externalId}:${participant.id}`;
}
