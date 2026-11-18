// node scripts/import-base-builds.js <folder of reviewed OP.GG responses>
// Inputs: meta.json and classic-<alias>.json / aram-<alias>.json with {args,raw}.
// Raw public statistics remain outside the application; evidence retains requests,
// sample counts and hashes. Never imports player profiles or executes source text.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {interpretAnalysis,parsePayload}=require('../src/opgg');
const {itemAvailable,itemFitsResource,itemsCompatible,redundantSpellblade}=require('../src/itemrules');
const {baseBoots}=require('../src/rolequests');
const engine=require('../src/engine');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const file=path.join(__dirname,'../data/champions.json'),original=fs.readFileSync(file,'utf8'),data=JSON.parse(original);
const folder=process.argv[2],meta=JSON.parse(fs.readFileSync(path.join(folder,'meta.json'))).parsed;
const fetched=new Date().toISOString().slice(0,10),endpoint='https://mcp-api.op.gg/mcp';
const evidence={fetched,source:endpoint,tool:'lol_get_champion_analysis',champions:{}};
const roster=[...game.championsByAlias.values()].filter(c=>!c.alias.startsWith('Jade_')).sort((a,b)=>a.alias.localeCompare(b.alias));
for(const c of roster) {
  const current=engine.champInfo(c.alias,game,data),modes={};
  evidence.champions[c.alias]={};
  for(const mode of ['classic','aram']) {
    const input=JSON.parse(fs.readFileSync(path.join(folder,`${mode}-${c.alias}.json`),'utf8'));
    const raw=parsePayload(input.raw),a=interpretAnalysis(input.raw,game),patch=raw.data?.trends?.win?.version;
    if(!a?.items?.length || !patch)throw Error(`Incomplete source: ${c.alias} ${mode}`);
    const fit=id=>itemAvailable(id,game,mode,c.alias)&&itemFitsResource(id,game,c.alias);
    // Mejai is conditional on stacks; a default build cannot assume them.
    const pool=[...a.items,...(a.lateItems||[]).map(i=>i.id)].filter(id=>id!==3041&&fit(id));
    const items=[];
    for(const id of pool)if(items.length<3&&itemsCompatible(id,items)&&!redundantSpellblade(id,items))items.push(id);
    if(items.length<3)throw Error(`Insufficient compatible core: ${c.alias} ${mode}`);
    const lateItems=(a.lateItems||[]).filter(i=>i.id!==3041&&fit(i.id)&&!items.includes(i.id));
    const boots=baseBoots(a.boots);
    if(!itemAvailable(boots,game,mode,c.alias))throw Error(`Missing boots: ${c.alias} ${mode}`);
    modes[mode]={items,boots,lateItems,baseSource:{provider:'OP.GG',patch,fetched,mode,position:input.args.position,sample:raw.data.core_items.play}};
    evidence.champions[c.alias][mode]={request:input.args,patch,core:raw.data.core_items.ids,sample:raw.data.core_items.play,
      imported:items,sha256:crypto.createHash('sha256').update(typeof input.raw==='string'?input.raw:JSON.stringify(input.raw)).digest('hex')};
  }
  const {alias,unknown,aram,baseSource,items,boots,lateItems,...info}=current;
  data.champions[c.alias]={...info,roles:meta.roles[c.alias]||info.roles,...modes.classic,aram:{...aram,...modes.aram}};
}
data.version=Math.max(data.version,6);
// Keep the existing non-build sections readable and unchanged.
const at=original.indexOf('  "champions": {');
if(at<0)throw Error('Missing champions section');
const text=original.slice(0,at).replace(/"version":\s*\d+/, '"version": '+data.version)+'  "champions": {\n'
  +Object.entries(data.champions).map(([name,c])=>'    '+JSON.stringify(name)+': '+JSON.stringify(c)).join(',\n')+'\n  }\n}\n';
fs.writeFileSync(file,text);
fs.writeFileSync(path.join(__dirname,'../data/base-build-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(`Imported ${roster.length} champions × 2 modes; data version ${data.version}.`);
