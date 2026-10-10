/* PULSO local, restricted text-PDF reader. No renderer, scripts, network or OCR.
 * Supported: classic PDF objects; openhtmltopdf layout; Identity-H ToUnicode;
 * unencrypted Flate streams. Unsupported structures fail closed.
 */
(function(root){'use strict';
const ERR='Este PDF no tiene la estructura de texto compatible. Usa el PDF original de N26 en espa\u00f1ol, sin imprimirlo ni escanearlo, o importa un CSV.';
function check(ok,msg=ERR){if(!ok)throw Error(msg);}
function binary(u){let s='';for(let i=0;i<u.length;i+=16384)s+=String.fromCharCode(...u.subarray(i,i+16384));return s;}
function bytes(s){return Uint8Array.from(s,c=>c.charCodeAt(0)&255);}
class Reader{
 constructor(s,pos=0){this.s=s;this.i=pos;this.ops=0;}
 space(){while(this.i<this.s.length){const c=this.s[this.i];if(/[\x00\t\n\f\r ]/.test(c)){this.i++;continue;}if(c==='%'){while(this.i<this.s.length&&!/[\r\n]/.test(this.s[this.i]))this.i++;continue;}break;}}
 word(){const p=this.i;while(this.i<this.s.length&&!/[\x00\t\n\f\r ()<>\[\]{}/%]/.test(this.s[this.i]))this.i++;check(this.i>p);return this.s.slice(p,this.i);}
 read(depth=0){check(depth<32&&++this.ops<2000000,'PDF demasiado complejo.');this.space();if(this.i>=this.s.length)return undefined;const c=this.s[this.i++];
  if(c==='<'){
   if(this.s[this.i]==='<'){this.i++;const d=Object.create(null);while(true){this.space();if(this.s.slice(this.i,this.i+2)==='>>'){this.i+=2;return d;}const k=this.read(depth+1);check(k&&typeof k.name==='string');d[k.name]=this.read(depth+1);}}
   let h='';while(this.i<this.s.length&&this.s[this.i]!=='>')h+=this.s[this.i++];check(this.s[this.i++]==='>');h=h.replace(/\s/g,'');check(/^[\da-f]*$/i.test(h));if(h.length%2)h+='0';return {str:Uint8Array.from(h.match(/../g)||[],v=>parseInt(v,16))};
  }
  if(c==='('){const out=[];let n=1;while(this.i<this.s.length&&n){let ch=this.s[this.i++];if(ch==='\\'){ch=this.s[this.i++];if(/[0-7]/.test(ch)){let v=ch;for(let j=0;j<2&&/[0-7]/.test(this.s[this.i]||'x');j++)v+=this.s[this.i++];out.push(parseInt(v,8)&255);}else if(ch==='\r'||ch==='\n'){if(ch==='\r'&&this.s[this.i]==='\n')this.i++;}else out.push(({n:10,r:13,t:9,b:8,f:12})[ch]??ch.charCodeAt(0));}else if(ch==='('){n++;out.push(40);}else if(ch===')'){if(--n)out.push(41);}else out.push(ch.charCodeAt(0));}check(n===0);return {str:new Uint8Array(out)};}
  if(c==='['){const a=[];while(true){this.space();check(this.i<this.s.length);if(this.s[this.i]===']'){this.i++;return a;}a.push(this.read(depth+1));}}
  if(c==='/'){return {name:this.word().replace(/#([\da-f]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)))};}
  this.i--;const w=this.word();if(/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(w)){const n=Number(w),pos=this.i;if(Number.isInteger(n)&&n>=0){this.space();const m=/^(\d+)\s+R(?=[\s\]\/>]|$)/.exec(this.s.slice(this.i));if(m){this.i+=m[0].length;return {ref:[n,Number(m[1])]};}this.i=pos;}return n;}
  if(w==='true')return true;if(w==='false')return false;if(w==='null')return null;return {op:w};
 }
}
async function inflate(u){check(typeof DecompressionStream!=='undefined','Tu navegador no permite leer la compresi\u00f3n de este PDF. Actualiza iOS/Safari o utiliza CSV.');const reader=new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();let size=0,parts=[];try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>8*1024*1024){await reader.cancel();throw Error('Un bloque del PDF supera el l\u00edmite seguro.');}parts.push(r.value);}}finally{reader.releaseLock();}const all=new Uint8Array(size);let pos=0;for(const a of parts){all.set(a,pos);pos+=a.length;}return all;}
function unicode(hex){check(hex.length%4===0);let s='';for(let i=0;i<hex.length;i+=4)s+=String.fromCharCode(parseInt(hex.slice(i,i+4),16));return s;}
function cmap(raw){const map=new Map();let maxWidth=0;
 for(const part of raw.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))for(const m of part[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)){map.set(m[1].toUpperCase(),unicode(m[2]));maxWidth=Math.max(maxWidth,m[1].length);}
 for(const part of raw.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)){
  for(const m of part[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*(<([\da-f]+)>|\[([^\]]*)\])/gi)){
   const lo=parseInt(m[1],16),hi=parseInt(m[2],16),width=m[1].length;check(hi>=lo&&hi-lo<65536);maxWidth=Math.max(maxWidth,width);
   if(m[4]){check(m[4].length===4);const start=parseInt(m[4],16);for(let k=lo;k<=hi;k++)map.set(k.toString(16).toUpperCase().padStart(width,'0'),String.fromCharCode(start+k-lo));}
   else{const dest=Array.from(m[5].matchAll(/<([\da-f]+)>/gi));check(dest.length===hi-lo+1);dest.forEach((v,i)=>map.set((lo+i).toString(16).toUpperCase().padStart(width,'0'),unicode(v[1])));}
  }
 }
 check(map.size>0&&maxWidth===4);return u=>{check(u.length%2===0);let out='';for(let i=0;i<u.length;i+=2){const k=((u[i]<<8)+u[i+1]).toString(16).toUpperCase().padStart(4,'0');check(map.has(k),'El PDF contiene caracteres no reconocidos. No se ha importado nada.');out+=map.get(k);}return out;};
}
function mult(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
async function readPdf(buffer,onProgress=()=>{},cancel=()=>false){
 const data=new Uint8Array(buffer);check(data.length>20&&data.length<=15*1024*1024,'El PDF debe ocupar menos de 15 MB.');const text=binary(data);check(text.startsWith('%PDF-'));check(!/\/Encrypt\s/.test(text),'El PDF est\u00e1 protegido con contrase\u00f1a. Exporta una copia bancaria sin cifrar para leerla localmente.');check(/openhtmltopdf\.com/.test(text),ERR);check(!/\/Type\s*\/(?:ObjStm|XRef)\b/.test(text),ERR);check((text.match(/%%EOF/g)||[]).length===1,'PDF modificado por una herramienta no compatible. Descarga de nuevo el original del banco.');
 const objects=new Map(),re=/(\d+)\s+(\d+)\s+obj\b/g;let m;
 while((m=re.exec(text))){check(objects.size<10000&&Number(m[2])===0);const id=Number(m[1]);check(!objects.has(id));const r=new Reader(text,re.lastIndex),value=r.read();r.space();let stream=null;
  if(text.slice(r.i,r.i+6)==='stream'){r.i+=6;if(text[r.i]==='\r')r.i++;check(text[r.i++]==='\n');check(Number.isSafeInteger(value.Length)&&value.Length>=0&&value.Length<15*1024*1024);stream=data.slice(r.i,r.i+value.Length);r.i+=value.Length;r.space();check(text.slice(r.i,r.i+9)==='endstream');r.i+=9;r.space();}
  check(text.slice(r.i,r.i+6)==='endobj');re.lastIndex=r.i+6;objects.set(id,{value,stream});
 }
 check(objects.size>0);const resolve=x=>{if(x&&x.ref){check(x.ref[1]===0&&objects.has(x.ref[0]));return objects.get(x.ref[0]).value;}return x;};
 const cache=new Map();let decompressed=0;
 async function streamOf(ref){check(ref&&ref.ref);if(cache.has(ref.ref[0]))return cache.get(ref.ref[0]);const o=objects.get(ref.ref[0]);check(o&&o.stream);let out=o.stream;const f=o.value.Filter;check(!o.value.DecodeParms,ERR);if(f){check(f.name==='FlateDecode'||Array.isArray(f)&&f.length===1&&f[0].name==='FlateDecode');out=await inflate(out);}decompressed+=out.length;check(decompressed<=40*1024*1024,'El contenido del PDF es demasiado grande.');const s=binary(out);cache.set(ref.ref[0],s);return s;}
 const cat=Array.from(objects.values()).find(o=>o.value?.Type?.name==='Catalog');check(cat);const pages=[],visited=new Set();
 function walk(ref,inherited){check(ref?.ref&&!visited.has(ref.ref[0]));visited.add(ref.ref[0]);const p=resolve(ref),resources=p.Resources||inherited;if(p.Type?.name==='Pages'){check(Array.isArray(p.Kids));p.Kids.forEach(k=>walk(k,resources));}else{check(p.Type?.name==='Page'&&(!p.Rotate||p.Rotate===0));pages.push({p,resources});check(pages.length<=250,'M\u00e1ximo: 250 p\u00e1ginas por PDF.');}}
 walk(cat.value.Pages,null);check(pages.length>0);const fontDecoders=new Map(),output=[];
 for(let pi=0;pi<pages.length;pi++){
  if(cancel())throw Error('Lectura cancelada.');onProgress(pi+1,pages.length);const {p,resources}=pages[pi],rs=resolve(resources),fs=resolve(rs?.Font),fonts=Object.create(null);check(fs);
  for(const [name,ref]of Object.entries(fs)){const f=resolve(ref);check(f.Subtype?.name==='Type0'&&f.Encoding?.name==='Identity-H'&&f.ToUnicode);const key=f.ToUnicode.ref[0];if(!fontDecoders.has(key))fontDecoders.set(key,cmap(await streamOf(f.ToUnicode)));fonts[name]=fontDecoders.get(key);}
  const contents=Array.isArray(p.Contents)?p.Contents:[p.Contents],items=[];let ctm=[1,0,0,1,0,0],stack=[],font='',tm=[1,0,0,1,0,0],lead=0,inText=false,seq=0;
  for(const ref of contents){const r=new Reader(await streamOf(ref));let args=[],t;while((t=r.read())!==undefined){if(!t?.op){args.push(t);check(args.length<100000);continue;}const op=t.op;
   if(op==='q'){stack.push(ctm.slice());}else if(op==='Q'){check(stack.length);ctm=stack.pop();}else if(op==='cm'){check(args.length===6&&args.every(Number.isFinite));ctm=mult(ctm,args);}
   else if(op==='BT'){inText=true;tm=[1,0,0,1,0,0];}else if(op==='ET'){inText=false;}else if(op==='Tf'){font=args[0]?.name;check(fonts[font]);}else if(op==='Tm'){check(args.length===6&&args.every(Number.isFinite));tm=args.slice();}
   else if(op==='Td'||op==='TD'){check(args.length===2);tm[4]+=args[0];tm[5]+=args[1];if(op==='TD')lead=-args[1];}else if(op==='TL')lead=args[0];else if(op==='T*')tm[5]-=lead;
   else if(op==='Tj'||op==='TJ'){check(inText&&font&&fonts[font]);const a=op==='Tj'?[args[0]]:args[0];check(Array.isArray(a));let s='';for(const v of a)if(v?.str)s+=fonts[font](v.str);const pos=mult(ctm,tm);check(Math.abs(pos[1])<1e-5&&pos[0]>0&&pos[3]>0,'PDF girado o transformado no compatible.');if(s.trim())items.push({s:s.trim(),x:pos[4],y:pos[5],seq:seq++});}
   else if(op==='\''||op==='"')throw Error(ERR);
   args=[];
  }}
  items.sort((a,b)=>b.y-a.y||a.x-b.x||a.seq-b.seq);const groups=[];
  for(const it of items){let g=groups.find(g=>Math.abs(g.y-it.y)<3);if(!g){g={y:it.y,items:[]};groups.push(g);}g.items.push(it);}
  const lines=groups.sort((a,b)=>b.y-a.y).map(g=>g.items.sort((a,b)=>a.x-b.x||a.seq-b.seq).map(i=>i.s).join(' ').replace(/[\t\u00a0\u202f]/g,' ').replace(/ +/g,' ').trim());
  output.push({page:pi+1,lines});if(pi%3===0)await new Promise(r=>setTimeout(r,0));
 }
 return output;
}
root.PulsoPdf={read:readPdf,version:'1.0.0',supported:'N26 ES / openhtmltopdf, classic text PDF'};
})(typeof window==='undefined'?globalThis:window);
