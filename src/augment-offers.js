const {normalize}=require('./augment-vision');
const inside=(p,r)=>p.x>r.x+.012 && p.x<r.x+r.w-.012 && p.y>r.y+.012 && p.y<r.y+r.h-.012;
const signature=cards=>cards.map(c=>c.id).join(':');

function titleCandidates(result,catalog,pool){
  const names=new Map();
  for(const a of catalog.filter(a=>a.pools.includes(pool)))for(const name of [a.name,a.english]){
    const key=normalize(name),ids=names.get(key)||new Set();ids.add(a.id);names.set(key,ids);
  }
  const found=[];
  function match(words){
    const ids=names.get(normalize(words.map(w=>w.text).join(' ')));
    if(ids?.size!==1)return;
    const x=Math.min(...words.map(w=>w.x)),y=Math.min(...words.map(w=>w.y));
    const right=Math.max(...words.map(w=>w.x+w.w)),bottom=Math.max(...words.map(w=>w.y+w.h));
    const crop=result.crop||{x:0,y:0,w:1,h:1};
    const r={id:[...ids][0],x:crop.x+x/result.width*crop.w,y:crop.y+y/result.height*crop.h,w:(right-x)/result.width*crop.w,h:(bottom-y)/result.height*crop.h};
    if(r.y<.12||r.y+r.h>.8||r.w<.025||r.w>.30||r.h<.009||r.h>.10)return;
    if(!found.some(p=>p.id===r.id&&Math.abs(p.x-r.x)<.015&&Math.abs(p.y-r.y)<.015))found.push(r);
  }
  for(const layout of result.layouts||[]){
    const lines=layout.filter(l=>Array.isArray(l.words));
    for(const line of lines){
      const words=line.words.filter(w=>['x','y','w','h'].every(k=>Number.isFinite(w[k]))).sort((a,b)=>a.x-b.x);
      for(let start=0;start<words.length;start++){
        let part=[];
        for(let end=start;end<Math.min(words.length,start+9);end++){
          if(end>start&&words[end].x-(words[end-1].x+words[end-1].w)>Math.max(words[end].h,words[end-1].h)*2)break;
          part.push(words[end]);match(part);
          // A title may wrap. Join only nearby words below this same column.
          for(const below of lines){
            const next=below.words.filter(w=>w.y>=words[start].y+words[start].h*.7&&w.y<words[start].y+words[start].h*2.8
              &&Math.abs(w.x+w.w/2-(part[0].x+part.at(-1).x+part.at(-1).w)/2)<result.width*.10).sort((a,b)=>a.x-b.x);
            if(next.length&&next.length<7)match([...part,...next]);
          }
        }
      }
    }
  }
  return found.slice(0,60);
}

function readGrid(value){
  if(!value||!Number.isInteger(value.width)||!Number.isInteger(value.height)||value.width<160||value.width>640||value.height<100||value.height>640
    ||typeof value.pixels!=='string'||value.pixels.length>550000)return null;
  const pixels=Buffer.from(value.pixels,'base64');if(pixels.length!==value.width*value.height)return null;
  let sum=0,square=0,bright=0;
  for(const v of pixels){sum+=v;square+=v*v;if(v>24)bright++;}
  const mean=sum/pixels.length;
  return {...value,pixels,valid:bright/pixels.length>.08 && square/pixels.length-mean*mean>90};
}
function edge(grid,x,y,vertical){
  const {width:w,height:h,pixels:p}=grid;
  x=Math.max(2,Math.min(w-3,Math.round(x)));y=Math.max(2,Math.min(h-3,Math.round(y)));
  // The rim can be narrower than one reduced pixel; compare center and both sides.
  const values=vertical?[p[y*w+x-2],p[y*w+x],p[y*w+x+2]]:[p[(y-2)*w+x],p[y*w+x],p[(y+2)*w+x]];
  return Math.max(...values)-Math.min(...values)>20?1:0;
}
function lineScore(grid,coordinate,from,to,vertical){
  let score=0,count=0;
  for(let p=Math.ceil(from);p<=Math.floor(to);p++){score+=vertical?edge(grid,coordinate,p,true):edge(grid,p,coordinate,false);count++;}
  return count?score/count:0;
}
function strongest(grid,from,to,a,b,vertical){
  let best=null;
  for(let p=Math.ceil(from);p<=Math.floor(to);p++){
    const score=lineScore(grid,p,a,b,vertical);
    if(!best||score>best.score)best={p,score};
  }
  return best?.score>=.55?best.p:null;
}
function cardBounds(grid,title,gap){
  const W=grid.width,H=grid.height,cx=(title.x+title.w/2)*W,cy=(title.y+title.h/2)*H,g=gap*W;
  const left=strongest(grid,cx-g*.49,cx-g*.32,cy-g*.25,cy+g*.25,true);
  const right=strongest(grid,cx+g*.32,cx+g*.49,cy-g*.25,cy+g*.25,true);
  if(left===null||right===null||left<0||right>=W)return null;
  const top=strongest(grid,Math.max(H*.08,cy-g*1.35),cy-g*.22,left+g*.08,right-g*.08,false);
  const bottom=strongest(grid,cy+g*.30,Math.min(H*.90,cy+g*1.7),left+g*.08,right-g*.08,false);
  if(top===null||bottom===null||bottom-top<g*.85||bottom-top>g*2.9)return null;
  // Both long sides must belong to the same card, not a nearby button or shop row.
  if(lineScore(grid,left,top+g*.15,bottom-g*.15,true)<.65 || lineScore(grid,right,top+g*.15,bottom-g*.15,true)<.65)return null;
  const r={x:left/W,y:top/H,w:(right-left)/W,h:(bottom-top)/H};
  if(title.x<r.x||title.x+title.w>r.x+r.w)return null;
  return r;
}
function detectOffer(result,grid,catalog,pool){
  if(!grid?.valid||!result?.width||!result?.height)return {cards:null,candidates:[]};
  const candidates=titleCandidates(result,catalog,pool).sort((a,b)=>a.x-b.x),matches=[];
  for(let i=0;i<candidates.length-2;i++)for(let j=i+1;j<candidates.length-1;j++)for(let k=j+1;k<candidates.length;k++){
    const t=[candidates[i],candidates[j],candidates[k]],centers=t.map(r=>r.x+r.w/2),g1=centers[1]-centers[0],g2=centers[2]-centers[1];
    if(new Set(t.map(r=>r.id)).size!==3||g1<.10||g1>.34||Math.abs(g1-g2)>g1*.16||Math.abs((centers[0]+centers[2])/2-.5)>.12
      ||Math.max(...t.map(r=>r.y))-Math.min(...t.map(r=>r.y))>.045)continue;
    const cards=t.map(r=>({id:r.id,rect:cardBounds(grid,r,(g1+g2)/2)}));
    if(cards.some(c=>!c.rect)||Math.max(...cards.map(c=>c.rect.y))-Math.min(...cards.map(c=>c.rect.y))>.035
      ||Math.max(...cards.map(c=>c.rect.h))-Math.min(...cards.map(c=>c.rect.h))>.06)continue;
    if(!matches.some(m=>signature(m)===signature(cards)))matches.push(cards);
  }
  return {cards:matches.length===1?matches[0]:null,candidates};
}
function oldCardsVisible(grid,cards){
  return cards.some(({rect:r})=>{
    const top=(r.y+r.h*.1)*grid.height,bottom=(r.y+r.h*.9)*grid.height;
    const sides=[r.x,r.x+r.w].map(x=>lineScore(grid,x*grid.width,top,bottom,true));
    const rim=[r.y,r.y+r.h].some(y=>lineScore(grid,y*grid.height,(r.x+r.w*.1)*grid.width,(r.x+r.w*.9)*grid.width,false)>.55);
    // Pojedyncza krawędź mapy lub HUD nie oznacza, że karta nadal jest otwarta.
    return sides.every(score=>score>.55)&&rim;
  });
}

class OfferTracker {
  constructor(){this.reset();}
  reset(){this.offer=null;this.streak=0;this.at=0;this.pending=null;this.down=null;this.events=[];this.cancelledAt=0;this.freshness=1800;}
  input(event){
    if(event.type==='cancel'||event.type==='focus'&&!event.focused){
      this.offer=null;this.streak=0;this.pending=null;this.down=null;this.events=[];this.cancelledAt=event.at;return;
    }
    if(['down','up'].includes(event.type)){
      this.events.push(event);if(this.events.length>40){this.reset();this.cancelledAt=event.at;}
    }
  }
  click(e,aspect){
    // Some game buttons dismiss on mouse-down, before the next frame / mouse-up.
    // Retain that exact card until release, while still rejecting a drag outside it.
    if(e.type==='up'&&this.down){
      const down=this.down;this.down=null;
      if(e.at>=down.at&&e.at-down.at<1200&&Number.isFinite(e.x)&&Number.isFinite(e.y)&&e.width>0&&e.height>0
        &&Math.abs(e.width/e.height-aspect)<=.025&&inside({x:e.x/e.width,y:e.y/e.height},down.rect))
        this.pending={id:down.id,at:e.at,absent:0,cards:down.cards};
      return;
    }
    if(!this.offer||this.streak<2||e.at-this.at>this.freshness||e.at<this.at||!Number.isFinite(e.width)||!Number.isFinite(e.height)
      ||Math.abs(e.width/e.height-aspect)>.025||!Number.isFinite(e.x)||!Number.isFinite(e.y)){this.down=null;this.pending=null;return;}
    const p={x:e.x/e.width,y:e.y/e.height},card=this.offer.find(c=>inside(p,c.rect));
    if(e.type==='down'){this.pending=null;this.down=card?{id:card.id,rect:card.rect,cards:this.offer,at:e.at}:null;if(!card){this.offer=null;this.streak=0;}return;}
    this.down=null;
  }
  observe({at,aspect,cards,candidates=[],grid,active,readMs=0}){
    // Dwie pełne klatki nadal są wymagane. Wolniejszy OCR nie może jednak
    // zerować serii tylko dlatego, że przetworzenie klatki trwało >1,8 s.
    this.freshness=Math.min(5000,Math.max(1800,Number.isFinite(readMs)?readMs+1000:1800));
    if(!active||!grid?.valid||at<=this.cancelledAt||at<=this.at){this.pending=null;this.offer=null;this.streak=0;return null;}
    const events=this.events.filter(e=>e.at<=at);this.events=this.events.filter(e=>e.at>at);
    for(const e of events)this.click(e,aspect);
    if(this.pending&&at-this.pending.at>Math.max(4000,this.freshness*2+1000))this.pending=null;
    if(cards){
      if(this.pending&&signature(cards)!==signature(this.pending.cards))this.pending=null;
      if(this.pending)this.pending.absent=0;
      if(this.down&&signature(cards)!==signature(this.down.cards))this.down=null;
      this.streak=this.offer&&signature(cards)===signature(this.offer)&&at-this.at<this.freshness?this.streak+1:1;
      this.offer=cards;this.at=at;return null;
    }
    if(this.pending){
      if(candidates.length||oldCardsVisible(grid,this.pending.cards)){this.pending.absent=0;}
      else if(++this.pending.absent>=2 && at-this.pending.at>=250){const id=this.pending.id;this.pending=null;this.offer=null;this.streak=0;this.at=at;return id;}
    }
    this.at=at;this.offer=null;this.streak=0;return null;
  }
}
module.exports={titleCandidates,readGrid,detectOffer,cardBounds,oldCardsVisible,OfferTracker};
