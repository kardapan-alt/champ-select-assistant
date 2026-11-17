(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;else root.AugmentVision=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const normalize=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ł/g,'l').replace(/[^a-z0-9]/g,'');
  // Dokładna nazwa PL/EN, ewentualnie złamana na dwie linie. Wzmianka
  // o innym augmencie wewnątrz opisu nie jest wyborem tego augmentu.
  function recognizeText(readings,catalog,pool){
    const names=new Map();
    for(const a of catalog.filter(a=>a.pools.includes(pool)))for(const name of [a.name,a.english]){
      const key=normalize(name),ids=names.get(key)||new Set();ids.add(a.id);names.set(key,ids);
    }
    const found=new Set();
    for(const lines of readings){
      if(!Array.isArray(lines))continue;
      for(let i=0;i<lines.length;i++)for(const text of [lines[i],String(lines[i])+' '+String(lines[i+1]||'')]){
        for(const id of names.get(normalize(text)) || [])found.add(id);
      }
    }
    return found.size===1?{status:'match',id:[...found][0]}:found.size>1?{status:'ambiguous'}:{status:'unreadable'};
  }
  function validateConfig(value){
    if(!value || typeof value.enabled!=='boolean')throw Error('Nieprawidłowe ustawienia odczytu obrazu.');
    if(value.mode==='auto')return {enabled:value.enabled,mode:'auto'};
    const {width,height,regions}=value;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<640||height<400||width>10000||height>10000
      || !Array.isArray(regions)||regions.length!==1)throw Error('Wskaż obszar nazwy w dymku własnego augmentu.');
    const r=regions[0];
    if(!r || !['x','y','w','h'].every(k=>Number.isFinite(r[k])) || r.x<0 || r.y<0 || r.w<=0 || r.h<=0
      || r.x+r.w>1.001 || r.y+r.h>1.001 || r.w*width<70 || r.h*height<18 || r.w*width>900 || r.h*height>180
      || r.w*r.h>.12)throw Error('Zaznacz samą nazwę w dymku: obszar 70–900 px szerokości i 18–180 px wysokości.');
    return {enabled:value.enabled,width,height,regions:[{x:r.x,y:r.y,w:r.w,h:r.h}]};
  }
  const sameLayout=(config,width,height)=>config?.width===width&&config?.height===height;
  function offerCrop(width,height){
    const w=Math.min(1,height*16/9/width);
    return {x:(1-w)/2,y:0,w,h:1};
  }
  // Dawna kalibracja nie jest potrzebna do odczytu kart. Zachowaj wyłączenie.
  const migrateConfig=value=>validateConfig(value?.mode?value:{enabled:value?.enabled!==false,mode:'auto'});
  class Consensus {
    constructor(){this.reset();}
    reset(){this.key='';this.slots=[];}
    observe(key,observations){
      if(this.key!==key){this.reset();this.key=key;}
      return observations.map((o,i)=>{
        const previous=this.slots[i];
        if(o.status!=='match'){this.slots[i]=null;return null;}
        const count=previous?.id===o.id?previous.count+1:1;
        this.slots[i]={id:o.id,count};return count>=3?o.id:null;
      });
    }
  }
  return {normalize,recognizeText,validateConfig,migrateConfig,sameLayout,offerCrop,Consensus};
});
