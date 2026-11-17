const assert=require('node:assert/strict'),test=require('node:test');
const {MatchReview}=require('../src/match-review');
const meta={key:'77:Ahri:classic',alias:'Ahri',name:'Ahri',mode:'classic',gameId:77,championId:103,owner:'account-1'};

test('dokładny czas zakładki przeżywa restart, a opisy pozostają na koncie gracza',()=>{
  let disk;
  const save=v=>{disk=structuredClone(v);};
  const review=new MatchReview({},save);
  assert.equal(review.bookmark(meta,522.75),true);
  assert.equal(review.bookmark({...meta,owner:'account-2'},535),false);
  assert.equal(review.bookmark(meta,522.9),false);
  assert.equal(review.bookmark(meta,517),false);
  const resumed=new MatchReview(disk,save);assert.ok(resumed.bookmark(meta,560));
  resumed.finish('ended');
  assert.deepEqual(resumed.bookmarks(meta.key,meta.owner).marks,[{time:522,text:''},{time:560,text:''}]);
  assert.equal(resumed.bookmark(meta,563),false);
  assert.deepEqual(resumed.bookmarks(meta.key,'account-2').marks,[]);
  assert.throws(()=>resumed.editBookmark(meta.key,'account-2',522,'cudzego konta'));
  assert.throws(()=>resumed.editBookmark(meta.key,meta.owner,522,'a'.repeat(501)));
  resumed.editBookmark(meta.key,meta.owner,522,'  Czy wrócić po fali?  ');
  assert.equal(new MatchReview(disk).bookmarks(meta.key,meta.owner).marks[0].text,'Czy wrócić po fali?');
  for (const exposed of [resumed.list(),resumed.latest(),resumed.feedback(meta.key,{rating:'none',result:'auto'})])
    assert.doesNotMatch(JSON.stringify(exposed),/Czy wrócić po fali/);
});

test('błąd dysku umożliwia ponowny zapis tej samej zakładki',()=>{
  const review=new MatchReview({},()=>{throw Error('brak miejsca');});
  assert.throws(()=>review.bookmark(meta,42));
  review.save=()=>{};
  assert.ok(review.bookmark(meta,42));
  assert.equal(review.bookmark({...meta,mode:'mayhem'},43),false);
  review.finish('ended');
  review.save=()=>{throw Error('brak miejsca');};
  assert.throws(()=>review.editBookmark(meta.key,meta.owner,42,'zmiana'));
  assert.equal(review.bookmarks(meta.key,meta.owner).marks[0].text,'');
});
