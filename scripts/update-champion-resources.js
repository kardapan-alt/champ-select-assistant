// Reproducible resource metadata from Riot Data Dragon; no player data.
// node scripts/update-champion-resources.js path/to/champion.json
const fs=require('fs'),path=require('path');
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(input.version)||!input.data)throw Error('Expected Data Dragon champion.json');
const resources={};
for(const c of Object.values(input.data).sort((a,b)=>a.id.localeCompare(b.id))) {
  if(!c.id||typeof c.partype!=='string')throw Error('Missing champion resource');
  resources[c.id]=c.partype||'None';
}
fs.writeFileSync(path.join(__dirname,'../data/champion-resources.json'),JSON.stringify({patch:input.version,
  source:`https://ddragon.leagueoflegends.com/cdn/${input.version}/data/en_US/champion.json`,resources},null,2)+'\n');
console.log(`Saved ${Object.keys(resources).length} champion resources (${input.version}).`);
