const {createHash} = require('node:crypto');
const {comparePlans,planOf,questSlotOf} = require('./plan-diff');
const draftlab = require('./draftlab');
const {checkExpectation} = require('./build-expectation');

// Keep a decision before purchases constrain the build, plus a later one with
// the player's actual augments, opponents and room for alternative purchases.
function rememberReplay(match,time,build,makeReport) {
  if (!makeReport) return;
  const first = !match.replays?.first;
  if (!first && build.items.filter(item => !item.owned).length < 2) return;
  let report;
  try { report = makeReport(); } catch { return; } // A partial snapshot must not interrupt recording the match.
  if (!report) return;
  const point = {time,report};
  if (first) match.replays = {first:point};
  else match.replays.decision = point;
}

function reportId(r) {
  // Preserve distinct saved recommendations even if they concern the same champion.
  const identity = [r.version,r.patch,r.scenario,r.observed.plan,r.observed.questSlot];
  if (r.expectation) identity.push(r.expectation);
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

class ReplayLibrary {
  constructor(entries,save) {
    this.entries = Array.isArray(entries) ? entries.filter(e=>typeof e?.id==='string' && e.report?.scenario?.alias && Array.isArray(e.report.observed?.plan)) : [];
    this.save = save;
  }
  add(report) {
    const id = reportId(report);
    if (!this.entries.some(e=>e.id===id)) {
      const entries = [...this.entries,{id,report}];
      this.save(entries); this.entries = entries;
    }
    return id;
  }
  remove(id) {
    const entries = this.entries.filter(e=>e.id!==id);
    this.save(entries); this.entries = entries;
  }
}

function replayEntries(matches,library) {
  const entries = new Map();
  const saved = new Set(library.entries.map(e=>e.id));
  const inHistory = new Set();
  const missing = [];
  for (const m of matches) {
    const points = [m.replays?.first,m.replays?.decision].filter(p=>p?.report?.scenario?.alias && Array.isArray(p.report.observed?.plan));
    if (!points.length) { missing.push({name:m.name,date:m.endedAt}); continue; }
    const seen = new Set();
    for (const p of points) {
      const caseId = reportId(p.report);
      if (seen.has(caseId)) continue;
      seen.add(caseId); inHistory.add(caseId);
      const id = createHash('sha256').update(JSON.stringify([m.key,m.endedAt,caseId])).digest('hex');
      entries.set(id,{id,caseId,report:p.report,time:p.time,date:m.endedAt,saved:saved.has(caseId)});
    }
  }
  for (const entry of library.entries) {
    if (!inHistory.has(entry.id)) entries.set(entry.id,{...entry,caseId:entry.id,saved:true});
  }
  return {entries,missing};
}

function checkReplay(entry,game,data) {
  const r = entry.report;
  const details = {id:entry.id,caseId:entry.caseId,name:r.scenario.alias,mode:r.scenario.mode,originalVersion:r.version,
    patch:r.patch,source:r.observed.source,time:entry.time,date:entry.date,saved:!!entry.saved};
  try {
    const {build} = draftlab.preview(r.scenario,game,data,{buildOnly:true});
    const before = r.observed.plan, after = planOf(build), oldQuest = r.observed.questSlot, newQuest = questSlotOf(build);
    const changes = comparePlans(before,after);
    const quest = oldQuest?.id !== newQuest?.id ? {before:oldQuest?.name,after:newQuest?.name} : null;
    // Keep the old and new reasons beside the slot that changed. In particular
    // an absent item has no new rule of its own; show the item that replaced it.
    return {...details,status:changes.length||quest?'changed':'same',before,after,changes,quest,
      expectation:checkExpectation(r.expectation,after,newQuest,game)};
  } catch (e) { return {...details,status:'unavailable',error:e.message}; }
}
module.exports = {rememberReplay,ReplayLibrary,replayEntries,checkReplay};
