// Opens a URL in a plain visible window (for driving the Waraq 1.0 dev build over DevTools).
const {app,BrowserWindow}=require('electron');
app.commandLine.appendSwitch('remote-debugging-port','9350');
app.whenReady().then(()=>{const w=new BrowserWindow({width:1366,height:820,show:true});w.loadURL(process.argv.find(a=>a.startsWith('http'))||'http://localhost:5188');});
