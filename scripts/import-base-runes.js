// node scripts/import-base-runes.js <OP.GG rune responses> <Riot client champion definitions>
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {interpretAnalysis,parsePayload}=require('../src/opgg');
const {validateRunes}=require('../src/choices');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const file=path.join(__dirname,'../data/champions.json'),original=fs.readFileSync(file,'utf8'),data=JSON.parse(original);
const [folder,championFolder]=process.argv.slice(2),fetched=new Date().toISOString().slice(0,10);
const evidence={fetched,source:'https://mcp-api.op.gg/mcp',tool:'lol_get_champion_analysis',champions:{}};
const context={patch:'16.22',reviewed:fetched,source:'Riot client /lol-game-data/assets/v1/champions/{id}.json',
  note:'Tenacity targets: substantial stuns/roots/charms/fears/taunts/sleep in kit; excludes minion-only fear and stuns accompanying forced displacement. Not a complete CC catalogue.',champions:{}};
for(const [alias,c] of Object.entries(data.champions)){
  evidence.champions[alias]={};c.runesByRole={};
  for(const {mode,position} of [...c.roles.map(position=>({mode:'classic',position})),{mode:'aram',position:c.roles[0]}]){
    const input=JSON.parse(fs.readFileSync(path.join(folder,`${mode}-${alias}-${position}.json`),'utf8'));
    const raw=parsePayload(input.raw),page=interpretAnalysis(input.raw,game)?.runes;
    validateRunes(page&&{primaryStyleId:page.p,subStyleId:page.s,selectedPerkIds:[...page.perks,...page.shards]},game);
    const source={provider:'OP.GG',patch:raw.data.trends.win.version,fetched,mode,position,sample:raw.data.runes.play};
    if(!source.patch||!source.sample)throw Error(`Missing provenance ${alias} ${mode} ${position}`);
    const stored={...page,source};
    if(mode==='aram')c.aram.runes=stored;else c.runesByRole[position]=stored;
    evidence.champions[alias][mode==='aram'?'aram':position]={request:input.args,source,page,
      sha256:crypto.createHash('sha256').update(typeof input.raw==='string'?input.raw:JSON.stringify(input.raw)).digest('hex')};
  }
  c.runes=c.runesByRole[c.roles[0]];
  const bytes=fs.readFileSync(path.join(championFolder,alias+'.json')),kit=JSON.parse(bytes);
  const hits=[kit.passive,...kit.spells].filter(s=>/<status>(?:stun\w*|root\w*|charm\w*|fear\w*|taunt\w*|sleep\w*|polymorph\w*)<\/status>/i.test(s?.dynamicDescription||''));
  const extra={Braum:'Concussive Blows',Kennen:'Mark of the Storm',Zoe:'Sleepy Trouble Bubble'};
  const tenacityCC=!['Aatrox','Tristana','Vi'].includes(alias)&&(hits.length>0||!!extra[alias]);
  const poke=['Ashe','Brand','Caitlyn','Ezreal','Heimerdinger','Hwei','Jayce','Karma','KogMaw','Lux','Nidalee','Orianna','Seraphine','Teemo','Varus','Velkoz','Viktor','Xerath','Ziggs','Zilean','Zoe','Zyra'].includes(alias);
  context.champions[alias]={ranged:kit.tacticalInfo.attackType==='ranged',tenacityCC,poke,
    abilities:tenacityCC?[...new Set([...hits.map(s=>s.name),...(extra[alias]?[extra[alias]]:[])])]:[],sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
// Eyeball Collection was removed. Do not silently fall back to a ward rune.
for(const p of Object.values(data.runePresets))p.perks=p.perks.map(id=>id===8138?8140:id);
data.version=Math.max(data.version,7);
const prefix=original.slice(0,original.indexOf('  "champions": {')).replace(/"version":\s*\d+/,'"version": '+data.version).replaceAll('8138','8140');
fs.writeFileSync(file,prefix+'  "champions": {\n'+Object.entries(data.champions).map(([name,c])=>'    '+JSON.stringify(name)+': '+JSON.stringify(c)).join(',\n')+'\n  }\n}\n');
for(const [name,value] of [['base-rune-evidence.json',evidence],['rune-context.json',context]])fs.writeFileSync(path.join(__dirname,'../data',name),JSON.stringify(value,null,2)+'\n');
console.log(`Imported ${Object.values(evidence.champions).reduce((n,c)=>n+Object.keys(c).length,0)} rune pages for ${Object.keys(data.champions).length} champions; data version ${data.version}.`);
