import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function boot(){
  const listeners={},timers=[];
  const placeholder={parentNode:null};
  const root={textContent:'Chargement…',_html:'initial',get innerHTML(){return this._html;},set innerHTML(value){this._html=value;placeholder.parentNode=null;}};
  placeholder.parentNode=root;
  const window={addEventListener:(name,fn)=>{listeners[name]=fn;},setTimeout:(fn)=>{timers.push(fn);}};
  const document={getElementById:id=>id==='root'?root:id==='boot-placeholder'?placeholder:null};
  vm.runInNewContext(script,{window,document});
  return {root,placeholder,window,listeners,timers,mount(text){placeholder.parentNode=null;root._html=text;root.textContent=text;}};
}

test('missing JavaScript still shows the recovery action',()=>{
  const b=boot();b.timers[0]();
  assert.match(b.root.innerHTML,/JavaScript ne s’est pas chargée/);
  assert.match(b.root.innerHTML,/location.reload/);
});
test('a mounted player waiting for its API keeps its loading state beyond seven seconds',()=>{
  const b=boot();b.mount('Chargement de votre personnage…');b.timers[0]();
  assert.equal(b.root.innerHTML,'Chargement de votre personnage…');
});
test('character content containing Chargement does not trigger the boot fallback',()=>{
  const b=boot();b.mount('Chargement des caisses — document du personnage');b.timers[0]();
  assert.equal(b.root.innerHTML,'Chargement des caisses — document du personnage');
});
test('an extension rejection or runtime error cannot destroy the mounted app',()=>{
  const b=boot();b.mount('Fiche de Sal Tessio');
  b.listeners.error({target:b.window,message:'Unable to establish a connection with the popup'});
  b.listeners.unhandledrejection({reason:new Error('Extension metadata failure')});
  assert.equal(b.root.innerHTML,'Fiche de Sal Tessio');
});
test('a failed portrait cannot replace the app with a JavaScript boot error',()=>{
  const b=boot();b.listeners.error({target:{tagName:'IMG',src:'/portrait.png'}});
  assert.equal(b.root.innerHTML,'initial');
});
test('an entry script failure before mount is reported and escaped',()=>{
  const b=boot();b.listeners.error({target:{tagName:'SCRIPT',src:'/assets/main.js?x=<bad>'}});
  assert.match(b.root.innerHTML,/Impossible de charger/);
  assert.match(b.root.innerHTML,/&lt;bad&gt;/);
  assert.doesNotMatch(b.root.innerHTML,/<bad>/);
});
