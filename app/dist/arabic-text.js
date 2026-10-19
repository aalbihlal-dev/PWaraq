/* Arabic text extracted from PDFs.
   - normalizeArabic: always safe. Presentation-form glyphs (U+FB50–FDFF, U+FE70–FEFF) become normal letters.
   - findReversedLines / repairDirection: only for lines with hard evidence of reversal, and only applied after the
     user approves a preview. The evidence is a word that STARTS with ة or ى, which correct Arabic never has
     (they only end words); a reversed line has such words and no word ending in them. Endings like "لا" are NOT
     evidence: فعلا، سهلا، أهلا، مثلا are ordinary words. */
const WORD=/[ء-ي]{2,}/g;
export function normalizeArabic(text){return String(text).normalize('NFKC');}

export function lineLooksReversed(line){
  const words=line.match(WORD)||[];if(words.length<2)return false;
  const startsImpossible=words.filter((w)=>/^[ةى]/.test(w)).length,endsNormally=words.filter((w)=>/[ةى]$/.test(w)).length;
  return startsImpossible>=1&&endsNormally===0;
}
function reverseLine(line){
  // PDFs give visual order: Arabic letters reversed, numbers and Latin still left-to-right. Reversing the whole line
  // also reverses those runs, so they are flipped back.
  return [...line].reverse().join('').replace(/[0-9A-Za-z٠-٩.,:;/%@#+\-_()]+/g,(run)=>[...run].reverse().join(''));
}
/** Lines that would change, as {index, before, after}. Input should already be normalized. */
export function findReversedLines(text){
  return String(text).split('\n').map((before,index)=>lineLooksReversed(before)?{index,before,after:reverseLine(before)}:null).filter(Boolean);
}
export function repairDirection(text,changes=findReversedLines(text)){
  const lines=String(text).split('\n');for(const c of changes)lines[c.index]=c.after;return lines.join('\n');
}
