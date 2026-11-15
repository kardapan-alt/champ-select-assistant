const test=require('node:test'),assert=require('node:assert/strict');
const {detectOffer,readGrid,OfferTracker,oldCardsVisible}=require('../src/augment-offers');
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
function trackerFixture(){
  const {result,grid}=fixture(),cards=detectOffer(result,grid,catalog,'KIWI').cards,t=new OfferTracker();
  const observe=(at,offer=cards,g=grid,candidates=[])=>t.observe({at,aspect:16/9,cards:offer,grid:g,candidates,active:true});
  observe(1000);observe(1700);
  const input=(type,at,x=195,y=160)=>t.input({type,at,x,y,width:640,height:360});
  return {t,cards,grid,observe,input};
}
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
module.exports={fixture};
