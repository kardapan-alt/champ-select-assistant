const {detectOffer,readGrid}=require('./augment-offers');
const {offerCrop}=require('./augment-vision');

// Rectangles use original screenshot coordinates, including the margins of ultrawide displays.
function wordsInRegion(result,crop,region){
  const readings=new Set();
  for(const layout of result?.layouts||[]){
    const lines=[];
    for(const line of layout){
      const words=line.words.filter(word=>{
        const x=crop.x+(word.x+word.w/2)/result.width*crop.w;
        const y=crop.y+(word.y+word.h/2)/result.height*crop.h;
        return x>=region.x && x<=region.x+region.w && y>=region.y && y<=region.y+region.h;
      }).sort((a,b)=>a.x-b.x);
      if(words.length)lines.push(words.map(word=>word.text).join(' '));
    }
    if(lines.length)readings.add(lines.join(' ').slice(0,170));
  }
  return [...readings];
}

function screenshotSlots(detected,result,crop,catalog){
  return [.308,.5,.692].map((x,index)=>{
    const card=detected.cards?.[index];
    const cx=card ? card.rect.x+card.rect.w/2 : crop.x+x*crop.w;
    const cy=card ? card.rect.y+card.rect.h*.48 : .414;
    const candidates=detected.candidates.filter(title=>{
      const dx=Math.abs(title.x+title.w/2-cx),dy=Math.abs(title.y+title.h/2-cy);
      if(card)return title.id===card.id && title.x>=card.rect.x && title.x+title.w<=card.rect.x+card.rect.w
        && title.y>=card.rect.y && title.y+title.h<=card.rect.y+card.rect.h;
      return dx<crop.w*.055 && dy<.075;
    }).sort((a,b)=>Math.abs(a.y+a.h/2-cy)-Math.abs(b.y+b.h/2-cy));
    const ids=[...new Set(candidates.map(title=>title.id))];
    const id=card?.id ?? (ids.length===1 ? ids[0] : null);
    const match=candidates.find(title=>title.id===id);
    const y=match ? match.y+match.h/2 : cy;
    const h=Math.max(.043,(match?.h||0)+.014);
    const w=card ? card.rect.w*.94 : crop.w*.16;
    const region={x:cx-w/2,y:y-h/2,w,h};
    const augment=id && catalog.find(entry=>entry.id===id);
    return {region,id:augment?.id||null,name:augment?.name||null,english:augment?.english||null,ambiguous:ids.length>1&&!card,
      readings:wordsInRegion(result,crop,region)};
  });
}

async function testOfferScreenshot(input,ocr,catalog){
  const {width,height,pool}=input||{};
  if(!['auto','KIWI','KIWI_JADE'].includes(pool))throw Error('Nieznana pula augmentów.');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<640||height<400||width>10000||height>10000||width*height>40000000)
    throw Error('Wybierz pełny zrzut okna gry w rozdzielczości od 640 × 400 do 40 megapikseli.');
  const grid=readGrid(input.grid),crop=offerCrop(width,height);
  if(!grid)throw Error('Nie udało się przygotować zrzutu do odczytu.');
  const result=grid.valid ? await ocr.read(input.png) : null;
  if(!result?.layouts){
    const status=!grid.valid?'empty':result?.error==='language'?'language':'error';
    return {status,slots:screenshotSlots({cards:null,candidates:[]},result,crop,catalog)};
  }
  const pools=pool==='auto'?['KIWI','KIWI_JADE']:[pool];
  const variants=pools.map(p=>{
    const detected=detectOffer({...result,crop},grid,catalog,p);
    return {offer:!!detected.cards,slots:screenshotSlots(detected,result,crop,catalog)};
  }).sort((a,b)=>Number(b.offer)-Number(a.offer));
  const slots=variants[0].slots.map((first,i)=>{
    const choices=variants.map(v=>v.slots[i]);
    const ids=new Set(choices.map(s=>s.id).filter(Boolean));
    if(ids.size>1||choices.some(s=>s.ambiguous))return {...first,id:null,name:null,english:null,ambiguous:true};
    return choices.find(s=>s.id)||first;
  });
  const confirmed=variants[0].offer && slots.every(s=>s.id);
  return {status:confirmed?'offer':'incomplete',slots};
}
module.exports={testOfferScreenshot};
