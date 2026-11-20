const { gameId } = require('./match-result');
const { normPosition, knownRole } = require('./players');

const roles = ['top', 'jungle', 'middle', 'bottom', 'utility'];
const metrics = ['cs10', 'vision10'];

function draftId(flow, session) {
  const flowId = gameId(flow?.gameData?.gameId);
  const selectId = gameId(session?.gameId);
  return flowId && selectId && flowId !== selectId ? null : flowId || selectId;
}

function draftTraining(queueId, id, owner, position, choice) {
  if (Number(queueId) !== 420) return null;
  const role = normPosition(position);
  const ready = !!gameId(id) && !!owner && roles.includes(role);
  const selected = ready && choice?.gameId === String(id) && choice.owner === owner ? choice : null;
  return { gameId:gameId(id), role, ready, metric:selected?.metric || null, target:selected?.target ?? null };
}

function setTrainingGoal(review, context, input) {
  const {id, owner, position, queueId} = context;
  const draft = draftTraining(queueId, id, owner, position);
  if (!draft?.ready || input?.gameId !== draft.gameId || input?.role !== draft.role)
    throw Error('Draft lub rola uległy zmianie. Wybierz cel ponownie.');
  if (input.metric !== null && (!metrics.includes(input.metric) || !Number.isInteger(input.target) || input.target < 1 || input.target > 999))
    throw Error('Wybierz rodzaj celu i wpisz liczbę od 1 do 999.');
  const goal = input.metric === null ? null : { gameId:draft.gameId, owner, role:draft.role, metric:input.metric, target:input.target };
  review.value.trainingChoice = goal;
  review.persist();
  return draftTraining(queueId, id, owner, position, goal);
}

// Only the local player's own scoreboard entry is passed to this function.
// Keep an unavailable score distinct from an observed zero.
function trainingScores(scores) {
  const cs = scores?.creepScore, vision = scores?.wardScore;
  return {
    cs10:Number.isSafeInteger(cs) && cs >= 0 ? cs : null,
    vision10:Number.isFinite(vision) && vision >= 0 ? vision : null,
  };
}

function previousMedian(matches, owner, role, metric) {
  const values = matches.filter(m => m.owner === owner && m.role === role)
    .map(m => m.scores[metric]).filter(Number.isFinite).sort((a, b) => a - b);
  const n = values.length;
  return {count:n, median:n ? (values[Math.floor((n-1)/2)] + values[Math.floor(n/2)]) / 2 : null};
}

function rememberTraining(value, match) {
  const t = match.training;
  if (!t || !Object.keys(t.samples).length) return;
  const scores = Object.fromEntries(Object.entries(t.samples).map(([metric,sample])=>[metric,sample.value]));
  const history = value.trainingHistory || [];
  const other = entry => entry.owner !== match.owner || entry.role !== t.role;
  const recent = history.filter(e=>!other(e) && e.gameId !== String(match.gameId)).slice(0,19);
  value.trainingHistory = [{gameId:String(match.gameId),owner:match.owner,role:t.role,scores},...recent,...history.filter(other)];
}

function recordTraining(review, meta, queueId, position, snapshot) {
  if (meta.mode !== 'classic' || Number(queueId) !== 420 || !gameId(meta.gameId) || !meta.owner || !meta.championId) return;
  const pending = review.value.trainingChoice;
  const goal = pending?.owner === meta.owner && pending.gameId === String(meta.gameId) ? pending : null;
  const role = knownRole(position) || goal?.role;
  if (!roles.includes(role)) return;
  const t = snapshot?.gameTime;
  // Take the first valid reading for each metric, no interpolation across gaps.
  const inWindow = snapshot?.status === 'live' && Number.isFinite(t) && t >= 600 && t <= 605;
  if (!goal && !inWindow) return;
  const match = review.ensureActive(meta);
  if (!match || match.owner !== meta.owner) return;
  let dirty = false;
  if (!match.training) {
    match.training = {role, samples:{}, goal:goal ? {metric:goal.metric,target:goal.target} : null,
      baseline:goal ? previousMedian(review.value.trainingHistory || [], meta.owner, role, goal.metric) : null};
    dirty = true;
  }
  const training = match.training;
  if (training.role !== role) {
    training.role = role;
    if (training.goal) training.baseline = previousMedian(review.value.trainingHistory || [], meta.owner, role, training.goal.metric);
    dirty = true;
  }
  if (inWindow) {
    for (const metric of metrics) {
      const value = snapshot.trainingScores?.[metric];
      if (!training.samples[metric] && Number.isFinite(value) && value >= 0) {
        training.samples[metric] = {at:t, value};
        dirty = true;
      }
    }
  }
  if (dirty) review.persist();
}

module.exports = { draftId, draftTraining, setTrainingGoal, trainingScores, recordTraining, rememberTraining, knownRole };
