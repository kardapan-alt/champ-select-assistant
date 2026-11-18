const resources=require('../data/champion-resources.json').resources;
const resourceByAlias=new Map(Object.entries(resources).map(([alias,value])=>[alias.toLowerCase(),value]));
function canonicalAlias(alias='') {
  const base=alias.replace(/^Jade_/i, '');
  return /^wukong$/i.test(base)?'MonkeyKing':/^fiddlesticks$/i.test(base)?'FiddleSticks':base;
}
function usesMana(alias) {
  const resource=resourceByAlias.get(canonicalAlias(alias).toLowerCase());
  return resource ? resource==='Mana' : null;
}
const resourceFor=alias=>resourceByAlias.get(canonicalAlias(alias).toLowerCase()) || null;
module.exports={canonicalAlias,usesMana,resourceFor};
