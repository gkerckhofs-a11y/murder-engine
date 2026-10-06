declare global {
  interface Window {
    firebase?:any;
  }
}

const ORGANIZER_EMAIL='gkerckhofs@gmail.com';

function wait(ms:number){
  return new Promise(resolve=>window.setTimeout(resolve,ms));
}

async function firebaseAuth(){
  for(let attempt=0;attempt<60;attempt++){
    const firebase=window.firebase;

    // /__/firebase/init.js initializes the default app for the
    // Firebase project attached to the current Hosting site.
    if(firebase?.auth && firebase.apps?.length)
      return firebase.auth();

    await wait(75);
  }

  throw new Error('FIREBASE_AUTH_SDK_UNAVAILABLE');
}

export async function getOrganizerUser(){
  const auth=await firebaseAuth();

  if(auth.currentUser)return auth.currentUser;

  return await new Promise<any>(resolve=>{
    const stop=auth.onAuthStateChanged((user:any)=>{
      stop();
      resolve(user??null);
    });
  });
}

export async function signInOrganizer(){
  const auth=await firebaseAuth();
  const provider=new window.firebase.auth.GoogleAuthProvider();

  provider.setCustomParameters({
    login_hint:ORGANIZER_EMAIL,
  });

  const result=await auth.signInWithPopup(provider);
  const user=result?.user??auth.currentUser;

  if(!user)
    throw new Error('ORGANIZER_SIGN_IN_FAILED');

  if(String(user.email??'').toLowerCase()!==ORGANIZER_EMAIL)
    throw new Error('ORGANIZER_ACCOUNT_NOT_ALLOWED');

  return user;
}

export async function organizerToken(interactive=false){
  let user=await getOrganizerUser();

  if(!user&&interactive)
    user=await signInOrganizer();

  if(!user)return null;

  if(String(user.email??'').toLowerCase()!==ORGANIZER_EMAIL)
    return null;

  return await user.getIdToken();
}

export async function signOutOrganizer(){
  const auth=await firebaseAuth();
  await auth.signOut();
}

export {ORGANIZER_EMAIL};
