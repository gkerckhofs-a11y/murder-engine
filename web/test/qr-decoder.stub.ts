// Synthetic decoded frame for browser regression tests; never imported by production.
export class BrowserQRCodeReader {
  async decodeFromConstraints(_constraints:unknown,_video:unknown,callback:Function){
    const controls={stop(){}};
    setTimeout(()=>callback({getText:()=>(window as any).__testQr},null,controls),50);
    return controls;
  }
}
