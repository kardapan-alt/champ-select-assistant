const isAram = mode => mode === 'aram' || mode === 'mayhem';
const classicQueues = new Set([400, 420, 430, 440, 480, 490, 700, 701, 870, 880, 890]);
const aramQueues = new Set([450, 720, 721, 860, 861]);
// IDs from the client's game-data/v1/queues.json. Require the pool as well:
// an event queue can change rules without changing its map.
const mayhemQueues = new Set([2400, 2401, 2403, 2405, 2410, 2450, 3240, 3270, 3280]);
function modeFromFlow(flow) {
  const queue = flow?.gameData?.queue;
  if (queue?.id == null || !/^\d+$/.test(String(queue.id))) return 'unsupported';
  const id = Number(queue.id);
  const mode = String(queue.gameMode || '').toUpperCase();
  const mapId = flow.map?.id ?? queue.mapId;
  const map = Number(mapId);
  if (mayhemQueues.has(id) && (mode === 'KIWI' || mode === 'KIWI_JADE') && (mapId == null || map === 12)) return 'mayhem';
  if ((aramQueues.has(id) || id === 0) && mode === 'ARAM' && map === 12) return 'aram';
  if ((classicQueues.has(id) || id === 0) && mode === 'CLASSIC' && map === 11) return 'classic';
  return 'unsupported';
}
module.exports = { isAram, modeFromFlow };
