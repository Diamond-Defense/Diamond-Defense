// Local draft history; record identity and server revisions stay outside snapshots.
export function emptyHistory(){return {entries:[],index:-1};}
export function recordHistory(history,snapshot,limit=50){
 if(history.entries[history.index]===snapshot)return history;
 const entries=[...history.entries.slice(0,history.index+1),snapshot].slice(-limit);
 return {entries,index:entries.length-1};
}
export function stepHistory(history,direction){
 const index=history.index+direction;
 return index<0||index>=history.entries.length?history:{...history,index};
}
