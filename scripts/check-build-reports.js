const fs = require('node:fs');
const path = require('node:path');
const {buildGameData} = require('../src/gamedata');
const {readReport} = require('../src/build-report');
const {checkReplay} = require('../src/replay-checks');

const game = buildGameData(require('../data/catalog.json'));
const data = require('../data/champions.json');
let checked = 0, failures = 0;

function check(text, label, optional = false) {
  try {
    const report = readReport(text);
    if (optional && !report.expectation) return;
    if (!report.expectation) throw Error('Zgłoszenie nie zawiera warunku.');
    const result = checkReplay({report},game,data);
    if (!result.expectation?.passed)
      throw Error(report.scenario.alias+' · '+(result.error || result.expectation?.message || 'Brak wyniku.'));
    checked++;
    console.log('OK  '+label+' · '+result.name+' · '+result.expectation.message);
  } catch (error) {
    failures++;
    console.error('BŁĄD  '+label+' · '+error.message);
  }
}

const directory = path.join(__dirname,'../test/fixtures/reported-builds');
const fixtures = fs.readdirSync(directory).filter(name=>name.endsWith('.json')).sort();
if (!fixtures.length) throw Error('Brakuje zgłoszeń do testów przed wydaniem.');
for (const file of fixtures) check(fs.readFileSync(path.join(directory,file),'utf8'),file);
for (const arg of process.argv.slice(2)) {
  if (arg !== '--local') {
    check(fs.readFileSync(arg,'utf8'),path.basename(arg));
    continue;
  }
  if (!process.env.APPDATA) continue;
  const library = path.join(process.env.APPDATA,'champ-select-assistant','saved-build-reports.json');
  if (!fs.existsSync(library)) continue;
  const entries = JSON.parse(fs.readFileSync(library,'utf8'));
  for (const [i,entry] of entries.entries()) check(JSON.stringify(entry.report),'lokalne #'+(i+1),true);
}
console.log('Spełnione warunki: '+checked+'. Błędy: '+failures+'.');
if (failures) process.exitCode = 1;
