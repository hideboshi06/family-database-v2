import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { send } from "jsr:@daaku/webpush@0.2.0";

const SITE="https://hideboshi06.github.io/family-database-v2/";
const ORIGIN="https://hideboshi06.github.io";
const headers={"access-control-allow-origin":ORIGIN,"access-control-allow-headers":"authorization,apikey,content-type,x-client-info","access-control-allow-methods":"POST,OPTIONS","content-type":"application/json","cache-control":"no-store"};
const json=(status:number,obj:unknown)=>new Response(JSON.stringify(obj),{status,headers});
const get=<T>(r:{data:T,error:{message:string;code?:string}|null}):T=>{if(r.error)throw Error(r.error.message);return r.data;};
const str=(v:unknown)=>String(v??"").trim();
const nowJST=()=>{
 const f=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
 const p=(k:string)=>f.find(x=>x.type===k)?.value||"";
 return {day:p("year")+"-"+p("month")+"-"+p("day"),clock:p("hour")+":"+p("minute")};
};
type DB=ReturnType<typeof createClient>;
type Subscription={endpoint:string;user_id:string;p256dh:string;auth:string};
// Construct VAPID from the standards-based WebCrypto P-256 key pair instead of
// relying on the Web Push package's key generation helper in the Edge runtime.
function decodeB64Url(raw:string){
 const s=raw.replace(/-/g,"+").replace(/_/g,"/");
 return Uint8Array.from(atob(s.padEnd(Math.ceil(s.length/4)*4,"=")),x=>x.charCodeAt(0));
}
function encodeB64Url(raw:Uint8Array){
 let binary="";
 for(const byte of raw)binary+=String.fromCharCode(byte);
 return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/u,"");
}
async function keys(db:DB){
 const saved=get(await db.from("push_vapid_keys").select("private_jwk,public_key").eq("id",1).maybeSingle());
 if(saved)return saved as {private_jwk:JsonWebKey,public_key:string};
 console.log("Family push VAPID key generation started");
 const pair=await crypto.subtle.generateKey(
  {name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]
 ) as CryptoKeyPair;
 const privateKey=await crypto.subtle.exportKey("jwk",pair.privateKey);
 if(!privateKey.x||!privateKey.y||!privateKey.d)throw Error("vapid_key_export_incomplete");
 const x=decodeB64Url(privateKey.x),y=decodeB64Url(privateKey.y);
 if(x.length!==32||y.length!==32)throw Error("vapid_public_key_invalid");
 const point=new Uint8Array(65);
 point[0]=4;point.set(x,1);point.set(y,33);
 const publicKey=encodeB64Url(point);
 get(await db.from("push_vapid_keys").upsert({id:1,private_jwk:privateKey,public_key:publicKey},{onConflict:"id",ignoreDuplicates:true}));
 const stored=get(await db.from("push_vapid_keys").select("private_jwk,public_key").eq("id",1).single());
 console.log("Family push VAPID public key ready");
 return stored as {private_jwk:JsonWebKey,public_key:string};
}
function endpointValid(endpoint:string){
 try{
  const u=new URL(endpoint),h=u.hostname;
  return u.protocol==="https:"&&(h==="web.push.apple.com"||h.endsWith(".push.apple.com")||
   h==="fcm.googleapis.com"||h==="updates.push.services.mozilla.com"||
   h==="push.services.mozilla.com"||h.endsWith(".notify.windows.com"));
 }catch{return false;}
}
const clean=(name:string)=>name.endsWith("掃除")?name:name.replace(/(拭き|ふき)$/u,"")+"掃除";
async function content(db:DB){
 const today=nowJST().day;
 const [d,c,t,s]=await Promise.all([
  db.from("daily").select("*").eq("day",today).maybeSingle(),
  db.from("cleaning").select("name,next_due"),
  db.from("tasks").select("title,assignee,due_on,completed"),
  db.from("shopping").select("product,quantity,needed")
 ]);
 const day=get(d)||{}, cleaning=get(c)||[], tasks=get(t)||[], shopping=get(s)||[];
 const rows:string[]=[];
 const append=(name:string,value:unknown)=>{const x=str(value);if(x)rows.push(name+"："+x.replace(/\s+/g," ").slice(0,140));};
 append("天気",[
   day.morning_weather?"朝 "+day.morning_weather+(day.morning_temp_c!=null?" "+day.morning_temp_c+"℃":""):"",
   day.evening_weather?"夕 "+day.evening_weather+(day.evening_temp_c!=null?" "+day.evening_temp_c+"℃":""):""
 ].filter(Boolean).join(" / "));
 for(const [name,field] of [["カイ","kai"],["パパ","papa"],["ママ","mama"],["イベント","event"],["給食","lunch"],["ゴミ","garbage"]])append(name,day[field]);
 append("掃除",cleaning.filter((x:{next_due:string|null})=>!x.next_due||x.next_due<=today).map((x:{name:string})=>clean(str(x.name))).join("、"));
 append("タスク",tasks.filter((x:{due_on:string|null;completed:boolean})=>!x.completed&&(!x.due_on||x.due_on<=today))
   .map((x:{title:string;assignee:string|null})=>str(x.title)+(x.assignee?"("+x.assignee+")":"")).join("、"));
 append("買い物",shopping.filter((x:{needed:boolean})=>x.needed)
  .map((x:{product:string;quantity:string|null})=>str(x.product)+(x.quantity?" ×"+str(x.quantity):"")).join("、"));
 return {title:"🗓 今日の家族予定",body:(rows.join("\n")||"予定なし").slice(0,950),url:SITE+"?from=push",day:today};
}
async function broadcast(db:DB,list:Subscription[],test=false){
 const vapid=await keys(db),message=await content(db);
 if(test)message.title+="（テスト）";
 let sent=0,failed=0,expired=0;
 for(const sub of list){
  if(!endpointValid(sub.endpoint)){failed++;continue;}
  try{
   await send({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify(message),
    {vapid:vapid.private_jwk,subscriber:SITE,ttl:7200,urgency:"normal"});
   sent++;
  }catch(e){
   failed++;
   const error=e as {permanent?:boolean;statusCode?:number};
   if(error.permanent){
    expired++;
    await db.from("push_subscriptions").delete().eq("endpoint",sub.endpoint);
   }
   console.warn("Web Push provider status",error.statusCode||"unknown");
  }
 }
 return {sent,failed,expired,devices:list.length};
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return json(405,{error:"method_not_allowed"});
 if(req.headers.get("origin")&&req.headers.get("origin")!==ORIGIN)return json(403,{error:"wrong_origin"});
 let serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!serviceKey){
  try{serviceKey=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}catch{serviceKey="";}
 }
 const url=Deno.env.get("SUPABASE_URL")||"";
 if(!url||!serviceKey)return json(503,{error:"backend_missing"});
 try{
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const input=await req.json() as {action?:string;enabled?:boolean},action=str(input?.action);
  let signedIn:{id:string;role:string}|null=null;
  if(action==="scheduled"){
   const token=req.headers.get("x-family-push-cron")||"";
   if(!token)return json(401,{error:"missing_cron_credential"});
   if(!get(await db.rpc("verify_family_push_cron",{candidate:token})))return json(403,{error:"invalid_cron_credential"});
  }else{
   const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
   if(!jwt)return json(401,{error:"login_required"});
   const verified=await db.auth.getUser(jwt);
   if(verified.error||!verified.data.user?.id||!verified.data.user?.email||!verified.data.user.email_confirmed_at)
    return json(401,{error:"login_required"});
   const u=verified.data.user;
   const member=get(await db.from("family_members").select("role").eq("email",u.email.toLowerCase()).maybeSingle());
   if(!member)return json(403,{error:"family_only"});
   signedIn={id:u.id,role:member.role};
   if(["send-test","set-delivery"].includes(action)&&member.role!=="admin")return json(403,{error:"admin_only"});
  }
  if(action==="public-key")return json(200,{publicKey:(await keys(db)).public_key});
  if(action==="send-test"&&signedIn){
   const list=get(await db.rpc("active_family_push_subscriptions")) as Subscription[];
   const mine=list.filter(x=>x.user_id===signedIn.id);
   if(!mine.length)return json(409,{error:"no_registered_device"});
   return json(200,{ok:true,...await broadcast(db,mine,true)});
  }
  if(action==="set-delivery"&&signedIn){
   if(typeof input.enabled!=="boolean")return json(400,{error:"invalid_flag"});
   if(input.enabled){
    const registered=get(await db.rpc("active_family_push_subscriptions")) as Subscription[];
    if(!registered.length)return json(409,{error:"no_registered_device"});
   }
   const result=get(await db.from("notification_settings").update({delivery_enabled:input.enabled})
    .eq("id",1).select("delivery_enabled,send_time").single());
   return json(200,{ok:true,enabled:result.delivery_enabled,clock:str(result.send_time).slice(0,5)});
  }
  if(action==="scheduled"){
   const settings=get(await db.from("notification_settings").select("send_time,delivery_enabled").eq("id",1).single());
   const now=nowJST();
   if(!settings.delivery_enabled||str(settings.send_time).slice(0,5)!==now.clock)
    return json(200,{ok:true,skipped:"not_due_or_disabled"});
   const run=await db.from("push_delivery_runs").insert({day:now.day,status:"started"}).select("day").single();
   if(run.error?.code==="23505")return json(200,{ok:true,skipped:"already_sent"});
   if(run.error)throw run.error;
   try{
    const subs=get(await db.rpc("active_family_push_subscriptions")) as Subscription[];
    const result=await broadcast(db,subs);
    await db.from("push_delivery_runs").update({recipients:result.devices,sent:result.sent,failed:result.failed,status:"finished",finished_at:new Date().toISOString()}).eq("day",now.day);
    return json(200,{ok:true,...result});
   }catch(e){
    await db.from("push_delivery_runs").update({status:"failed",finished_at:new Date().toISOString()}).eq("day",now.day);
    throw e;
   }
  }
  return json(400,{error:"unknown_action"});
 }catch(err){
  console.error("Family push delivery error",err instanceof Error?err.name+": "+err.message:"unknown");
  return json(500,{error:"push_handler_failed"});
 }
});