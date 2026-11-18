const {spawn}=require('child_process');
const fs=require('fs'),path=require('path'),readline=require('readline');
class AugmentClicks {
  constructor(){this.child=null;this.focused=false;this.lastSeen=0;}
  start(handle,onInput){
    this.stop();if(!/^\d+$/.test(handle))throw Error('Nieprawidłowe okno gry.');
    const script=path.join(__dirname,'augment-clicks.ps1').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep);
    const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const child=spawn(exe,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(fs.readFileSync(script,'utf8'),'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','ignore']});
    this.child=child;
    readline.createInterface({input:child.stdout}).on('line',line=>{
      if(this.child!==child)return;
      let event;try{event=JSON.parse(line);}catch{return;}
      if(!Number.isSafeInteger(event.at)||Math.abs(Date.now()-event.at)>2000)return;
      this.lastSeen=Date.now();if(event.type==='focus')this.focused=event.focused===true;
      onInput(event);
    });
    const ended=()=>{if(this.child===child){this.stop();onInput({type:'cancel',sourceEnded:true,at:Date.now()});}};
    child.on('error',ended);child.on('exit',ended);child.stdin.on('error',ended);child.stdin.end(handle+'\n');
  }
  active(){return this.focused && Date.now()-this.lastSeen<1200;}
  stop(){const child=this.child;this.child=null;this.focused=false;this.lastSeen=0;child?.kill();}
}
module.exports={AugmentClicks};
