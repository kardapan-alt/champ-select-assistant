const rules=require('../data/mayhem-rule-evidence.json');
const augments=require('../data/mayhem-augments.json');
const headliners=require('../data/headliner-texts.json');
const maps=require('../data/item-maps.json');
const catalogDate=require('../data/catalog.json').source?.match(/\d{4}-\d{2}-\d{2}/)?.[0]||null;
const patchOf=value=>{const m=typeof value==='string'&&value.match(/^(\d+)\.(\d+)(?:[.+-]|$)/);return m?`${m[1]}.${m[2]}`:null;};
const patchStatus=(current,source)=>!patchOf(current)||!patchOf(source)?'unknown':patchOf(current)===patchOf(source)?'match':'different';
function dataFreshness(game,{connected=false,mode='classic',analysisAt=null,baseSource=null,runeSource=null}={}){
  const p=game?.provenance||{},version=connected?p.version:null;
  const rows=[
    {name:'Przedmioty i ceny',patch:patchOf(p.version),date:p.loadedAt||catalogDate,status:connected&&p.source==='client'&&game.items.size?'client':'unknown',
      detail:p.source==='client'?(connected?'Dane pobrane z lokalnego klienta.':'Ostatni odczyt klienta; połączenie jest przerwane.'):'Wbudowana kopia katalogu; aktualny patch niepotwierdzony.'},
    {name:'Dostępność przedmiotów na mapach',patch:patchOf(maps.version),status:patchStatus(version,maps.version),detail:'Wbudowana tabela map używana, gdy klient nie podaje dostępności.'},
    {name:'Reguły buildu i run',patch:null,status:'unknown',detail:'Reguły wbudowane i własne ustawienia. Brak potwierdzenia zgodności wszystkich reguł z bieżącym patchem.'}
  ];
  if(baseSource)rows.push({name:'Bazowy build',patch:patchOf(baseSource.patch),date:baseSource.fetched,status:patchStatus(version,baseSource.patch),
    detail:`Zapis OP.GG: ${baseSource.mode==='aram'?'ARAM':'Summoner’s Rift'}. ${mode==='mayhem'?'Baza ARAM dopasowywana do augmentów; to nie statystyki Mayhem.':'Wbudowana kopia, nie bieżący odczyt statystyk.'}`});
  if(runeSource&&mode!=='mayhem')rows.push({name:'Strona run',patch:patchOf(runeSource.patch),date:runeSource.fetched,status:patchStatus(version,runeSource.patch),
    detail:`${runeSource.live?'Pobrana analiza':'Zapis'} OP.GG: ${runeSource.mode==='aram'?'ARAM':runeSource.position||'Summoner’s Rift'}. Drobne runy dopasowywane do widocznych przeciwników.`});
  if(mode==='mayhem')rows.push(
    {name:'Reguły augmentów',patch:patchOf(rules.patch),date:rules.reviewed,status:patchStatus(version,rules.patch),detail:'Patch zapisany przy ostatnim przeglądzie reguł.'},
    {name:'Katalog augmentów',date:augments.fetched,patch:augments.patch,status:patchStatus(version,augments.patch),detail:'Nazwy PL i EN oraz listy kart dla obu odmian Mayhem z danych klienta.'},
    {name:'Teksty Headlinerów',date:headliners.fetched,patch:null,status:'unknown',detail:'Data pobrania tekstów do OCR. Nie oznacza testu rozpoznawania w prawdziwym meczu.'}
  );
  else if(analysisAt)rows.push({name:'Build z OP.GG',date:analysisAt,patch:null,status:'unknown',detail:'Czas pobrania użytej analizy. Źródło nie potwierdziło numeru patcha; pamięć podręczna może być starsza.'});
  const different=rows.some(r=>r.status==='different');
  return {version:patchOf(version),rows,warning:different,
    summary:different?'Dane: różne patche':!patchOf(version)?'Dane: patch niepotwierdzony':`Dane: klient ${patchOf(version)} · szczegóły`};
}
module.exports={patchOf,patchStatus,dataFreshness};
