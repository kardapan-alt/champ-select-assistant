const {normalize}=require('./augment-vision');
const {texts}=require('../data/headliner-texts.json');

// A band name alone can be a skin or a chat message. Require its exact event
// description immediately below it, in the central game area, across frames.
function detectHeadliner(result){
  if(!result||!Number.isFinite(result.width)||!Number.isFinite(result.height)||result.width<640||result.height<400||!Array.isArray(result.layouts))return null;
  const hits=new Map();
  for(const layout of result.layouts){
    if(!Array.isArray(layout))continue;
    const lines=layout.flatMap(line=>{
      const words=line.words;if(!Array.isArray(words)||!words.length||words.some(w=>typeof w.text!=='string'||!['x','y','w','h'].every(k=>Number.isFinite(w[k]))||w.w<=0||w.h<=0))return [];
      const x=Math.min(...words.map(w=>w.x)),y=Math.min(...words.map(w=>w.y));
      const right=Math.max(...words.map(w=>w.x+w.w)),bottom=Math.max(...words.map(w=>w.y+w.h));
      return [{text:normalize([...words].sort((a,b)=>a.x-b.x).map(w=>w.text).join(' ')),x:x/result.width,y:y/result.height,
        w:(right-x)/result.width,h:(bottom-y)/result.height}];
    }).sort((a,b)=>a.y-b.y||a.x-b.x);
    for(const title of lines){
      const center=title.x+title.w/2;
      if(center<.25||center>.75||title.y<.04||title.y>.65||title.h<.012||title.h>.09)continue;
      for(const entry of texts){
        // Windows OCR reads the slash in K/DA as a capital I in some fonts.
        // This alias still requires the complete matching event description.
        if(title.text!==normalize(entry.title)&&!(entry.id==='kda'&&title.text==='kida'))continue;
        const below=lines.filter(l=>l.y>=title.y+title.h*.7&&l.y<title.y+title.h+.16&&l.h>=.009
          &&Math.abs(l.x+l.w/2-center)<.14&&l.x>=.12&&l.x+l.w<=.88).slice(0,5);
        if(normalize(below.map(l=>l.text).join(' ')).includes(normalize(entry.description)))hits.set(entry.id,{id:entry.id,x:center,y:title.y});
      }
    }
  }
  return hits.size===1?[...hits.values()][0]:null;
}
class HeadlinerConsensus{
  reset(){this.key=null;this.hit=null;this.count=0;this.at=0;this.first=0;}
  constructor(){this.reset();}
  observe(key,result,at){
    const hit=detectHeadliner(result);
    if(this.key!==key||!hit||!Number.isFinite(at)||at<=this.at||at-this.at>4000||hit.id!==this.hit?.id
      ||Math.abs(hit.x-(this.hit?.x||0))>.06||Math.abs(hit.y-(this.hit?.y||0))>.06){
      this.reset();this.key=key;if(!hit)return null;this.first=at;
    }
    this.hit=hit;this.at=at;this.count++;
    return this.count>=3&&at-this.first>=800?hit.id:null;
  }
}
const automaticHeadliner=session=>session?.autoHeadliner??!session?.selection?.headliner;
function applyHeadliner(session,id){
  if(!automaticHeadliner(session)||session.selection.headliner)return null;
  if(!texts.some(t=>t.id===id))return null;
  return {selection:{...session.selection,headliner:{id,ability:''}},autoHeadliner:true,headlinerSource:'screen'};
}
module.exports={detectHeadliner,HeadlinerConsensus,automaticHeadliner,applyHeadliner};
