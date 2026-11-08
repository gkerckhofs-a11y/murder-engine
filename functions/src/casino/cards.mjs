import {randomInt} from 'node:crypto';

export function shuffle(decks=1,random=randomInt){
  const cards=Array.from({length:52*decks},(_,i)=>`${['C','D','H','S'][Math.floor(i/13)%4]}${i%13+2}`);
  for(let i=cards.length-1;i>0;i--){const j=random(i+1);[cards[i],cards[j]]=[cards[j],cards[i]];}
  return cards;
}
export const rank=card=>Number(card.slice(1));
export function blackjackValue(cards){let value=cards.reduce((n,c)=>n+(rank(c)===14?11:Math.min(rank(c),10)),0);let aces=cards.filter(c=>rank(c)===14).length;while(value>21&&aces-- >0)value-=10;return value;}
export function compare(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]??0)-(b[i]??0);if(d)return Math.sign(d);}return 0;}
export function five(cards){
  const ranks=cards.map(rank).sort((a,b)=>b-a);const groups=[...new Set(ranks)].map(r=>[r,ranks.filter(x=>x===r).length]).sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  const flush=cards.every(c=>c[0]===cards[0][0]);const unique=[...new Set(ranks)];
  const straight=unique.length===5&&(unique[0]-unique[4]===4?unique[0]:unique.join(',')==='14,5,4,3,2'?5:0);
  if(flush&&straight)return [8,straight];
  if(groups[0][1]===4)return [7,groups[0][0],groups[1][0]];
  if(groups[0][1]===3&&groups[1][1]===2)return [6,groups[0][0],groups[1][0]];
  if(flush)return [5,...ranks];if(straight)return [4,straight];
  if(groups[0][1]===3)return [3,groups[0][0],...groups.slice(1).map(g=>g[0])];
  if(groups[0][1]===2&&groups[1][1]===2)return [2,Math.max(groups[0][0],groups[1][0]),Math.min(groups[0][0],groups[1][0]),groups[2][0]];
  if(groups[0][1]===2)return [1,groups[0][0],...groups.slice(1).map(g=>g[0])];return [0,...ranks];
}
export function best(cards){
  if(cards.length<5||cards.length>7)throw Error('INVALID_POKER_CARDS');let result=[];
  for(let a=0;a<cards.length-4;a++)for(let b=a+1;b<cards.length-3;b++)for(let c=b+1;c<cards.length-2;c++)for(let d=c+1;d<cards.length-1;d++)for(let e=d+1;e<cards.length;e++){
    const score=five([cards[a],cards[b],cards[c],cards[d],cards[e]]);if(compare(score,result)>0)result=score;
  }return result;
}
