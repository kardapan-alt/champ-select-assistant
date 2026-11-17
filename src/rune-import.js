const { ownerKey } = require('./match-result');
const { runeSignature } = require('./choices');

// A page is managed only if this installation created it on the same account.
// A rename or a manual perk edit returns the page to the player.
async function writeRunePage(lcu, body, owners, saveOwner) {
  const me = await lcu.get('/lol-summoner/v1/current-summoner');
  const account = ownerKey(me?.puuid);
  if (!account) throw Error('Nie udało się potwierdzić konta do importu run.');
  const pages = await lcu.get('/lol-perks/v1/pages');
  if (!Array.isArray(pages)) throw Error('Klient nie udostępnił listy stron run. Spróbuj ponownie.');
  const known = owners[account];
  const own = known && pages.find(p => p.id === known.id && p.isDeletable && p.isEditable !== false
    && p.name === known.name && runeSignature(p) === known.signature);
  const needsActivation = own && !own.current;
  const url = '/lol-perks/v1/pages';
  const result = own
    ? await lcu.request('PUT', url + '/' + own.id, { ...body, id: own.id })
    : await lcu.request('POST', url, body);
  if (!result.ok) {
    const detail = String(result.data?.message || '');
    if (!own && /max.*pages|page.*limit|page.*full|pages.*(exceed|reach)|not enough.*page/i.test(detail)) {
      throw Error('Brak miejsca na nową stronę run. Runy możesz ustawić ręcznie z podglądu lub samodzielnie zwolnić slot w kliencie.');
    }
    throw Error(detail || `Klient odrzucił zapis strony run (${result.status}).`);
  }
  const id = own?.id ?? result.data?.id;
  if (!Number.isSafeInteger(id) || id <= 0) throw Error('Klient przyjął zapis, ale nie potwierdził ID strony. Sprawdź runy w kliencie.');
  saveOwner(account, { id, name: body.name, signature: runeSignature(body) });
  // PUT /pages/{id} updates contents. The currentpage endpoint selects it.
  if (needsActivation) {
    const activation = await lcu.request('PUT', '/lol-perks/v1/currentpage', id);
    if (!activation.ok) throw Error('Zapisano stronę asystenta. Wybierz ją w kliencie, aby jej użyć.');
  }
}

module.exports = { writeRunePage };
