const RED=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const TYPES=['RED','BLACK','EVEN','ODD','LOW','HIGH','DOZEN1','DOZEN2','DOZEN3','COLUMN1','COLUMN2','COLUMN3'];
export function rouletteBet(selection,bet){
  if(typeof selection!=='string'||(!TYPES.includes(selection)&&!/^NUMBER:(?:[0-9]|[12][0-9]|3[0-6])$/.test(selection)))throw Error('ROULETTE_INVALID_SELECTION');
  return {selection,bet,cards:[],done:false};
}
// Returns include the original stake. Zero loses every outside bet.
export function roulettePayout({selection:s,bet},n){
  if(s.startsWith('NUMBER:'))return Number(s.slice(7))===n?bet*36:0;
  if(n===0)return 0;
  if(s.startsWith('DOZEN'))return Math.ceil(n/12)===Number(s.slice(5))?bet*3:0;
  if(s.startsWith('COLUMN'))return (n-1)%3+1===Number(s.slice(6))?bet*3:0;
  const win={RED:RED.has(n),BLACK:!RED.has(n),EVEN:n%2===0,ODD:n%2===1,LOW:n<=18,HIGH:n>=19}[s];
  return win?bet*2:0;
}
