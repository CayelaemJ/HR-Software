import {createConnection, type Socket} from 'node:net';

export type ScanResult = {status:'clean'|'infected'|'pending'|'scan_error';engine:string|null};
type ScanOptions={host?:string;port?:number;timeoutMs?:number};

// CLAMD's INSTREAM protocol is plaintext. Only trusted private-network
// ClamAV deployments may receive personal recruitment documents.
export function trustedScannerHost(host:string):boolean {
  const h=host.trim().toLowerCase();
  if(h==='localhost'||h==='127.0.0.1'||h==='::1')return true;
  if(/^[a-z0-9-]+\.(internal|svc|local)$/.test(h))return true;
  const p=h.split('.');
  if(p.length===4&&p.every(x=>/^\d{1,3}$/.test(x)&&Number(x)<=255)){
    const [a,b]=p.map(Number);
    return a===10 || (a===172&&b>=16&&b<=31) || (a===192&&b===168);
  }
  return false;
}
export async function scanWithClamAV(
  contents:Buffer,
  options:ScanOptions={
    host:process.env.CLAMAV_HOST,
    port:Number(process.env.CLAMAV_PORT||3310),
    timeoutMs:6000,
  }
):Promise<ScanResult>{
  if(!options.host)return {status:'pending',engine:null};
  if(!trustedScannerHost(options.host)||
     !Number.isSafeInteger(options.port)||
     (options.port??0)<1||(options.port??0)>65535){
    return {status:'scan_error',engine:null};
  }
  // Cap protocol framing; the HTTP route has a stricter 1 MiB limit.
  if(contents.length<1||contents.length>1_048_576){
    return {status:'scan_error',engine:null};
  }
  return new Promise(resolve=>{
    let done=false,received='';
    let socket:Socket|undefined;
    const finish=(status:ScanResult['status'])=>{
      if(done)return;
      done=true;
      socket?.destroy();
      resolve({status,engine:'clamav-instream'});
    };
    try{
      socket=createConnection({host:options.host,port:options.port!});
      socket.setTimeout(options.timeoutMs??6000);
      socket.once('timeout',()=>finish('scan_error'));
      socket.once('error',()=>finish('scan_error'));
      socket.on('data',(chunk:Buffer)=>{
        received+=chunk.toString('utf8');
        if(received.length>2048){finish('scan_error');return;}
        if(!received.includes('\0')&&!received.includes('\n'))return;
        if(/(?:^|[\n\r])stream: OK(?:\0|[\n\r]|$)/.test(received)){finish('clean');return;}
        if(/(?:^|[\n\r])stream: .{1,512} FOUND(?:\0|[\n\r]|$)/.test(received)){finish('infected');return;}
        finish('scan_error');
      });
      socket.once('close',()=>{if(!done)finish('scan_error');});
      socket.once('connect',()=>{
        if(done)return;
        const size=Buffer.alloc(4);
        size.writeUInt32BE(contents.length,0);
        socket!.write(Buffer.from('zINSTREAM\0','ascii'));
        socket!.write(size);
        socket!.write(contents);
        socket!.write(Buffer.alloc(4));
      });
    }catch{finish('scan_error');}
  });
}
