const isAram = mode => mode === 'aram' || mode === 'mayhem';
function modeFromFlow(flow) {
  const mode = String(flow?.gameData?.queue?.gameMode || '').toUpperCase();
  if (mode === 'KIWI' || mode === 'KIWI_JADE') return 'mayhem';
  return Number(flow?.map?.id) === 12 || mode === 'ARAM' ? 'aram' : 'classic';
}
module.exports = { isAram, modeFromFlow };
