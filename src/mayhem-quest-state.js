const catalog = require('../data/mayhem-augments.json').augments;
const byId = new Map(catalog.map(card => [card.id, card.api.replace(/^ARAM_/, '')]));

// Reward identities from the KIWI card descriptions and the map-12 item
// catalogue. Heartsteel stacks and takedown counts are absent from Live Client.
const quests = {
  Quest_WoogletsWitchcap: {reward:228002},
  Quest_VoidImmolation: {reward:223069},
  Quest_UltraHydra: {reward:226668},
  Quest_Sneakerhead: {reward:1111, condition:'Zadania wylosowanych butów · brak odczytu etapów'},
  Quest_SteelYourHeart: {condition:'Ładunki Heartsteel · brak odczytu licznika'},
  Quest_UrfsChampion: {condition:'Udziały w zabójstwach od wyboru karty · brak odczytu licznika'},
};
const questFor = id => quests[byId.get(id)];

function observedRewards(session, inventory) {
  const observed = new Set(session.questReceipts || []);
  return (session.selection?.augments||[]).filter(id => {
    const quest = questFor(id);
    return quest?.reward && (observed.has(id) || inventory?.items?.some(item => item.id === quest.reward));
  });
}

module.exports = {questFor, observedRewards};
