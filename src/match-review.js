const clone=value=>JSON.parse(JSON.stringify(value));
const counts=items=>{const out={};for(const i of items||[])out[i.id]=(out[i.id]||0)+(i.count||1);return out;};
const item=i=>({id:i.id,name:i.name,icon:i.icon||'',count:i.count||1});
class MatchReview {
  constructor(value={},save=()=>{}){this.value=value&&Array.isArray(value.matches)?value:{matches:[],active:null};this.save=save;}
  persist(){this.save(clone(this.value));}
  observe({key,alias,name,mode,snapshot,build}){
    if(!key||snapshot?.status!=='live'||!snapshot.inventory||!Number.isFinite(snapshot.gameTime))return;
    if(this.value.matches.some(m=>m.key===key))return;
    if(this.value.active?.key!==key){
      this.finish('interrupted');
      this.value.active={key,alias,name,mode,startedAt:Date.now(),duration:0,events:[],items:[],augments:[],headliner:null,firstRead:snapshot.gameTime};
    }
    const a=this.value.active,time=Math.floor(snapshot.gameTime);
    if(time<a.duration)return; // Delayed snapshots cannot rewrite the timeline.
    const events=[],before=counts(a.items),after=counts(snapshot.inventory.items);
    const added=snapshot.inventory.items.filter((i,n,list)=>list.findIndex(x=>x.id===i.id)===n&&after[i.id]>(before[i.id]||0)).map(i=>({...item(i),count:after[i.id]-(before[i.id]||0)}));
    const removed=a.items.filter((i,n,list)=>list.findIndex(x=>x.id===i.id)===n&&before[i.id]>(after[i.id]||0)).map(i=>({...item(i),count:before[i.id]-(after[i.id]||0)}));
    if(!a.events.length||added.length||removed.length)events.push({type:a.events.length?'inventory':'initial',time,added,removed});
    const augments=(build.mayhem?.hints||[]).map(h=>({id:h.id,name:h.name})),headliner=build.mayhem?.headliner||null;
    if(JSON.stringify(augments)!==JSON.stringify(a.augments)||JSON.stringify(headliner)!==JSON.stringify(a.headliner))events.push({type:'augments',time,augments,headliner});
    const target=build.shop?.target?{id:build.shop.target.id,name:build.shop.target.name,why:build.shop.target.why}:null;
    if(JSON.stringify(target)!==JSON.stringify(a.target||null))events.push({type:'plan',time,target});
    const dirty=events.length||time-a.duration>=15||a.gap;
    if(!dirty)return;
    if(a.gap){events.unshift({type:'gap',time});a.gap=false;}
    a.events.push(...events);if(a.events.length>200){a.events=a.events.slice(-200);a.trimmed=true;}
    Object.assign(a,{duration:time,items:snapshot.inventory.items.map(item),augments,headliner,target,
      build:build.items.map(item),synergies:build.mayhem?.synergies||[]});
    this.persist();
  }
  gap(){if(this.value.active&&!this.value.active.gap){this.value.active.gap=true;this.persist();}}
  finish(reason='ended'){
    const a=this.value.active;if(!a)return;
    this.value.matches=[{...a,endedAt:Date.now(),reason},...this.value.matches.filter(m=>m.key!==a.key)].slice(0,10);
    this.value.active=null;this.persist();
  }
  feedback(key,input){
    const m=this.value.matches.find(m=>m.key===key);if(!m)throw Error('Nie znaleziono tego podsumowania.');
    if(!['unknown','win','loss'].includes(input?.result)||!['none','helpful','mixed','unhelpful'].includes(input?.rating))throw Error('Nieprawidłowa ocena meczu.');
    m.feedback={result:input.result,rating:input.rating};this.persist();return clone(m);
  }
  list(){return clone(this.value.matches);}
}
module.exports={MatchReview};
