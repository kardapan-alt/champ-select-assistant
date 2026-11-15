const {execFile}=require('child_process');
const path=require('path');
const {validateSelection}=require('./mayhem');

// Dopasuj HWND do procesu gry, nie do nazwy okna launchera lub przeglądarki.
function gameWindowHandle() {
  return new Promise(resolve=>{
    const exe=path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    execFile(exe,['-NoProfile','-NonInteractive','-Command',"$augmentHandles=@(Get-Process -Name 'League of Legends' -ErrorAction SilentlyContinue | Where-Object {$_.Path -match '\\\\Game\\\\League of Legends\\.exe$' -and $_.MainWindowHandle -ne 0} | ForEach-Object {$_.MainWindowHandle.ToInt64().ToString()}); ConvertTo-Json -InputObject $augmentHandles -Compress"],
      {windowsHide:true,timeout:2500,maxBuffer:4096},(error,stdout)=>{
        if(error)return resolve(null);
        try{const handles=JSON.parse(stdout);resolve(Array.isArray(handles)&&handles.length===1?String(handles[0]):null);}catch{resolve(null);}
      });
  });
}

function sourceForHandle(sources,handle) {
  if(!handle || !/^\d+$/.test(handle))return null;
  const matches=sources.filter(s=>s.id?.split(':')[0]==='window' && s.id.split(':')[1]===handle);
  return matches.length===1?matches[0]:null;
}

function reconcile(session,stable,game,pool) {
  const previous=session.screenSlots || [], blocked=new Set(session.screenIgnored || []);
  const slots=stable.map((id,i)=>id || previous[i] || null);
  const manuallySelected=session.selection.augments.filter(id=>!previous.includes(id));
  const augments=[...new Set([...manuallySelected,...slots.filter(id=>id&&!blocked.has(id))])];
  const selection=validateSelection({...session.selection,augments,
    completed:session.selection.completed.filter(id=>augments.includes(id)),
    // Walidacja ręcznego ekwipunku nie może blokować nowego odczytu OCR.
    owned:session.autoInventory===false?session.selection.owned:[],
    ownedBoots:session.autoInventory===false?session.selection.ownedBoots:null},game,session.alias,pool);
  return {...session,selection,screenSlots:slots};
}

function manualSelection(session,selection,known=[]) {
  const current=(session.screenSlots || []).filter(Boolean), ignored=new Set(session.screenIgnored || []);
  for(const id of current)if(known.includes(id) && !selection.augments.includes(id))ignored.add(id);
  for(const id of selection.augments)ignored.delete(id);
  const newlyDetected=current.filter(id=>!known.includes(id)&&!ignored.has(id));
  return {selection:{...selection,augments:[...new Set([...selection.augments,...newlyDetected])]},screenIgnored:[...ignored]};
}

module.exports={gameWindowHandle,sourceForHandle,reconcile,manualSelection};
