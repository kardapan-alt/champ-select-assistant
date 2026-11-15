// Sources: Riot patch 26.21 / 26.22. Unknown modifiers never receive invented scores.
const source='https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-21-notes/';
const catalog=[
  {id:'kda',name:'K/DA',tip:'Zbierz 4 karty K/DA, aby otrzymać dodatkowy augment. Zapisz go razem z pozostałymi; porównanie uwzględni cały zestaw.'},
  {id:'heartsteel',name:'HEARTSTEEL',tip:'Augmenty mogą otrzymać dodatkowe modyfikatory. Porównanie ocenia bazowy efekt; sprawdź w grze modyfikator każdej karty przed wyborem.'},
  {id:'true-damage',name:'True Damage',tip:'Eliminacje i zniszczenie wież mogą dać drużynie kowadła. Ich bonusów do statystyk nie odczytuję; sam Headliner nie wymusza zmiany przedmiotów.'},
  {id:'pentakill',name:'Pentakill',tip:'Wzmocnienie umiejętności na początku gry i na poziomie 18. Zapisz wzmacnianą umiejętność; sprawdzę konflikt z augmentami wyłączającymi R.'},
  {id:'disco',name:'Kosmofaza / Space Groove',tip:'Taniec pod kulą daje wszystkim złoto. Kup teraz korzysta z faktycznie odczytanego złota, bez doliczania przewidywanych nagród.'},
  {id:'cafe-cuties',name:'Cafe Cuties',tip:'Relikty zdrowia mają silniejszy efekt. Korzystaj z nich z drużyną; nie traktuję ich jako stałego źródła leczenia z przedmiotów.'},
  {id:'bees',name:'Pszczelaści / The Bee Band',tip:'Zbieraj miód i unikaj pszczół na mapie. Sam ten Headliner nie uzasadnia zmiany buildu.'},
  {id:'superfans',name:'Superfani / Superfans',tip:'Dodatkowy augment na poziomie 21. Po wyborze uwzględnię go w porównaniu i buildzie; nie doliczam nagrody przed jej otrzymaniem.'},
  {id:'command-line',name:'Command Line',tip:'W każdej selekcji możesz przerzucić jeden augment na wyższy poziom. Po przerzucie poczekaj na ponowne rozpoznanie trzech kart.'},
  {id:'other',name:'Inny / nowy Headliner',tip:'Brak potwierdzonej reguły dla tego Headlinera. Build nadal uwzględnia zapisane augmenty i odczytany ekwipunek.'},
];
function validateHeadliner(value){
  if(value==null||value.id==='')return null;
  if(typeof value!=='object'||!catalog.some(h=>h.id===value.id))throw Error('Wybierz Headlinera z listy.');
  const ability=value.ability||'';
  if(!['','Q','W','E','R'].includes(ability))throw Error('Wybierz umiejętność Q, W, E lub R.');
  return {id:value.id,ability:value.id==='pentakill'?ability:''};
}
function headlinerView(value,selection={}){
  const h=catalog.find(h=>h.id===value?.id);if(!h)return null;
  const rules=require('./mayhem-rules'),augments=require('../data/mayhem-augments.json').augments;
  const noR=(selection.augments||[]).some(id=>rules[augments.find(a=>a.id===id)?.api.replace(/^ARAM_/,'')]?.noUltimate);
  return {...h,ability:value.ability||'',source,warning:h.id==='pentakill'&&value.ability==='R'&&noR?'Back To Basics wyłącza R — wzmocnienie tej umiejętności nie będzie użyteczne.':null};
}
// Storage bound, not an assertion about the number of slots in the current event.
const MAX_AUGMENTS=12;
module.exports={catalog,source,validateHeadliner,headlinerView,MAX_AUGMENTS};
