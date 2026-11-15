const {createHash}=require('crypto');
const ownerKey=puuid=>typeof puuid==='string'&&puuid?createHash('sha256').update(puuid).digest('hex'):null;
const gameId=value=>/^[1-9]\d*$/.test(String(value))&&Number.isSafeInteger(Number(value))?String(value):null;
const winValue=value=>[true,1,'1','Win'].includes(value)?'win':[false,0,'0','Lose','Fail'].includes(value)?'loss':null;
const samePlayer=(p,me)=>!!p&&(p.puuid? p.puuid===me.puuid : gameId(p.summonerId)&&String(p.summonerId)===String(me.summonerId));
function fromEndStats(data,record,me){
  if(!record?.owner||ownerKey(me?.puuid)!==record.owner||gameId(data?.gameId)!==gameId(record.gameId)||!gameId(record.gameId))return null;
  const players=(Array.isArray(data.teams)?data.teams:[]).flatMap(t=>(Array.isArray(t.players)?t.players:[]).filter(p=>samePlayer(p,me)).map(p=>({p,t})));
  if(players.length>1)return null;
  const p=samePlayer(data.localPlayer,me)?data.localPlayer:players[0]?.p;
  if(!p||Number(p.championId)!==record.championId)return null;
  const results=[winValue(p.stats?.WIN)];
  if(players[0]&&typeof players[0].t.isWinningTeam==='boolean')results.push(winValue(players[0].t.isWinningTeam));
  const known=[...new Set(results.filter(Boolean))];
  return known.length===1?{result:known[0],source:'client',gameId:gameId(record.gameId)}:null;
}
function fromHistory(data,record,me){
  if(!record?.owner||ownerKey(me?.puuid)!==record.owner||gameId(data?.gameId)!==gameId(record.gameId)||!gameId(record.gameId))return null;
  const identities=(Array.isArray(data.participantIdentities)?data.participantIdentities:[]).filter(p=>samePlayer(p.player,me));
  if(identities.length!==1)return null;
  const matches=(Array.isArray(data.participants)?data.participants:[]).filter(p=>p.participantId===identities[0].participantId);
  if(matches.length!==1||Number(matches[0].championId)!==record.championId)return null;
  const result=typeof matches[0].stats?.win==='boolean'?winValue(matches[0].stats.win):null;
  return result?{result,source:'history',gameId:gameId(record.gameId)}:null;
}
function fromLiveEvents(events,time){
  const end=Array.isArray(events?.Events)?events.Events.filter(e=>e?.EventName==='GameEnd'):null;
  if(!Array.isArray(end)||end.length!==1||!Number.isFinite(end[0].EventTime)||end[0].EventTime<0||end[0].EventTime>time+2)return null;
  return end[0].Result==='Win'?'win':end[0].Result==='Lose'?'loss':null;
}
class ResultResolver{
  constructor(){this.attempts=new Map();this.busy=false;}
  async poll(review,client,now=Date.now()){
    if(this.busy)return false;
    const record=review.list().find(m=>m.owner&&gameId(m.gameId)&&!m.outcome&&(this.attempts.get(m.key)?.after||0)<=now);
    if(!record)return false;
    const tries=(this.attempts.get(record.key)?.tries||0)+1;
    this.attempts.set(record.key,{tries,after:now+Math.min(60000,5000*2**Math.min(tries-1,4))});
    this.busy=true;
    try{
      const me=await client.get('/lol-summoner/v1/current-summoner');
      if(ownerKey(me?.puuid)!==record.owner)return false;
      const end=await client.get('/lol-end-of-game/v1/eog-stats-block').catch(()=>null);
      let outcome=fromEndStats(end,record,me);
      if(!outcome){const history=await client.get('/lol-match-history/v1/games/'+gameId(record.gameId)).catch(()=>null);outcome=fromHistory(history,record,me);}
      return outcome?review.setOutcome(record.key,outcome):false;
    }finally{this.busy=false;}
  }
}
module.exports={ownerKey,gameId,fromEndStats,fromHistory,fromLiveEvents,ResultResolver};
