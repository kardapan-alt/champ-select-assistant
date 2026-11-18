const test=require('node:test'),assert=require('node:assert/strict');
const {detectOffer,readGrid,OfferTracker,OfferDisplay,oldCardsVisible,observePartial,filledCards}=require('../src/augment-offers');
const {migrateConfig}=require('../src/augment-vision');
const catalog=require('../data/mayhem-augments.json').augments;
const names=['Apex Inventor','Back To Basics','Ice Cold'];
const ids=names.map(name=>catalog.find(a=>a.english===name).id);
function fixture(titles=names){
  const width=640,height=360,pixels=Buffer.alloc(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixels[y*width+x]=15+(x*3+y*5)%45;
  const words=[];
  for(let i=0;i<3;i++){
    const cx=195+i*125,left=cx-54,right=cx+54;
    for(let y=70;y<=268;y++)for(let x=left;x<=right;x++)pixels[y*width+x]=(x-left<2||right-x<2||y-70<2||268-y<2)?190:20;
    const text=titles[i],start=cx-text.length*2.7;
    let x=start;for(const word of text.split(' ')){words.push({text:word,x,y:140,w:word.length*5.4,h:13});x+=word.length*5.4+5.4;}
  }
  const result={width,height,layouts:[[{words}]]};
  return {result,grid:readGrid({width,height,pixels:pixels.toString('base64')})};
}
const cleanGrid=()=>{
  const pixels=Buffer.alloc(640*360);for(let i=0;i<pixels.length;i++)pixels[i]=30+(i%113);
  return readGrid({width:640,height:360,pixels:pixels.toString('base64')});
};
test('wykrywa trzy tytuły i granice kart bez kalibracji, także wspólny wiersz OCR',()=>{
  const {result,grid}=fixture(),d=detectOffer(result,grid,catalog,'KIWI');
  assert.deepEqual(d.cards?.map(c=>c.id),ids);
  assert.ok(d.cards.every(c=>c.rect.y>.18&&c.rect.y<.21&&c.rect.h>.5));
  assert.ok(oldCardsVisible(grid,d.cards));assert.ok(!oldCardsVisible(cleanGrid(),d.cards));
  // Same nazwy bez ramek nie wystarczą (czat, sklep, cudzy tooltip).
  assert.equal(detectOffer(result,cleanGrid(),catalog,'KIWI').cards,null);
});
test('nieznany lub błędny tytuł nie jest zgadywany',()=>{
  for(const bad of ['Apex Invent0r','New Unseen Augment']){
    const {result,grid}=fixture([bad,names[1],names[2]]);assert.equal(detectOffer(result,grid,catalog,'KIWI').cards,null);
  }
});
test('dwa tytuły są przypisane do właściwych pozycji dopiero przy trzech ramkach i dwóch zgodnych odczytach',()=>{
  for(let slot=0;slot<3;slot++){
    const titles=names.with(slot,'Unknown OCR'),{result,grid}=fixture(titles);
    const detected=detectOffer(result,grid,catalog,'KIWI');
    assert.deepEqual(detected.partial?.map(c=>c.id),ids.with(slot,null));
    assert.ok(!detectOffer(result,cleanGrid(),catalog,'KIWI').partial);
    const first=observePartial(null,detected.partial,1000,1800);
    assert.equal(first.stable,false);
    const confirmed=observePartial(first,detected.partial,1800,1800);
    assert.equal(confirmed.stable,true);assert.equal(confirmed.token,1000);
    assert.equal(filledCards(confirmed),null);
    const manual={...confirmed,filled:ids[slot]};
    assert.deepEqual(filledCards(manual).map(c=>c.id),ids);
    assert.equal(observePartial(manual,detected.partial,4000,1800).filled,null);
    const changed=[...detected.partial];changed[(slot+1)%3]={...changed[(slot+1)%3],id:3150};
    assert.equal(observePartial(manual,changed,2100,1800).stable,false);
  }
  const duplicate=fixture([names[1],names[1],names[2]]);
  assert.ok(!detectOffer(duplicate.result,duplicate.grid,catalog,'KIWI').partial);
});
function trackerFixture(){
  const {result,grid}=fixture(),cards=detectOffer(result,grid,catalog,'KIWI').cards,t=new OfferTracker();
  const observe=(at,offer=cards,g=grid,candidates=[])=>t.observe({at,aspect:16/9,cards:offer,grid:g,candidates,active:true});
  observe(1000);observe(1700);
  const input=(type,at,x=195,y=160)=>t.input({type,at,x,y,width:640,height:360});
  return {t,cards,grid,observe,input};
}
test('porównanie przetrzymuje lukę w OCR, wygasa i usuwa ofertę po dwóch klatkach bez ramek',()=>{
  const display=new OfferDisplay(),{cards,grid}=trackerFixture();
  const frame=(at,offer,g=grid)=>display.observe(offer,at,16/9,g);
  frame(1000,cards);frame(1900,cards);
  assert.deepEqual(display.cards.map(c=>c.id),ids);
  const token=display.current.token;
  frame(2600,null,cleanGrid());
  assert.equal(display.current.held,true);
  frame(3500,cards);
  assert.equal(display.current.token,token);assert.equal(display.current.held,false);
  display.hold(7800);
  assert.equal(display.current.held,true);
  display.hold(11600);
  assert.equal(display.current,null);
  frame(12000,cards);frame(13000,cards);frame(13700,null,cleanGrid());frame(14400,null,cleanGrid());
  assert.equal(display.current,null);
});
test('dwa przerzuty nie publikują starych wyników i dopuszczają nieczytelny tytuł we właściwym miejscu',()=>{
  const display=new OfferDisplay(),{cards,grid}=trackerFixture();
  const frame=(at,set)=>{if(!display.waitingForReroll(set,at))display.observe(set,at,16/9,grid);};
  frame(1000,cards);frame(1800,cards);display.invalidateReroll(1,2000);
  frame(1900,cards);frame(2200,cards);
  assert.equal(display.current,null);
  const changed=cards.map((c,i)=>i===1?{...c,id:3150}:c);
  frame(2700,changed);frame(3700,changed);
  assert.equal(display.cards[1].id,3150);
  display.invalidateReroll(2,4000);
  const partial=changed.map((c,i)=>i===2?{...c,id:null}:c);
  frame(4400,partial);frame(5400,partial);
  assert.equal(display.cards,null);
  assert.deepEqual(display.current.cards.map(c=>c.id),[ids[0],3150,null]);
});
test('test ze zrzutu zwraca trzy wycinki, rzeczywisty tekst OCR i wynik detektora gry',async()=>{
  const {testOfferScreenshot}=require('../src/augment-screenshot');
  async function check(titles,frameWidth,pool='KIWI',entries=catalog){
    const {grid,result}=fixture(titles);
    if(frameWidth>640){ // Środkowy obraz 16:9 z marginesami ultrawide, jak w pełnej klatce gry.
      const scale=frameWidth/grid.width,margin=(frameWidth-grid.width)/2,height=Math.round(grid.height/scale);
      const resized=Buffer.alloc(grid.width*height);
      for(let y=0;y<height;y++)for(let x=0;x<grid.width;x++){
        const sx=Math.floor(x*scale-margin);
        if(sx>=0&&sx<grid.width)resized[y*grid.width+x]=grid.pixels[Math.floor(y*scale)*grid.width+sx];
      }
      grid.pixels=resized;grid.height=height;
    }
    const input={width:frameWidth*2,height:720,pool,grid:{...grid,pixels:grid.pixels.toString('base64')},png:'fixture'};
    let reads=0;
    const diagnostic=await testOfferScreenshot(input,{read:async png=>{assert.equal(png,'fixture');reads++;return result;}},entries);
    assert.equal(reads,1);
    return diagnostic;
  }
  const full=await check(names,640);
  assert.equal(full.status,'offer');
  assert.deepEqual(full.slots.map(s=>s.english),names);
  assert.deepEqual(full.slots.map(s=>s.readings),names.map(n=>[n]));
  const partial=await check([names[0],'Apex Invent0r',names[2]],800);
  assert.equal(partial.status,'incomplete');
  assert.deepEqual(partial.slots.map(s=>s.english),[names[0],null,names[2]]);
  assert.deepEqual(partial.slots[1].readings,['Apex Invent0r']);
  const jade=['Perseverance','Fan The Hammer','Vampirism'];
  assert.equal((await check(jade,640,'auto')).status,'offer');
  assert.equal((await check([names[0],jade[1],names[2]],640,'auto')).status,'incomplete');
  const rival={...catalog.find(a=>a.english===names[0]),id:99999,pools:['KIWI_JADE']};
  const ambiguous=await check(names,640,'auto',[...catalog,rival]);
  assert.equal(ambiguous.status,'incomplete');
  assert.equal(ambiguous.slots[0].name,null);
  assert.equal(ambiguous.slots[0].ambiguous,true);
});
test('pusty zrzut i brak języka OCR mają osobne wyniki bez przydzielania kart',async()=>{
  const {testOfferScreenshot}=require('../src/augment-screenshot'),{grid}=fixture();
  const input={width:1280,height:720,pool:'auto',grid:{...grid,pixels:grid.pixels.toString('base64')}};
  const language=await testOfferScreenshot(input,{read:async()=>({error:'language'})},catalog);
  assert.equal(language.status,'language');
  assert.ok(language.slots.length===3&&language.slots.every(s=>s.id===null));
  input.grid.pixels=Buffer.alloc(grid.width*grid.height).toString('base64');
  assert.equal((await testOfferScreenshot(input,{read:()=>assert.fail('Pusty obraz trafił do OCR')},catalog)).status,'empty');
});
test('wybór wymaga kliknięcia i zniknięcia kart na dwóch czytelnych klatkach',()=>{
  const {observe,input}=trackerFixture();input('down',1800);input('up',1900);
  assert.equal(observe(2400,null,cleanGrid()),null);assert.equal(observe(3100,null,cleanGrid()),ids[0]);
  assert.equal(observe(3800,null,cleanGrid()),null);
});
test('samo zniknięcie, przerzut pod kartą, przeciągnięcie i zmiana ofert nie dodają augmentu',()=>{
  for(const scenario of ['hover','reroll','drag','change']){
    const {observe,input,cards}=trackerFixture();
    if(scenario!=='hover'){input('down',1800,195,scenario==='reroll'?300:160);input('up',1900,scenario==='drag'?320:195,scenario==='reroll'?300:160);}
    if(scenario==='change')observe(2100,[cards[1],cards[0],cards[2]]);
    assert.equal(observe(2400,null,cleanGrid()),null,scenario);assert.equal(observe(3100,null,cleanGrid()),null,scenario);
  }
});
test('Escape, Alt-Tab, czarny obraz, zmiana rozdzielczości i nieaktualne karty anulują wybór',()=>{
  for(const scenario of ['escape','focus','black','aspect','stale']){
    const {t,observe,input}=trackerFixture();
    if(scenario==='aspect'){t.input({type:'down',at:1800,x:195,y:160,width:800,height:600});t.input({type:'up',at:1900,x:195,y:160,width:800,height:600});}
    else {input('down',scenario==='stale'?4000:1800);input('up',scenario==='stale'?4100:1900);}
    if(scenario==='escape')t.input({type:'cancel',at:2000});
    if(scenario==='focus')t.input({type:'focus',focused:false,at:2000});
    if(scenario==='black')observe(2200,null,{valid:false});
    assert.equal(observe(4400,null,cleanGrid()),null,scenario);assert.equal(observe(5100,null,cleanGrid()),null,scenario);
  }
});
test('zniknięcie samych napisów nie potwierdza wyboru, restart izoluje mecz',()=>{
  const {t,observe,input,grid}=trackerFixture();input('down',1800);input('up',1900);
  assert.equal(observe(2400,null,grid),null);assert.equal(observe(3100,null,grid),null);
  t.reset();assert.equal(observe(3800,null,cleanGrid()),null);
});
test('automatyczny start bez kalibracji, z zachowaniem świadomego wyłączenia',()=>{
  assert.deepEqual(migrateConfig(null),{enabled:true,mode:'auto'});
  assert.deepEqual(migrateConfig({enabled:true,width:1920,regions:[]}),{enabled:true,mode:'auto'});
  assert.deepEqual(migrateConfig({enabled:false,width:1920,regions:[]}),{enabled:false,mode:'auto'});
});
test('gra może schować kartę już po naciśnięciu, zanim gracz puści przycisk',()=>{
  const {observe,input}=trackerFixture();input('down',1800);
  assert.equal(observe(1850,null,cleanGrid()),null);input('up',1900);
  assert.equal(observe(2400,null,cleanGrid()),null);assert.equal(observe(3100,null,cleanGrid()),ids[0]);
});
test('zniknięcie musi być kolejne: powrót kart zeruje potwierdzenie',()=>{
  const {observe,input}=trackerFixture();input('down',1800);input('up',1900);
  assert.equal(observe(2400,null,cleanGrid()),null);assert.equal(observe(3100),null);
  assert.equal(observe(3800,null,cleanGrid()),null);assert.equal(observe(4500,null,cleanGrid()),ids[0]);
});

test('wolniejszy OCR nadal potwierdza dwie klatki i wybór, lecz odrzuca długą przerwę',()=>{
  for(const stale of [false,true]){
    const {t,cards,grid}=trackerFixture();t.reset();
    const observe=(at,c=cards,g=grid)=>t.observe({at,aspect:16/9,cards:c,grid:g,active:true,readMs:2300});
    observe(1000);observe(3800);assert.equal(t.streak,2);
    const clickAt=stale?11000:5000;
    for(const [type,at] of [['down',clickAt],['up',clickAt+100]])t.input({type,at,x:195,y:160,width:640,height:360});
    assert.equal(observe(clickAt+1800,null,cleanGrid()),null);
    assert.equal(observe(clickAt+4600,null,cleanGrid()),stale?null:ids[0]);
  }
});

test('pojedyncza pionowa krawędź mapy nie udaje pozostawionej karty',()=>{
  const {t,cards,observe,input}=trackerFixture(),grid=cleanGrid();
  const x=Math.round(cards[0].rect.x*grid.width);
  for(let y=0;y<grid.height;y++)grid.pixels[y*grid.width+x]=255;
  assert.equal(oldCardsVisible(grid,cards),false);
  input('down',1800);input('up',1900);assert.equal(observe(2400,null,grid),null);assert.equal(observe(3100,null,grid),ids[0]);
});
module.exports={fixture};

test('szybki wybór po pierwszej kompletnej ofercie wymaga zwolnienia i dwóch klatek gry',()=>{
  const {t,observe,input}=trackerFixture();t.reset();observe(1000);
  assert.equal(t.streak,1);
  input('down',1100);input('up',1140);
  assert.equal(observe(1500,null,cleanGrid()),null);
  input('down',1600,70,40);input('up',1650,70,40);
  const unrelated=[{id:ids[1],x:.02,y:.05,w:.1,h:.03}];
  assert.equal(observe(2100,null,cleanGrid(),unrelated),ids[0]);
  assert.equal(observe(2800,null,cleanGrid()),null);
});

test('powrót z kompaktu dopuszcza natychmiastowy klik tylko po odświeżeniu tych samych kart',()=>{
  for(const scenario of ['verified','changed','no-frame','too-old','delayed-frame']){
    const {t,cards,observe,input}=trackerFixture();
    t.input({type:'focus',focused:false,at:1800});
    if(scenario!=='no-frame'){
      t.preview(scenario==='changed'?[cards[1],cards[0],cards[2]]:cards,ids,scenario==='delayed-frame'?1799:2300);
      t.input({type:'focus',focused:false,at:2400}); // heartbeat while reading the assistant
    }
    // Clicking inside the assistant cannot select a game card.
    input('down',2450,320,160);input('up',2500,320,160);
    const back=scenario==='too-old'?9000:2600;
    t.input({type:'focus',focused:true,at:back});
    input('down',back+50);input('up',back+100);
    assert.equal(observe(back+350,null,cleanGrid()),null,scenario);
    assert.equal(observe(back+900,null,cleanGrid()),scenario==='verified'?ids[0]:null,scenario);
  }
});

test('kolejne kliknięcie przy ponownym pojawieniu się kart unieważnia stary wybór',()=>{
  const {observe,input}=trackerFixture();input('down',1800);input('up',1900);
  assert.equal(observe(2200,null,cleanGrid()),null);
  input('down',2350,320,160);input('up',2370,320,160);
  observe(2750);
  assert.equal(observe(3300,null,cleanGrid()),null);
  assert.equal(observe(4000,null,cleanGrid()),null);
});
