// Only semantic events from the game card selection are persisted.
const LIMIT = 40;
const positions = ['lewa', 'środkowa', 'prawa'];
const reasons = {
  focus: 'Gra utraciła fokus przed potwierdzeniem.',
  heartbeat: 'Brak aktualnego sygnału z odczytu kliknięć.',
  cancel: 'Wybór został anulowany w oknie gry.',
  'source-ended': 'Zatrzymał się odczyt kliknięć z okna gry.',
  'capture-ended': 'Zatrzymał się odczyt obrazu.',
  reroll: 'Kolejny przerzut unieważnił poprzedni wybór.',
  stale: 'Ostatni odczyt kart był za stary w chwili naciśnięcia.',
  'old-input': 'Naciśnięcie pochodziło sprzed aktualnego odczytu kart.',
  'no-offer': 'W chwili naciśnięcia pozycja karty nie była już potwierdzona.',
  'unknown-title': 'Brakuje rozpoznanej nazwy klikniętej karty.',
  layout: 'Proporcje okna kliknięcia i obrazu były różne.',
  release: 'Przycisk zwolniono poza kartą lub po upływie czasu.',
  competing: 'Kolejne naciśnięcie przerwało potwierdzenie.',
  changed: 'Zmieniły się nazwy kart przed potwierdzeniem wyboru.',
  timeout: 'Upłynął czas na potwierdzenie zniknięcia kart.',
  'unreadable-frame': 'Brak aktualnej, czytelnej klatki gry.',
  'ocr-error': 'OCR nie zwrócił odczytu.',
  language: 'OCR nie miał dostępnego języka.',
  'capture-error': 'Odczyt obrazu zgłosił błąd.',
  overflow: 'Kolejka wejścia przepełniła się przed odczytem obrazu.',
  ignored: 'Augment wcześniej usunięto ręcznie w tym meczu.',
  duplicate: 'Augment był już zapisany.',
  validation: 'Wybór nie przeszedł sprawdzenia zestawu augmentów.',
  write: 'Zapis sesji meczu na dysku nie powiódł się.',
  history: 'Aktualizacja historii pełnej oferty nie powiodła się.',
};

class AugmentTrace {
  constructor(key, nameOf, previous) {
    this.key = key;
    this.nameOf = nameOf;
    this.entries = previous?.matchKey===key && Array.isArray(previous.clickTrace)
      ? previous.clickTrace.slice(-LIMIT).filter(e=>Number.isSafeInteger(e?.at) && Number.isSafeInteger(e.rotation) && typeof e.message==='string')
      : [];
    this.rotation = this.entries.at(-1)?.rotation || 0;
    this.lastOfferAt = 0;
    this.rerollAt = null;
    this.bestTitleCount = -1;
    this.ids = [];
    this.dirty = false;
  }
  record(event, at, {slot,id,ids,reason,focused,titleCount} = {}) {
    if (!Number.isSafeInteger(at)) return;
    const recent = this.lastOfferAt>0 && at-this.lastOfferAt<10000;
    if (event==='offer') {
      if (!Array.isArray(ids) || ids.length!==3) return;
      this.rerollAt = null;
      // A lost title in one frame isn't a new rotation.
      const changed = ids.some((value,i)=>value && value!==this.ids[i]);
      this.lastOfferAt = at;
      if (recent && !changed) return;
      this.ids = ids.slice();
    } else if (event==='reroll') {
      this.rotation++;
      this.rerollAt = at;
      this.bestTitleCount = -1;
      this.ids = [];
      this.lastOfferAt = at;
    } else if (event==='missing-layout') {
      if(this.rerollAt===null || at<=this.rerollAt || at-this.rerollAt>10000
        || !Number.isSafeInteger(titleCount) || titleCount<=this.bestTitleCount)return;
      this.bestTitleCount=titleCount;
    } else if ((event==='waiting' || event==='focus' || event==='dropout') && !recent) return;
    const card = Number.isInteger(slot) && slot>=1 && slot<=3 ? positions[slot-1]+' karta' : '';
    const name = id ? this.nameOf(id) : '';
    const target = [card,name].filter(Boolean).join(' · ');
    let message;
    switch (event) {
      case 'offer': message = 'Karty od lewej · '+ids.map(value=>value?this.nameOf(value):'brak nazwy').join(' / ')
        +(focused?' · gra aktywna':' · gra bez fokusu'); break;
      case 'reroll': message = 'Naciśnięto przerzut · '+target; break;
      case 'missing-layout': message = 'Sprawdzono pas tytułów po przerzucie. Rozpoznane nazwy · '+titleCount+'. Układ kart nadal niepotwierdzony.'; break;
      case 'waiting': message = 'Po przerzucie obraz nadal pokazuje poprzednią kartę.'; break;
      case 'focus': message = focused?'Okno gry odzyskało fokus.':reason==='heartbeat'?reasons.heartbeat:'Okno gry utraciło fokus.'; break;
      case 'down': message = 'Naciśnięcie · '+target; break;
      case 'up': message = 'Zwolnienie na tej samej karcie · '+target; break;
      case 'dropout': message = 'Utracono odczyt oferty przed wyborem.'; break;
      case 'no-press': message = 'Karty zniknęły. Brak naciśnięcia w rozpoznanej ofercie.'; break;
      case 'no-release': message = 'Karty zniknęły przed zarejestrowaniem zwolnienia przycisku · '+target; break;
      case 'absent': message = 'Pierwsza czytelna klatka bez kart · '+target; break;
      case 'visible-again': message = 'Karty wciąż są widoczne. Ponawiam potwierdzenie.'; break;
      case 'confirmed': message = 'Dwie klatki potwierdziły zniknięcie kart · '+target; break;
      case 'saved': message = 'Zapisano w sesji meczu · '+target; break;
      case 'history': message = 'Połączono wybór z historią trzech kart.'; break;
      case 'partial-history': message = 'Brak powiązanej pełnej trójki w historii.'; break;
      case 'discard': if (!reasons[reason]) return; message = [target,reasons[reason]].filter(Boolean).join(' · '); break;
      default: return;
    }
    const prev = this.entries.at(-1);
    if (['waiting','dropout','focus','visible-again'].includes(event) && prev?.event===event && prev.message===message) return;
    const entry = {at,event,rotation:this.rotation,message};
    if (card) entry.slot=slot;
    if (id) entry.id=id;
    if (reason && reasons[reason]) entry.reason=reason;
    if (event==='offer') entry.ids=ids.slice();
    if (event==='missing-layout') entry.titleCount=titleCount;
    this.entries.push(entry);
    if (this.entries.length>LIMIT) this.entries.shift();
    this.dirty=true;
    return true;
  }
}
module.exports={AugmentTrace};
