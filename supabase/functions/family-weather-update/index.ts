import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (status: number, data: object): Response => new Response(JSON.stringify(data), {
  status, headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});

async function equalToken(left: string, right: string): Promise<boolean> {
  const enc=new TextEncoder();
  const [a,b]=await Promise.all([crypto.subtle.digest("SHA-256",enc.encode(left)),crypto.subtle.digest("SHA-256",enc.encode(right))]);
  const aa=new Uint8Array(a), bb=new Uint8Array(b);
  let difference=0;
  for(let i=0;i<aa.length;i++)difference|=aa[i]^bb[i];
  return difference===0 && left.length>0 && right.length>0;
}

type Hour = {time?:string;temp_c?:number;chance_of_rain?:number;condition?:{text?:string}};
type Day = {date?:string;hour?:Hour[]};
type Payload = {forecast?:{forecastday?:Day[]}};
function pick(day:Day,hour:number):Hour|undefined{
  return day.hour?.find(x=>x.time?.endsWith(" "+String(hour).padStart(2,"0")+":00"));
}
function valid(x:Hour|undefined):x is Required<Hour>{
  return !!x && Number.isFinite(x.temp_c) && Number.isInteger(x.chance_of_rain) &&
    x.chance_of_rain!>=0 && x.chance_of_rain!<=100 &&
    typeof x.condition?.text==="string" && x.condition.text.length>0;
}

Deno.serve(async(req:Request):Promise<Response>=>{
  if(req.method!=="POST")return json(405,{error:"method_not_allowed"});
  const token=Deno.env.get("WEATHER_CRON_TOKEN")||"";
  const key=Deno.env.get("WEATHERAPI_KEY")||"";
  const coords=Deno.env.get("WEATHER_COORDS")||"";
  if(token.length<32)return json(503,{error:"cron_token_not_configured"});
  if(!(await equalToken(req.headers.get("x-weather-cron-token")||"",token)))
    return json(401,{error:"unauthorized"});
  // Only reveal missing secret names to a caller holding the cron token, never their values.
  const missing=[];
  if(!key)missing.push("WEATHERAPI_KEY");
  if(!coords)missing.push("WEATHER_COORDS");
  if(missing.length)return json(503,{error:"not_configured",missing});
  const supabaseUrl=Deno.env.get("SUPABASE_URL");
  let secretKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!secretKey) {
    try { secretKey=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default; }
    catch { secretKey=undefined; }
  }
  if(!supabaseUrl||!secretKey)return json(503,{error:"backend_not_configured"});
  try{
    const endpoint=new URL("https://api.weatherapi.com/v1/forecast.json");
    endpoint.searchParams.set("key",key);
    endpoint.searchParams.set("q",coords);
    endpoint.searchParams.set("days","3");
    endpoint.searchParams.set("lang","ja");
    endpoint.searchParams.set("aqi","no");
    endpoint.searchParams.set("alerts","no");
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),20000);
    let result:Response;
    try{result=await fetch(endpoint,{signal:controller.signal});}
    finally{clearTimeout(timer);}
    if(!result.ok){
      console.error("WeatherAPI status",result.status);
      return json(502,{error:"weather_provider_failed",status:result.status});
    }
    const payload=await result.json() as Payload;
    const rows=[];
    for(const day of payload.forecast?.forecastday||[]){
      if(!day.date||!(/^\d{4}-\d{2}-\d{2}$/).test(day.date))continue;
      const morning=pick(day,8),evening=pick(day,18);
      if(!valid(morning)||!valid(evening))continue;
      rows.push({
        day:day.date,
        morning_weather:morning.condition.text,
        morning_temp_c:morning.temp_c,
        morning_rain_pct:morning.chance_of_rain,
        evening_weather:evening.condition.text,
        evening_temp_c:evening.temp_c,
        evening_rain_pct:evening.chance_of_rain,
        updated_at:new Date().toISOString()
      });
    }
    if(!rows.length)return json(502,{error:"no_valid_hourly_forecast"});
    const supabase=createClient(supabaseUrl,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
    // Explicit UPDATE touches only weather columns; INSERT handles missing dates.
    // Sparse UPSERT can accidentally replace unrelated fields on conflicting rows.
    for(const weather of rows) {
      const {day,...forecastFields}=weather;
      const exists=await supabase.from("daily").select("day").eq("day",day).maybeSingle();
      if(exists.error){
        console.error("Weather DB lookup",exists.error.code);
        return json(500,{error:"database_lookup_failed"});
      }
      const saved=exists.data
        ? await supabase.from("daily").update(forecastFields).eq("day",day)
        : await supabase.from("daily").insert({day,...forecastFields});
      if(saved.error){
        console.error("Weather DB update",saved.error.code);
        return json(500,{error:"database_update_failed"});
      }
    }
    console.log("Family weather updated",rows.length,"days");
    return json(200,{ok:true,updated_days:rows.map(x=>x.day)});
  }catch(e){
    console.error("Family weather invoke",e instanceof Error?e.name:"unknown");
    return json(502,{error:"weather_update_failed"});
  }
});
