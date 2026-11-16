// Only compare confirmed snapshots from the same match. A lost connection is
// not a sale, and the initial snapshot is not evidence of a new purchase.
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const item=i=>({id:i.id,name:i.name,owned:!!i.owned,pinned:!!i.pinned,why:i.why||''});
function readoutFor(build,context){
  const {status,liveAt,enemiesAt,enemies,inventory,session,screenAt}=context;
  const manual=session?.autoInventory===false;
  const screen=build.mayhem?.screen;
  return {
    inventory:{status:manual?'manual':status,at:liveAt||null,goldKnown:Number.isFinite(context.gold)&&context.gold>=0,
      unknown:(inventory?.items||[]).filter(i=>i.kind==='unknown').length},
    enemies:{status:Array.isArray(enemies)?'live':enemiesAt?'stale':'waiting',at:enemiesAt||null},
    ...(screen?{screen:{enabled:screen.enabled,mode:screen.config?.mode,status:screen.status,error:screen.error||null,at:screenAt||null,
      count:build.mayhem.hints.length,unknown:build.mayhem.unknown.length},
      headliner:{name:build.mayhem.headliner?.name||null,...build.mayhem.headlinerDetection}}:{})
  };
}
class BuildChanges {
  constructor(){this.key=null;this.previous=null;this.last=null;}
  observe(build,{key,status,enemies},now=Date.now()){
    if(this.key!==key){this.key=key;this.previous=null;this.last=null;}
    if(status!=='live'||!Array.isArray(enemies)||!Number.isFinite(build.shop?.gold)||build.shop.gold<0)return this.last;
    const next={items:build.items.map(item),boots:build.boots?.id?item(build.boots):null,
      target:build.shop?.target?item(build.shop.target):null,live:build.liveAdaptation||[],
      augments:build.mayhem?.selection?.augments||[],effects:build.mayhem?.selection?.effects||{},
      completed:build.mayhem?.selection?.completed||[]};
    const before=this.previous;this.previous=next;
    if(!before)return null;
    const signature=b=>[b.items.map(i=>[i.id,i.owned]),b.boots&&[b.boots.id,b.boots.owned],b.target?.id];
    if(same(signature(before),signature(next)))return this.last;
    const oldOrder=before.items.filter(i=>!i.owned),newOrder=next.items.filter(i=>!i.owned);
    const promoted=i=>{const old=oldOrder.findIndex(p=>p.id===i.id);return old<0||newOrder.findIndex(p=>p.id===i.id)<old;};
    const response=next.live.find(a=>newOrder.some(i=>i.id===a.item&&promoted(i))
      &&!same(a,before.live.find(p=>p.item===a.item)));
    const changed=response?newOrder.find(i=>i.id===response.item):newOrder.find(promoted);
    const oldOwned=[...before.items,before.boots].filter(i=>i?.owned).map(i=>i.id);
    const acquired=[...next.items,next.boots].filter(i=>i?.owned&&!oldOwned.includes(i.id));
    const causes=[];
    if(acquired.length)causes.push('Ekwipunek: odczytano '+acquired.map(i=>i.name).join(', ')+'.');
    if(response)causes.push(response.text+'.');
    if(!same([before.augments,before.effects,before.completed],[next.augments,next.effects,next.completed]))
      causes.push('Zmieniono zestaw lub efekty augmentów.');
    const pins=b=>[...b.items,b.boots].filter(i=>i?.pinned&&!i.owned).map(i=>i.id);
    const newOwned=[...next.items,next.boots].filter(i=>i?.owned).map(i=>i.id);
    if(same([...oldOwned].sort(),[...newOwned].sort())&&!same(pins(before),pins(next)))causes.push('Zmieniono przypięte przedmioty.');
    const title=response?(oldOrder.some(i=>i.id===changed.id)?'Wcześniej: ':'Do buildu: ')+changed.name
      :before.target?.id!==next.target?.id?(next.target?'Następny cel: '+next.target.name:'Plan zakupów zaktualizowany')
      :'Zmieniono dalszy plan zakupów';
    const focus=changed||next.target;
    this.last={at:now,title,causes:causes.slice(0,3),reason:focus?.why||'Plan uwzględnia bieżący ekwipunek i skład przeciwników.',
      before:before.items.map(i=>i.name),after:next.items.map(i=>i.name),
      beforeBoots:before.boots?.name||null,afterBoots:next.boots?.name||null,
      beforeTarget:before.target?.name||null,afterTarget:next.target?.name||null,evidence:response?.evidence||[]};
    return this.last;
  }
}
module.exports={readoutFor,BuildChanges};
