const clone=value=>JSON.parse(JSON.stringify(value));
const counts=items=>{const out={};for(const i of items||[])out[i.id]=(out[i.id]||0)+(i.count||1);return out;};
const item=i=>({id:i.id,name:i.name,icon:i.icon||'',count:i.count||1});
const {rememberReplay}=require('./replay-checks');
class MatchReview {
  constructor(value={},save=()=>{}){this.value=value&&Array.isArray(value.matches)?value:{matches:[],active:null};this.save=save;}
  persist(){this.save(clone(this.value));}
  ensureActive({key,alias,name,mode,gameId,championId,owner}, time=null){
    if(!key||this.value.matches.some(m=>m.key===key))return null;
    if(this.value.active?.key!==key){
      this.finish('interrupted');
      this.value.active={key,alias,name,mode,gameId,championId,owner,startedAt:Date.now(),duration:0,events:[],items:[],augments:[],headliner:null,firstRead:time};
    }
    return this.value.active;
  }
  observe({key,alias,name,mode,snapshot,build,gameId,championId,owner,compareAugment,replayReport}){
    if(!key||snapshot?.status!=='live'||!snapshot.inventory||!Number.isFinite(snapshot.gameTime))return;
    const a=this.ensureActive({key,alias,name,mode,gameId,championId,owner},snapshot.gameTime);
    if(!a)return;
    if(a.firstRead==null)a.firstRead=snapshot.gameTime;
    const time=Math.floor(snapshot.gameTime);
    if(time<a.duration)return; // Delayed snapshots cannot rewrite the timeline.
    const events=[],before=counts(a.items),after=counts(snapshot.inventory.items);
    const added=snapshot.inventory.items.filter((i,n,list)=>list.findIndex(x=>x.id===i.id)===n&&after[i.id]>(before[i.id]||0)).map(i=>({...item(i),count:after[i.id]-(before[i.id]||0)}));
    const removed=a.items.filter((i,n,list)=>list.findIndex(x=>x.id===i.id)===n&&before[i.id]>(after[i.id]||0)).map(i=>({...item(i),count:before[i.id]-(after[i.id]||0)}));
    if(!a.events.length||added.length||removed.length)events.push({type:a.events.length?'inventory':'initial',time,added,removed});
    const augments=(build.mayhem?.hints||[]).map(h=>({id:h.id,name:h.name})),headliner=build.mayhem?.headliner||null;
    if (mode==='mayhem') {
      const addedCards = augments.filter(card => !a.augments.some(old => old.id===card.id));
      const removed = a.augments.some(old => !augments.some(card => card.id===old.id));
      if (addedCards.length || removed) {
        // A correction/undo removes its comparison too; a later pick starts fresh.
        const comparisons = (a.augmentComparisons || []).filter(old => augments.some(card => card.id===old.id));
        const context = !a.events.length ? 'first' : a.gap ? 'gap' : addedCards.length>1 || removed ? 'group' : 'single';
        for (const card of addedCards) {
          let impact = null;
          try { impact = compareAugment?.(card.id); } catch { /* Retain the pick if its baseline is unavailable. */ }
          comparisons.push({id:card.id,time,context,...impact});
        }
        a.augmentComparisons = comparisons;
      }
    }
    if(JSON.stringify(augments)!==JSON.stringify(a.augments)||JSON.stringify(headliner)!==JSON.stringify(a.headliner))events.push({type:'augments',time,augments,headliner});
    const target=build.shop?.target?{id:build.shop.target.id,name:build.shop.target.name,why:build.shop.target.why}:null;
    if(JSON.stringify(target)!==JSON.stringify(a.target||null))events.push({type:'plan',time,target});
    const hasOutcome=require('./match-result').gameId(a.gameId)&&['win','loss'].includes(snapshot.outcome)&&!a.outcome;
    const dirty=events.length||time-a.duration>=15||a.gap||hasOutcome;
    if(!dirty)return;
    if (events.length || !a.replays?.first) rememberReplay(a,time,build,replayReport);
    if(a.gap){events.unshift({type:'gap',time});a.gap=false;}
    a.events.push(...events);if(a.events.length>200){a.events=a.events.slice(-200);a.trimmed=true;}
    Object.assign(a,{duration:time,items:snapshot.inventory.items.map(item),augments,headliner,target,
      build:build.items.map(item),synergies:build.mayhem?.synergies||[]});
    if(hasOutcome)a.outcome={result:snapshot.outcome,source:'live',gameId:String(a.gameId),detectedAt:Date.now()};
    this.persist();
  }
  gap(){if(this.value.active&&!this.value.active.gap){this.value.active.gap=true;this.persist();}}
  finish(reason='ended'){
    const a=this.value.active;if(!a)return;
    require('./training').rememberTraining(this.value,a);
    for (const offer of a.offers || []) {
      const picked=offer.cards.find(c=>c.id===offer.picked);
      if (picked && !a.augments.some(c=>c.id===picked.id)) a.augments.push({id:picked.id,name:picked.name});
    }
    this.value.matches=[{...a,endedAt:Date.now(),reason},...this.value.matches.filter(m=>m.key!==a.key)].slice(0,10);
    this.value.active=null;this.persist();
  }
  feedback(key,input){
    const m=this.value.matches.find(m=>m.key===key);if(!m)throw Error('Nie znaleziono tego podsumowania.');
    if(!['auto','unknown','win','loss'].includes(input?.result)||!['none','helpful','mixed','unhelpful'].includes(input?.rating))throw Error('Nieprawidłowa ocena meczu.');
    m.feedback={result:input.result,rating:input.rating};this.persist();return clone(m);
  }
  list(){return clone(this.value.matches);}
  latest(){return this.value.matches[0] ? clone(this.value.matches[0]) : null;}
  setOutcome(key,outcome){
    const m=this.value.matches.find(m=>m.key===key);
    if(!m||m.outcome||String(m.gameId)!==outcome?.gameId||!['win','loss'].includes(outcome.result)||!['client','history'].includes(outcome.source))return false;
    m.outcome={result:outcome.result,source:outcome.source,gameId:outcome.gameId,detectedAt:Date.now()};this.persist();return true;
  }
}
module.exports={MatchReview};
