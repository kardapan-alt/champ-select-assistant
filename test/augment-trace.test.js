const test=require('node:test'),assert=require('node:assert/strict');
const {AugmentTrace}=require('../src/augment-trace');
const {OfferTracker}=require('../src/augment-offers');
const names=new Map([[2064,'Quickstep'],[1353,'Taran (Tank Engine)'],[3131,'Still Here'],[3078,'The Boom and the Bass']]);
const nameOf=id=>names.get(id)||String(id);
const original=[2064,1353,3131],updated=[null,1353,3078];
const grid={valid:true,width:320,height:180,pixels:Buffer.alloc(320*180,24)};
const cards=ids=>ids.map((id,i)=>({id,rect:{x:.18+i*.24,y:.18,w:.18,h:.50}}));
test('unconfirmed layout reports new distinct-title counts only while awaiting the rerolled cards',()=>{
  const trace=new AugmentTrace('match:Shen:KIWI',nameOf);
  const missing=(at,n)=>trace.record('missing-layout',at,{titleCount:n});
  missing(1000,1);assert.equal(trace.entries.length,0);
  trace.record('reroll',1200,{slot:3,id:3131});
  for(const [at,n] of [[1150,2],[1500,0],[1700,0],[1900,2],[2100,1],[2300,2],[12000,3]])missing(at,n);
  trace.record('offer',12100,{ids:updated,focused:true});missing(12500,3);
  trace.record('reroll',13000,{slot:2,id:1353});missing(13200,1);
  trace.record('offer',13400,{ids:original,focused:true});missing(13600,3);
  const failures=trace.entries.filter(e=>e.event==='missing-layout');
  assert.deepEqual(failures.map(e=>[e.rotation,e.titleCount]),[[1,0],[1,2],[2,1]]);
  assert.ok(failures.every(e=>!Object.hasOwn(e,'ids') && !Object.hasOwn(e,'readings')));
});
function scenario(){
  const trace=new AugmentTrace('match:Shen:KIWI',nameOf);
  const t=new OfferTracker((...args)=>trace.record(...args));
  const frame=(at,ids,buffer=grid)=>{
    const offer=ids&&cards(ids);
    if(offer)trace.record('offer',at,{ids,focused:true});
    return t.observe({at,aspect:16/9,cards:ids?.every(Boolean)?offer:null,partial:offer,grid:buffer,active:true});
  };
  const input=(type,at,x=320,y=160)=>t.input({type,at,x,y,width:640,height:360});
  return {trace,t,frame,input,events:()=>trace.entries.map(e=>e.event)};
}
test('rerolled Shen middle card leaves a named semantic trace on partial recognition',()=>{
  const {trace,t,frame,input,events}=scenario();
  frame(1000,original);frame(1500,original);
  t.abort('reroll',1600);trace.record('reroll',1600,{slot:1,id:2064});
  frame(1900,updated);frame(2200,updated);
  input('down',2240);input('up',2290);
  assert.equal(frame(2600,null),null);assert.equal(frame(2900,null),1353);
  assert.deepEqual(events(),['offer','reroll','offer','down','up','absent','confirmed']);
  assert.equal(trace.entries[1].rotation,1);
  for (const e of trace.entries.slice(3)){assert.equal(e.id,1353);assert.equal(e.slot,2);assert.match(e.message,/Tank Engine/);}
  // An observation can confirm a gesture. Only the successful durable write in main emits "saved".
  assert.ok(!events().includes('saved'));
  input('down',3200);input('up',3250);frame(3600,null);
  assert.equal(events().at(-1),'confirmed');
});
test('loss before click, loss between press and release and conflicting frames are distinguishable',()=>{
  for(const reason of ['no-press','no-release','focus','stale','release','changed','unknown-title','unreadable-frame']){
    const {t,trace,frame,input,events}=scenario();
    frame(1000,updated);frame(1400,updated);
    if(reason==='no-press'){
      frame(1700,null);frame(2100,null);input('down',2300);frame(2400,null);
      assert.ok(events().includes('no-press'));assert.ok(!events().includes('down'));continue;
    }
    if(reason==='no-release'){
      input('down',1500);frame(1700,null);frame(2100,null);
      assert.ok(events().includes('no-release'));continue;
    }
    const pressed=reason==='stale'?4000:1500;
    input('down',pressed,reason==='unknown-title'?175:320);
    if(reason==='focus')t.input({type:'focus',focused:false,at:1550});
    else if(reason==='unreadable-frame')t.abort(reason,1550);
    else{
      input('up',pressed+40,reason==='release'?185:320);
      frame(pressed+200,reason==='changed'?[2064,3131,3078]:null);
      frame(pressed+600,null);
    }
    assert.ok(trace.entries.some(e=>e.event==='discard'&&e.reason===reason),JSON.stringify(trace.entries));
    assert.ok(!events().includes('confirmed'),reason);
  }
});
test('diagnostics resume only the same match, stay bounded, and do not collect unrelated input',()=>{
  const {trace,t,frame,input}=scenario();
  input('down',100,20,20);input('up',140,20,20);frame(500,null);
  assert.deepEqual(trace.entries,[]);
  frame(1000,original);input('down',1100,20,20);input('up',1140,20,20);frame(1500,original);
  assert.equal(trace.entries.some(e=>e.event==='down'),false);
  t.input({type:'focus',focused:false,at:1520});t.input({type:'focus',focused:false,at:1600});
  input('down',1650);input('up',1700);
  assert.equal(trace.entries.filter(e=>e.event==='focus').length,1);
  for(let i=0;i<50;i++)trace.record('reroll',2000+i,{slot:2,id:1353,x:5,y:10,playerName:'private',image:'pixels'});
  assert.equal(trace.entries.length,40);
  assert.ok(trace.entries.every(e=>Object.keys(e).every(key=>['at','event','rotation','message','id','slot'].includes(key))));
  const prior={matchKey:trace.key,clickTrace:JSON.parse(JSON.stringify(trace.entries))};
  const resumed=new AugmentTrace(trace.key,nameOf,prior);
  assert.deepEqual(resumed.entries,trace.entries);assert.equal(resumed.rotation,50);
  assert.deepEqual(new AugmentTrace('another-match',nameOf,prior).entries,[]);
});
