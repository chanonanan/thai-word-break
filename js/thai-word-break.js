class TrieNode { 
  constructor(){ 
    this.child = Object.create(null); 
    this.end = false; 
  } 
}

class Trie {
  constructor(){ 
    this.root = new TrieNode(); 
    this.maxlen = 0; 
  }

  add(word){ 
    if(!word) return; 
    let n = this.root; 
    for(const ch of word){ 
      n = n.child[ch] || (n.child[ch] = new TrieNode()); 
    } 
    n.end = true; 
    if(word.length > this.maxlen) this.maxlen = word.length; 
  }

  longestAt(text, i){ 
    let n = this.root, end = -1, j = i; 
    while(j < text.length){ 
      const ch = text[j]; 
      n = n.child[ch]; 
      if(!n) break; 
      if(n.end) end = j; 
      j++; 
      if(j-i > this.maxlen) break; 
    } 
    return end; 
  }
}

function isThai(ch){ 
  const o = ch.codePointAt(0); 
  return o >= 0x0E00 && o <= 0x0E7F; 
}

function isCombining(ch){ 
  const o = ch.codePointAt(0); 
  return (o >= 0x0E31 && o <= 0x0E31) || (o >= 0x0E34 && o <= 0x0E3A) || (o >= 0x0E47 && o <= 0x0E4E); 
}

function segLongestMatch(text, trie){
  const out = []; 
  let i = 0; 
  const n = text.length;
  
  while(i < n){
    const ch = text[i];
    if(!isThai(ch)){ 
      let j = i+1; 
      while(j < n && !isThai(text[j])) j++; 
      out.push({tok: text.slice(i,j), thai: false}); 
      i = j; 
      continue; 
    }
    const end = trie.longestAt(text,i);
    if(end >= i){ 
      out.push({tok: text.slice(i,end+1), thai: true}); 
      i = end+1; 
      continue; 
    }
    let j = i+1; 
    while(j < n && isCombining(text[j])) j++; 
    out.push({tok: text.slice(i,j), thai: true}); 
    i = j;
  }
  return out;
}

const ZWSP = '\u200B';

function insertBreaksByWords(text, trie, useWbr){
  if(!text) return text;
  const BR = useWbr ? '<wbr>' : ZWSP;
  const toks = segLongestMatch(text, trie);
  let out = ''; 
  for(let i = 0; i < toks.length; i++){ 
    out += toks[i].tok; 
    if(toks[i].thai && i+1 < toks.length && toks[i+1].thai) out += BR; 
  }
  return out;
}

export { Trie, insertBreaksByWords };
