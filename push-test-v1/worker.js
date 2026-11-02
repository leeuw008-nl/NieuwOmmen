// Nieuw(s)Ommen Pushproef Worker v1 – aparte KV, VAPID en testtoken vereist.
const enc=new TextEncoder();
const b64u=a=>btoa(String.fromCharCode(...a)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb64=s=>{const x=(s+"=".repeat((4-s.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(x),c=>c.charCodeAt(0))};
const join=(...p)=>{const n=p.reduce((s,x)=>s+x.length,0),o=new Uint8Array(n);let i=0;for(const x of p){o.set(x,i);i+=x.length}return o};
const APP_ORIGIN="https://nieuwommen-push-test.pages.dev";
const cors=(origin)=>origin===APP_ORIGIN?{"access-control-allow-origin":APP_ORIGIN,"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"Content-Type,Authorization","vary":"Origin"}:{};
const json=(x,s=200,origin="")=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json","cache-control":"no-store",...cors(origin)}});
async function hmac(k,d){const key=await crypto.subtle.importKey("raw",k,{name:"HMAC",hash:"SHA-256"},false,["sign"]);return new Uint8Array(await crypto.subtle.sign("HMAC",key,d))}
async function vapid(endpoint,env){
 const pub=env.VAPID_PUBLIC_KEY.trim(),priv=env.VAPID_PRIVATE_KEY.trim(),u=new URL(endpoint);
 const decode=s=>unb64(s);
 const raw=decode(pub);if(raw.length!==65||raw[0]!==4)throw Error("VAPID public key moet 65-byte uncompressed P-256 zijn");
 const jwk={kty:"EC",crv:"P-256",x:b64u(raw.slice(1,33)),y:b64u(raw.slice(33,65)),d:b64u(decode(priv)),ext:true};
 const key=await crypto.subtle.importKey("jwk",jwk,{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
 const part=x=>b64u(enc.encode(JSON.stringify(x)));
 const head=part({typ:"JWT",alg:"ES256"}),body=part({aud:u.origin,exp:Math.floor(Date.now()/1000)+3600,sub:env.VAPID_SUBJECT||"mailto:admin@example.com"}),unsigned=head+"."+body;
 const sig=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,enc.encode(unsigned)));
 return {Authorization:"vapid t="+unsigned+"."+b64u(sig)+", k="+pub};
}
async function encrypt(payload,sub){
 const ua=unb64(sub.keys.p256dh),auth=unb64(sub.keys.auth);if(ua.length!==65||auth.length!==16)throw Error("Ongeldige abonnementsleutels");
 const recipient=await crypto.subtle.importKey("raw",ua,{name:"ECDH",namedCurve:"P-256"},false,[]);
 const server=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
 const serverPub=new Uint8Array(await crypto.subtle.exportKey("raw",server.publicKey));
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:recipient},server.privateKey,256));
 const prk=await hmac(auth,shared),info=join(enc.encode("WebPush: info"),new Uint8Array([0]),ua,serverPub);
 const ikm=await hmac(prk,join(info,new Uint8Array([1]))),salt=crypto.getRandomValues(new Uint8Array(16)),prk2=await hmac(salt,ikm);
 const cek=(await hmac(prk2,join(enc.encode("Content-Encoding: aes128gcm"),new Uint8Array([0,1])))).slice(0,16);
 const nonce=(await hmac(prk2,join(enc.encode("Content-Encoding: nonce"),new Uint8Array([0,1])))).slice(0,12);
 const key=await crypto.subtle.importKey("raw",cek,{name:"AES-GCM"},false,["encrypt"]);
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce},key,join(enc.encode(JSON.stringify(payload)),new Uint8Array([2]))));
 const header=new Uint8Array(86);header.set(salt);new DataView(header.buffer).setUint32(16,4096,false);header[20]=65;header.set(serverPub,21);return join(header,cipher);
}
async function send(sub,env){
 const headers=await vapid(sub.endpoint,env),body=await encrypt({title:"Nieuw(s)Ommen – pushproef",body:"Dit testbericht is via de nieuwe testserver verzonden.",url:env.TEST_APP_URL||"https://leeuw008-nl.github.io/NieuwOmmen/push-test-v1/"},sub);
 const r=await fetch(sub.endpoint,{method:"POST",headers:{"TTL":"60","Content-Type":"application/octet-stream","Content-Encoding":"aes128gcm","Urgency":"high",...headers},body});
 if(r.status===404||r.status===410)throw Object.assign(Error("Abonnement verlopen"),{expired:true});
 if(!r.ok)throw Error("Pushdienst HTTP "+r.status+" "+(await r.text()).slice(0,180));return r.status;
}
export default {async fetch(req,env){
 const origin=req.headers.get("Origin")||"";
 if(origin && origin!==APP_ORIGIN)return new Response("Origin not allowed",{status:403});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 const u=new URL(req.url),p=u.pathname;
 try{
  if(p==="/health")return json({ok:true,version:"push-test-v1"},200,origin);
  if(p==="/vapid"&&req.method==="GET"){if(!env.VAPID_PUBLIC_KEY)return json({error:"VAPID public key niet ingesteld"},503,origin);return json({publicKey:env.VAPID_PUBLIC_KEY},200,origin)}
  if(p==="/subscribe"&&req.method==="POST"){
   const s=await req.json();if(!s.endpoint||!s.keys?.p256dh||!s.keys?.auth||!s.endpoint.startsWith("https://"))return json({error:"Ongeldig pushabonnement"},400,origin);
   const id=b64u(await crypto.subtle.digest("SHA-256",enc.encode(s.endpoint)));
   await env.PUSH_TEST_SUBS.put(id,JSON.stringify({endpoint:s.endpoint,keys:s.keys,created:Date.now()}));
   const check=await env.PUSH_TEST_SUBS.get(id);if(!check)return json({error:"Opslagcontrole mislukt"},500,origin);
   return json({ok:true,saved:true,id},200,origin);
  }
  if(p==="/unsubscribe"&&req.method==="POST"){const {endpoint}=await req.json();if(!endpoint)return json({error:"endpoint ontbreekt"},400,origin);const id=b64u(await crypto.subtle.digest("SHA-256",enc.encode(endpoint)));await env.PUSH_TEST_SUBS.delete(id);return json({ok:true},200,origin)}
  if(p==="/test-send"&&req.method==="POST"){
   if(!env.TEST_TOKEN||req.headers.get("Authorization")!=="Bearer "+env.TEST_TOKEN)return json({error:"Niet geautoriseerd"},401,origin);
   const listed=await env.PUSH_TEST_SUBS.list(),results=[];for(const k of listed.keys){const s=JSON.parse(await env.PUSH_TEST_SUBS.get(k.name));try{const status=await send(s,env);results.push({id:k.name,status,ok:true})}catch(e){results.push({id:k.name,ok:false,error:e.message});if(e.expired)await env.PUSH_TEST_SUBS.delete(k.name)}}
   return json({ok:results.length>0&&results.every(x=>x.ok),total:results.length,results},200,origin);
  }
  return json({error:"Niet gevonden"},404,origin);
 }catch(e){return json({error:e.message||String(e)},500,origin)}
}};
