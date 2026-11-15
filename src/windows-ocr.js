const {spawn}=require('child_process');
const path=require('path');
const readline=require('readline');
const fs=require('fs');
class WindowsOcr {
  constructor(){this.child=null;this.pending=null;}
  stop(){this.pending?.(null);this.pending=null;this.child?.kill();this.child=null;}
  async read(base64){
    if(this.pending)throw Error('Odczyt OCR jest zajęty.');
    if(typeof base64!=='string'||base64.length>1500000||!/^iVBORw0KGgo[A-Za-z0-9+/=\r\n]+$/.test(base64))throw Error('Nieprawidłowy obraz OCR.');
    if(!this.child){
      const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
      const script=path.join(__dirname,'windows-ocr.ps1').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep);
      const command=Buffer.from(fs.readFileSync(script,'utf8'),'utf16le').toString('base64');
      const child=spawn(exe,['-NoProfile','-NonInteractive','-EncodedCommand',command],{windowsHide:true,stdio:['pipe','pipe','ignore']});
      this.child=child;
      readline.createInterface({input:child.stdout}).on('line',line=>{
        if(this.child!==child)return;
        let result;try{result=JSON.parse(line);}catch{result=null;}this.pending?.(result);this.pending=null;
      });
      child.on('error',()=>{if(this.child===child)this.stop();});
      child.on('exit',()=>{if(this.child===child)this.stop();});
      child.stdin.on('error',()=>{if(this.child===child)this.stop();});
    }
    return new Promise(resolve=>{
      const timer=setTimeout(()=>this.stop(),7000);
      this.pending=result=>{clearTimeout(timer);resolve(result);};
      this.child.stdin.write(base64+'\n');
    });
  }
}
module.exports={WindowsOcr};
