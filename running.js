(function runningBundle(){
"use strict";
(function(){
 const root=()=>document.getElementById("running-root");
 const state={client:null,ready:false,loading:false,loaded:false,role:"member",syncLoading:false,syncDialogOpen:false,syncMessage:"",syncCandidates:[],syncTotal:0,syncProcessed:0,syncImported:0,syncSkipped:0,syncRunning:false,syncStopRequested:false,activities:[],shoes:[],races:[],view:"home",returnView:"home",selected:null,laps:[],points:[],axis:"time",lapPage:0,intervalLaps:new Map(),editing:false,editor:null,month:"",error:""};
 const kinds={jog:"ジョグ",easy:"ジョグ",long_run:"ロング走",pace_run:"ペース走",tempo_run:"テンポ走",intervals:"インターバル走",interval:"インターバル走",repetition:"レペティション",race:"レース",other:"その他"};
 const segments={warmup:"アップ",work:"疾走",recovery:"回復",cooldown:"ダウン",steady:"一定走",unknown:"未分類"};
 const esc=x=>String(x==null?"":x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const n=x=>x==null?NaN:Number(x);
 const finite=x=>Number.isFinite(n(x));
 const pad=x=>String(x).padStart(2,"0");
 const fmtTime=s=>{if(!finite(s))return "—";s=Math.round(n(s));return (s>=3600?Math.floor(s/3600)+":"+pad(Math.floor(s%3600/60)):Math.floor(s/60)+"")+":"+pad(s%60);};
 const fmtPace=(sec,m)=>finite(sec)&&finite(m)&&n(m)>0?fmtTime(n(sec)*1000/n(m))+"/km":"—";
 const fmtPaceSec=sec=>finite(sec)&&n(sec)>0?fmtTime(sec)+"/km":"—";
 const fmtDist=m=>finite(m)?(n(m)/1000).toFixed(2)+" km":"—";
 const fdate=s=>{let d=new Date(s);return new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"long",day:"numeric",weekday:"short",hour:"2-digit",minute:"2-digit"}).format(d);};
 const dateKey=s=>{const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(s));const get=k=>p.find(x=>x.type===k)?.value;return get("year")+"-"+get("month")+"-"+get("day");};
 const currentMonth=()=>dateKey(new Date().toISOString()).slice(0,7);
 const label=x=>kinds[x]||"未分類";
 const $=sel=>root()?.querySelector(sel);
 const checked=r=>{if(r.error)throw r.error;return r.data||[];};
 const yearMonth=ym=>{const [y,m]=ym.split("-").map(Number);return y+"年"+m+"月";};
 const changeMonth=(ym,delta)=>{const [y,m]=ym.split("-").map(Number);const d=new Date(Date.UTC(y,m-1+delta,1));return d.getUTCFullYear()+"-"+pad(d.getUTCMonth()+1);};
 const activityDate=a=>dateKey(a.started_at);
 const sum=(arr,fn)=>arr.reduce((s,x)=>s+(finite(fn(x))?n(fn(x)):0),0);
 const card=(child,cls="")=>'<section class="card run-card '+cls+'">'+child+"</section>";
 const titlebar=(title,extra="")=>'<div class="run-heading"><h2>'+title+"</h2>"+extra+"</div>";
 const smallbtn=(title,action)=>'<button type="button" class="btn secondary smallbtn" '+action+">"+title+"</button>";
 const nav=()=>'<div class="run-sections" role="tablist" aria-label="ランニング画面">'+
  [["home","概要"],["history","練習履歴"],["shoes","シューズ"],["races","大会"]].map(([key,title])=>'<button type="button" data-run-nav="'+key+'" class="'+(state.view===key?"active":"")+'" aria-selected="'+(state.view===key)+'">'+title+"</button>").join("")+"</div>";
 const error=msg=>card('<p class="status err" role="alert">'+esc(msg)+'</p>'+smallbtn("再読み込み",'data-run-retry="1"'));
 const empty=msg=>'<div class="run-empty">'+esc(msg)+"</div>";

 // Titles are derived from saved FIT metadata; nothing new to enter.
 // The label reflects the dominant time-in-zone, not Garmin Training Effect
 // or a diagnosis of fatigue.
 const intensityNames={1:"Relax",2:"Easy",3:"Moderate",4:"Hard",5:"Expert"};
 function intensityZone(a){
   const seconds=a.raw_summary?.hr_zones_seconds;
   if(!Array.isArray(seconds)||seconds.length!==6)return null;
   if(!seconds.every(s=>Number.isFinite(Number(s))&&Number(s)>=0))return null;
   const zones=[1,2,3,4,5];
   const winner=zones.reduce((best,i)=>Number(seconds[i])>Number(seconds[best])?i:best,1);
   return Number(seconds[winner])>0?winner:null;
 }
 function intensityBadge(a){
   const zone=intensityZone(a);
   return zone?'<span class="run-intensity run-intensity-z'+zone+'">'+intensityNames[zone]+'</span>':"";
 }
 function runningIntervals(a){
   // Only trusted explicit workout type or clear work/recovery lap tags
   // qualify as interval training; do not guess from pace spikes.
   const active=state.selected?.id===a.id&&state.laps.length?state.laps:
     state.intervalLaps.get(a.id)||[];
   const work=active.filter(x=>x.segment_type==="work");
   const recovery=active.filter(x=>x.segment_type==="recovery");
   return {work,recovery,confirmed:work.length>=2&&recovery.length>=1};
 }
 function autoRunTitle(a){
   const min=finite(a.moving_time_seconds)&&n(a.moving_time_seconds)>0?n(a.moving_time_seconds)/60:NaN;
   // Rounded duration is for a short title only; the exact time is unchanged
   // in the running stats and activity detail.
   const rounded=Number.isFinite(min)?Math.max(1,Math.round(min/5)*5):null;
   const time=rounded===null?"":rounded+"分";
   const kind=a.training_type||"";
   const intervals=runningIntervals(a);
   const isInterval=["interval","intervals","repetition"].includes(kind)||intervals.confirmed;
   let name;
   if(isInterval){
     name=kind==="repetition"?"レペティション":"インターバル";
     if(intervals.work.length>=2){
       const lengths=intervals.work.map(x=>n(x.distance_m)).filter(x=>Number.isFinite(x)&&x>0).sort((x,y)=>x-y);
       if(lengths.length===intervals.work.length){
         const median=lengths[Math.floor(lengths.length/2)];
         if(lengths.every(x=>Math.abs(x-median)<=Math.max(25,median*.08))){
           const length=Math.round(median/10)*10;
           return (time?time+" ":"")+length+"m×"+lengths.length+" "+name;
         }
       }
     }
   }else if(kind==="race")name="レース";
   else if(kind==="pace_run")name="ペース走";
   else if(kind==="tempo_run")name="テンポ走";
   else if(kind==="long_run"||(Number.isFinite(min)&&min>=90))name="ロング";
   else if(kind==="other"||(Number.isFinite(min)&&min<10&&kind!=="jog"&&kind!=="easy"))name="ラン";
   else name="ジョグ";
   return time+name;
 }
 const weekNames=["日","月","火","水","木","金","土"];
 const dayLabel=key=>{
   const d=new Date(key+"T00:00:00Z");
   return (d.getUTCMonth()+1)+"/"+d.getUTCDate()+"("+weekNames[d.getUTCDay()]+")";
 };
 const renderRow=a=>'<button class="run-activity" type="button" data-run-open="'+esc(a.id)+'"><span class="run-date">'+esc(dayLabel(activityDate(a)))+'</span><span class="run-activity-mid"><span class="run-training-title"><strong>'+esc(autoRunTitle(a))+'</strong>'+intensityBadge(a)+'</span><small>'+esc(fmtDist(a.distance_m))+' · '+esc(fmtPace(a.moving_time_seconds,a.distance_m))+' · '+(finite(a.avg_heart_rate_bpm)?esc(a.avg_heart_rate_bpm)+" bpm":"心拍なし")+'</small></span><span class="run-right">›</span></button>';
 const recentWeekRows=()=>{
   const todayKey=dateKey(new Date().toISOString());
   const todayUTC=Date.parse(todayKey+"T00:00:00Z");
   const byDate=new Map();
   for(const run of state.activities){
     const key=activityDate(run);
     if(!byDate.has(key))byDate.set(key,[]);
     byDate.get(key).push(run);
   }
   const out=[];
   for(let ago=0;ago<7;ago++){
     const key=new Date(todayUTC-ago*86400000).toISOString().slice(0,10);
     const runs=byDate.get(key)||[];
     if(runs.length)out.push(...runs.map(renderRow));
     else out.push('<div class="run-activity run-off-row"><span class="run-date">'+esc(dayLabel(key))+
       '</span><span class="run-activity-mid"><strong>オフ</strong></span></div>');
   }
   return out.join("");
 };
 const monthly=()=>state.activities.filter(a=>activityDate(a).slice(0,7)===state.month);
 const metrics=arr=>{let km=sum(arr,a=>a.distance_m),time=sum(arr,a=>a.moving_time_seconds);return '<div class="run-metrics">'+
   [["走行距離",km?(km/1000).toFixed(2)+" km":"0 km"],["練習回数",arr.length+"回"],["合計時間",fmtTime(time)],["平均ペース",km>0?fmtPace(time,km):"—"]].map(([l,v])=>'<div class="run-stat"><div>'+l+'</div><strong>'+v+"</strong></div>").join("")+"</div>";};
 // Show the current JST week on the right, with the previous four
 // complete Monday–Sunday weeks to its left; independent of month navigation.
 const weeklyGraph=allActivities=>{
   const day=86400000;
   const currentDate=dateKey(new Date().toISOString());
   const todayUTC=Date.parse(currentDate+"T00:00:00Z");
   const mondayOffset=d=>(new Date(d).getUTCDay()+6)%7;
   const thisMonday=todayUTC-mondayOffset(todayUTC)*day;
   const firstMonday=thisMonday-4*7*day;
   const toDay=d=>new Date(d).toISOString().slice(0,10);
   const label=d=>{const date=new Date(d);return (date.getUTCMonth()+1)+"/"+date.getUTCDate();};
   const distanceByDay=new Map(),timeByDay=new Map();
   for(const activity of allActivities){
     const date=activityDate(activity);
     distanceByDay.set(date,(distanceByDay.get(date)||0)+(finite(activity.distance_m)?n(activity.distance_m):0));
     timeByDay.set(date,(timeByDay.get(date)||0)+(finite(activity.moving_time_seconds)?n(activity.moving_time_seconds):0));
   }
   const weeks=[];
   for(let index=0;index<5;index++){
     const monday=firstMonday+index*7*day,sunday=monday+6*day;
     let meters=0,seconds=0;
     for(let d=0;d<7;d++){
       const key=toDay(monday+d*day);
       meters+=distanceByDay.get(key)||0;
       seconds+=timeByDay.get(key)||0;
     }
     weeks.push({meters,seconds,firstLabel:label(monday),lastLabel:label(sunday),current:index===4});
   }
   const max=Math.max(1000,...weeks.map(w=>w.meters));
   return '<div class="run-weekly" role="group" aria-label="直近5週間の走行距離。今週が一番右">'+
     weeks.map(w=>{
       const km=(w.meters/1000).toFixed(1);
       const height=w.meters?Math.max(4,w.meters/max*100):0;
       const range=w.firstLabel+"〜"+w.lastLabel;
       return '<div class="run-week'+(w.current?' run-week-current':'')+'" title="'+
         (w.current?'今週・':'')+range+'・'+km+'km・'+fmtTime(w.seconds)+'">'+
         '<span>'+km+'</span>'+
         '<div class="run-week-well"><div class="run-week-bar" style="height:'+height.toFixed(2)+'%"></div></div>'+
         '<small class="run-week-range"><span>'+w.firstLabel+'</span><span>〜'+w.lastLabel+'</span></small>'+
         '</div>';
     }).join("")+'</div>';
 };
 const home=()=>{
   const arr=monthly();
   const current=state.races.filter(x=>x.registration_status!=="cancelled" && (x.race_date||x.race_month)>=dateKey(new Date().toISOString())).sort((a,b)=>(a.race_date||a.race_month).localeCompare(b.race_date||b.race_month))[0];
   const goal=current?'<strong>'+esc(current.race_name)+'</strong><p class="small">'+esc(current.race_date||current.race_month||"日程未定")+' · '+(n(current.distance_m)/1000).toFixed(2)+' km</p>':'<strong>2027年3月 ハーフマラソン</strong><p class="small">大会名・日程は未登録</p>';
   return card('<div class="run-race-info"><span class="run-race-icon">🏅</span><div><div class="small">NEXT TARGET</div>'+goal+'</div></div>','run-race-card')+
   card('<div class="run-heading"><h2>'+yearMonth(state.month)+'の記録</h2><div class="run-month-controls">'+smallbtn("‹",'data-run-month="-1"')+smallbtn("›",'data-run-month="1"')+'</div></div>'+metrics(arr))+
   card(titlebar("週間走行距離（月〜日）・直近5週")+weeklyGraph(state.activities))+
   card('<div class="run-heading run-recent-heading"><h2>最近のランニング</h2><div class="run-recent-actions">'+
     (state.role==="admin"?smallbtn("Garmin Connect",'data-run-sync-open="1" aria-haspopup="dialog" aria-controls="run-garmin-dialog"'):"")+
     smallbtn("すべて見る ›",'data-run-nav="history"')+'</div></div>'+
     recentWeekRows()+'<p class="small run-off-note">記録のない日は「オフ」と表示</p>');
 };
 const history=()=>card(titlebar("練習履歴",'<span class="small">'+state.activities.length+'件</span>')+(state.activities.length?state.activities.map(renderRow).join(""):empty("記録がまだないよ。")));

 // Shoe and race master data are entered once, not after every run.
 // Each form writes through the authenticated Supabase client and existing RLS.
 const formInput=(name,title,type,value="",extra="")=>
   '<label class="run-entry-field"><span>'+esc(title)+'</span><input type="'+type+'" name="'+name+'" value="'+esc(value==null?"":value)+'" '+extra+'></label>';
 const formSelect=(name,title,values,current)=>
   '<label class="run-entry-field"><span>'+esc(title)+'</span><select name="'+name+'">'+options(values,current)+'</select></label>';
 const submitActions=()=>'<div class="run-entry-actions"><button type="submit" class="btn">保存する</button>'+
   smallbtn("キャンセル",'data-run-editor-cancel="1"')+'</div><p class="run-entry-status" role="status"></p>';
 const shoeForm=()=>{
   const id=state.editor?.kind==="shoe"?state.editor.id:null;
   const s=state.shoes.find(x=>x.id===id)||{};
   const baseline=s.baseline_distance_m==null?"":(Number(s.baseline_distance_m)/1000).toFixed(1);
   return '<form id="run-shoe-form" class="run-entry-form"><h3>'+(id?"シューズを編集":"シューズを登録")+'</h3>'+
      formInput("shoe_name","シューズ名","text",s.shoe_name||"",'required maxlength="160" placeholder="例：ジョグ用シューズ"')+
      formInput("baseline_km","登録前の走行距離（km）","number",baseline,'min="0" step="0.1" inputmode="decimal" placeholder="未使用なら0"')+
      '<details class="run-entry-details"><summary>任意の詳細（メーカー・モデルなど）</summary><div class="run-entry-details-grid">'+
       formInput("brand","メーカー","text",s.brand||"",'maxlength="100" placeholder="例：ASICS"')+
       formInput("model","モデル","text",s.model||"",'maxlength="160"')+
       formInput("started_on","使用開始日","date",s.started_on||"","")+
       formInput("retired_on","使用終了日","date",s.retired_on||"","")+
       formInput("garmin_gear_id","GarminギアID","text",s.garmin_gear_id||"",'maxlength="160"')+
      '</div></details>'+
      submitActions()+'</form>';
 };
 const raceForm=()=>{
   const id=state.editor?.kind==="race"?state.editor.id:null;
   const r=state.races.find(x=>x.id===id)||{};
   const month=r.race_month?r.race_month.slice(0,7):(r.race_date?r.race_date.slice(0,7):"");
   const km=r.distance_m==null?21.0975:Number(r.distance_m)/1000;
   return '<form id="run-race-form" class="run-entry-form"><h3>'+(id?"大会情報を編集":"大会を登録")+'</h3>'+
      formInput("race_name","大会名","text",r.race_name||"",'required maxlength="200" placeholder="未定なら「2027年3月 ハーフ（仮）」など"')+
      formInput("race_month","開催予定月","month",month,"")+
      formInput("race_date","開催日（決まったら）","date",r.race_date||"","")+
      formInput("distance_km","距離（km）","number",km,'required min="0.001" step="0.0001" inputmode="decimal"')+
      formSelect("registration_status","状況",[
        ["considering","検討中"],["registered","エントリー済み"],["completed","出走済み"],["cancelled","中止・見送り"]
      ],r.registration_status||"considering")+
      '<details class="run-entry-details"><summary>任意の詳細（目標タイム・優先度など）</summary><div class="run-entry-details-grid">'+
       formInput("target_time","目標タイム（時:分:秒）","text",r.target_time_seconds?fmtTime(r.target_time_seconds):"",'placeholder="例：2:00:00" inputmode="numeric"')+
       formSelect("priority","優先度",[["","未設定"],["A","A（本命）"],["B","B"],["C","C"]],r.priority||"")+
       formInput("location","開催場所","text",r.location||"",'maxlength="200"')+
       formInput("official_url","大会のURL","url",r.official_url||"",'placeholder="https://"')+
       '</div></details>'+
      submitActions()+'</form>';
 };
 const shoeList=()=>state.shoes.map(s=>{
    const records=state.activities.filter(a=>a.shoe_id===s.id);
    const d=sum(records,a=>a.distance_m)+(finite(s.baseline_distance_m)?n(s.baseline_distance_m):0);
    return '<div class="run-datarow"><span>👟 <strong>'+esc(s.shoe_name)+'</strong><small>'+
       (s.brand?esc(s.brand)+" ":"")+(s.model?esc(s.model)+" · ":"")+records.length+'回の記録を紐付け済み</small></span>'+
       '<div class="run-entry-side"><strong>'+(d/1000).toFixed(1)+' km</strong>'+
       smallbtn("編集",'data-run-item-edit="shoe" data-run-item-id="'+esc(s.id)+'"')+'</div></div>';
 }).join("");
 const shoes=()=>card(
    titlebar("シューズ管理",smallbtn("+ シューズを追加",'data-run-item-add="shoe"'))+
    (state.shoes.length?shoeList():empty("まだシューズは登録されていないよ。まず名前だけでも登録できるよ。"))+
    (state.editor?.kind==="shoe"?shoeForm():""));
 const statuses={considering:"検討中",registered:"エントリー済み",completed:"出走済み",cancelled:"見送り"};
 const raceList=()=>state.races.map(r=>
   '<div class="run-datarow"><span><strong>'+esc(r.race_name)+'</strong>'+
     '<small>'+esc(r.race_date|| (r.race_month?r.race_month.slice(0,7)+"（日程未定）":"日程未定"))+
     ' · '+(Number(r.distance_m)/1000).toFixed(2)+' km'+(r.target_time_seconds?' · 目標 '+esc(fmtTime(r.target_time_seconds)):"")+'</small></span>'+
   '<div class="run-entry-side"><span class="run-badge">'+esc(statuses[r.registration_status]||r.registration_status)+'</span>'+
   smallbtn("編集",'data-run-item-edit="race" data-run-item-id="'+esc(r.id)+'"')+'</div></div>').join("");
 const races=()=>card(
    titlebar("大会管理",smallbtn("+ 大会を追加",'data-run-item-add="race"'))+
    (state.races.length?raceList():empty("まだ大会は未登録。日程が決まっていなくても、予定月だけ登録できるよ。"))+
    (state.editor?.kind==="race"?raceForm():""));
 function showCatalogEditor(kind,id=null){
    if(!["shoe","race"].includes(kind))return;
    if(id&&!(kind==="shoe"?state.shoes:state.races).some(x=>x.id===id))return;
    state.editor={kind,id};state.view=kind==="shoe"?"shoes":"races";
    render();
    root()?.querySelector(".run-entry-form")?.scrollIntoView({behavior:"smooth",block:"nearest"});
 }
 function parseRaceTime(s){
    if(!s)return null;
    const parts=s.split(":");
    if(parts.length!==2&&parts.length!==3)throw Error("目標タイムは「1:55:00」の形式で入力してね。");
    if(!parts.every(x=>/^\d{1,3}$/.test(x)))throw Error("目標タイムの形式を確認してね。");
    const values=parts.map(Number);
    const h=parts.length===3?values[0]:0;
    const m=parts.length===3?values[1]:values[0];
    const sec=values[values.length-1];
    if((parts.length===3&&m>=60)||sec>=60||h*3600+m*60+sec<=0)throw Error("目標タイムを確認してね。");
    return h*3600+m*60+sec;
 }
 async function saveCatalog(form,kind){
    const fd=new FormData(form),val=k=>String(fd.get(k)||"").trim();
    const id=state.editor?.kind===kind?state.editor.id:null;
    const button=form.querySelector('button[type="submit"]'),status=form.querySelector(".run-entry-status");
    if(!button||!status)return;
    let payload,table;
    try{
       if(kind==="shoe"){
          table="running_shoes";
          const name=val("shoe_name");
          if(!name)throw Error("シューズ名を入力してね。");
          const km=val("baseline_km");
          if(km!==""&&(!Number.isFinite(Number(km))||Number(km)<0))throw Error("走行距離は0以上で入力してね。");
          const start=val("started_on")||null,end=val("retired_on")||null;
          if(start&&end&&end<start)throw Error("終了日は使用開始日以降にしてね。");
          payload={shoe_name:name,baseline_distance_m:km!==""?Number(km)*1000:null,
             brand:val("brand")||null,model:val("model")||null,started_on:start,retired_on:end,
             garmin_gear_id:val("garmin_gear_id")||null};
       }else{
          table="running_races";
          const name=val("race_name"),km=Number(val("distance_km"));
          if(!name)throw Error("大会名を入力してね。");
          if(!Number.isFinite(km)||km<=0)throw Error("大会の距離を入力してね。");
          const date=val("race_date")||null,month=date?date.slice(0,7):val("race_month");
          if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error("開催予定月を確認してね。");
          payload={race_name:name,race_month:month?month+"-01":null,race_date:date,distance_m:km*1000,
             registration_status:val("registration_status")||"considering",
             target_time_seconds:parseRaceTime(val("target_time")),priority:val("priority")||null,
             location:val("location")||null,official_url:val("official_url")||null};
       }
       button.disabled=true;status.textContent="保存中…";
       const write=id?
          state.client.from(table).update(payload).eq("id",id).select("id").single():
          state.client.from(table).insert(payload).select("id").single();
       const res=await write;if(res.error)throw res.error;
       if(!res.data?.id)throw Error("保存を確認できなかったよ。");
       state.editor=null;await load();
    }catch(e){
       status.textContent="保存できなかったよ: "+(e.message||String(e));
       button.disabled=false;
    }
 }
 function garminSyncModal(){
   if(!state.syncDialogOpen||state.view!=="home")return "";
   const total=state.syncCandidates.length;
   const checkButton=smallbtn(state.syncLoading?"確認中…":"もう一度確認",
     'data-run-sync-preview="1"'+(state.syncLoading?' disabled aria-busy="true"':""));
   const repairTarget=state.activities.find(a=>
     a.raw_summary?.sync_source==="garmin_personal_api_edge_v1" &&
     !Array.isArray(a.raw_summary?.hr_zones_seconds) &&
     /^\\d{6,20}$/.test(String(a.garmin_activity_id||""))
   );
   const repairButton=!state.syncLoading && repairTarget?
     '<button type="button" class="btn secondary smallbtn" data-run-sync-repair="'+esc(repairTarget.garmin_activity_id)+'">過去の取り込みを修復</button>':"";
   const importButton=total && !state.syncLoading?
     '<button type="button" class="btn smallbtn" data-run-sync-all="1">'+total+'件を取り込む</button>':"";
   const stopButton=state.syncRunning?
     '<button type="button" class="btn secondary smallbtn" data-run-sync-stop="1"'+
       (state.syncStopRequested?' disabled':"")+'>'+(state.syncStopRequested?"中断中…":"この後中断")+'</button>':"";
   const progress=state.syncTotal>0?
     '<div class="run-sync-progress" role="group" aria-label="取り込み進捗">'+
       '<div class="run-sync-progress-top"><span>取り込み状況</span><strong>'+
         state.syncProcessed+' / '+state.syncTotal+'件</strong></div>'+
       '<div class="run-sync-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="'+
         state.syncTotal+'" aria-valuenow="'+state.syncProcessed+'"><div style="width:'+
         Math.round(state.syncProcessed/state.syncTotal*100)+'%"></div></div></div>':"";
   return '<div class="run-sync-overlay" data-run-sync-overlay="1">'+
     '<div id="run-garmin-dialog" class="run-sync-dialog" role="dialog" aria-modal="true" aria-labelledby="run-sync-dialog-title">'+
       '<div class="run-sync-dialog-heading"><h3 id="run-sync-dialog-title">Garmin Connect</h3>'+
       '<button type="button" class="run-sync-close" data-run-sync-close="1" aria-label="閉じる"'+
         (state.syncRunning?' disabled title="取り込み中は中断してから閉じてね"':"")+'>×</button></div>'+
       '<p class="small" role="status" aria-live="polite">'+esc(state.syncMessage||
         "Garmin Connectの新しいランを確認するよ。確認だけでは記録は変更しないよ。")+'</p>'+
       progress+
       '<div class="run-sync-dialog-actions">'+checkButton+repairButton+importButton+stopButton+'</div>'+
       '<p class="small run-sync-footnote">直近365日を確認。登録済みのランは上書きせず、1件ずつ安全に取り込むよ。</p>'+
     '</div></div>';
 }
 function closeGarminSync(){
   if(state.syncRunning)return;
   state.syncDialogOpen=false;
   render();
   root()?.querySelector('[data-run-sync-open]')?.focus();
 }
 function openGarminSync(){
   if(state.role!=="admin"||state.syncDialogOpen)return;
   state.syncDialogOpen=true;
   state.syncMessage="Garmin Connectに新しいランがないか確認するよ。";
   state.syncCandidates=[];
   state.syncTotal=0;state.syncProcessed=0;state.syncImported=0;state.syncSkipped=0;
   render();
   previewGarminSync();
 }
 function render(){
   const el=root();if(!el)return;
   if(state.loading&&!state.loaded){el.innerHTML=card('<p class="small">ランニング記録を読み込み中…</p>');return;}
   if(state.error){el.innerHTML=error(state.error);return;}
   if(state.view==="detail"){renderDetail();return;}
   const active=document.activeElement;
   const focusAttribute=state.syncDialogOpen&&active&&el.contains(active)?
     [...active.attributes].find(attr=>attr.name.startsWith("data-run-sync-"))?.name:null;
   el.innerHTML=nav()+(state.view==="home"?home():state.view==="history"?history():state.view==="shoes"?shoes():races())+
     garminSyncModal();
   if(state.syncDialogOpen){
     const target=focusAttribute?el.querySelector('['+focusAttribute+']'):null;
     (target&&!target.disabled?target:el.querySelector('[data-run-sync-close]:not([disabled])')||
       el.querySelector('[data-run-sync-stop]'))?.focus({preventScroll:true});
   }
 }
 async function previewGarminSync(){
   if(state.role!=="admin"||state.syncLoading||!state.client||!state.syncDialogOpen)return;
   state.syncLoading=true;
   state.syncCandidates=[];
   state.syncTotal=0;state.syncProcessed=0;state.syncImported=0;state.syncSkipped=0;
   state.syncMessage="Garmin Connectの更新を確認中…";
   render();
   try{
     const {data,error:invokeError}=await state.client.functions.invoke("garmin-sync",{body:{action:"preview"}});
     if(invokeError){
       let reason="";
       try{reason=String((await invokeError.context?.json())?.error||"");}catch{}
       throw new Error(reason||invokeError.message);
     }
     if(!data?.ok)throw new Error(data?.error||"確認結果が取得できなかったよ。");
     const pending=Number(data.pending),items=Array.isArray(data.next)?data.next:[];
     if(!Number.isInteger(pending)||pending<0||pending!==items.length||
       !items.every(item=>/^\\d{6,20}$/.test(String(item.garminId||""))))
       throw new Error("確認結果の形式が不正だよ。");
     state.syncCandidates=items.map(item=>({
       garminId:String(item.garminId),title:String(item.title||""),startedAt:item.startedAt||null
     }));
     state.syncMessage=pending===0?"新しいランはないよ。すべて取り込み済みだね！":
       "未取り込みのランが"+pending+"件見つかったよ。";
     if(Number(data.unfinished)>0)state.syncMessage+=" 中断された前回の記録も含まれるよ。";
   }catch(e){
     console.warn("Garmin preview failed:",e);
     state.syncCandidates=[];
     state.syncMessage="更新を確認できなかったよ（"+(e?.message||"通信エラー")+"）。時間をおいて再確認してね。";
   }finally{
     state.syncLoading=false;
     render();
   }
 }
 async function syncAllGarmin(){
   if(state.role!=="admin"||state.syncLoading||!state.client||!state.syncDialogOpen||
      !state.syncCandidates.length)return;
   const batch=state.syncCandidates.slice();
   state.syncLoading=true;state.syncRunning=true;state.syncStopRequested=false;
   state.syncTotal=batch.length;state.syncProcessed=0;state.syncImported=0;state.syncSkipped=0;
   let failed=null;
   render();
   try{
     for(const item of batch){
       if(state.syncStopRequested)break;
       state.syncMessage="Garminのランを取り込み中… "+state.syncProcessed+" / "+state.syncTotal+"件";
       render();
       try{
         const {data,error:invokeError}=await state.client.functions.invoke("garmin-sync",{
           body:{action:"sync-one",garminActivityId:item.garminId}
         });
         if(invokeError){
           let reason="";
           try{reason=String((await invokeError.context?.json())?.error||"");}catch{}
           throw new Error(reason||invokeError.message);
         }
         if(!data?.ok || String(data.activityId)!==item.garminId)
           throw new Error(data?.error||"保存結果の照合に失敗したよ。");
         if(Number(data.imported)===1)state.syncImported++;
         else if(Number(data.skipped)===1)state.syncSkipped++;
         else throw new Error("保存件数が確認できなかったよ。");
         state.syncProcessed++;
       }catch(error){failed=error;break;}
       render();
     }
   }finally{
     state.syncRunning=false;
     state.syncCandidates=[];
     const imported=state.syncImported, skipped=state.syncSkipped,processed=state.syncProcessed,total=state.syncTotal;
     if(failed){
       console.warn("Garmin sync stopped:",failed);
       state.syncMessage=imported+"件取り込んだところで停止したよ（"+(failed?.message||"通信エラー")+
         "）。残りは『もう一度確認』から再開できるよ。";
     }else if(state.syncStopRequested){
       state.syncMessage="取り込みを中断したよ。"+imported+"件保存済み、"+(total-processed)+
         "件は未処理。『もう一度確認』から再開できるよ。";
     }else{
       state.syncMessage="取り込み完了！ "+imported+"件を保存"+
         (skipped?"、登録済み"+skipped+"件をスキップ":"")+"したよ。";
     }
     try{if(processed>0)await load();}catch(e){console.warn("Reload after sync failed:",e);}
     state.syncLoading=false;
     state.syncStopRequested=false;
     render();
   }
 }
 async function repairImportedGarmin(garminId){
   if(state.role!=="admin"||state.syncLoading||!state.client)return;
   const target=state.activities.find(a=>a.garmin_activity_id===garminId &&
     a.raw_summary?.sync_source==="garmin_personal_api_edge_v1");
   if(!target || Array.isArray(target.raw_summary?.hr_zones_seconds))return;
   if(!window.confirm("11/5の既存のランを再解析して、心拍ゾーンと平均ピッチだけ修正するよ。\n"+
       "距離・時間・メモ・シューズ・グラフは変更しないよ。実行していい？"))return;
   state.syncLoading=true;
   state.syncMessage="保存済みFITから心拍ゾーンとピッチを再計算中…";
   render();
   try{
     const {data,error:invokeError}=await state.client.functions.invoke("garmin-sync",{
       body:{action:"repair-imported",garminActivityId:garminId}
     });
     if(invokeError){
       let reason="";
       try{reason=String((await invokeError.context?.json())?.error||"");}catch{}
       throw new Error(reason||invokeError.message);
     }
     if(!data?.ok || Number(data.repaired)!==1)throw new Error(data?.error||"再計算の保存を確認できなかったよ。");
     if(String(data.garminActivityId)!==garminId)throw new Error("記録の照合が一致しなかったよ。");
     await load();
     const zones=Array.isArray(data.zoneSeconds)?data.zoneSeconds:null;
     state.syncMessage="再計算を保存したよ！平均ピッチ "+data.cadenceSpm+" spm"+
       (zones?"、心拍ゾーン計 "+zones.reduce((s,n)=>s+Number(n),0)+"秒。":"。");
   }catch(e){
     console.warn("Garmin analysis repair failed:",e);
     state.syncMessage="再計算でエラーが出たよ："+(e?.message||"詳細不明")+
       "。既存記録はそのままなので、追加の取り込みはしないでね。";
   }finally{
     state.syncLoading=false;
     render();
   }
 }
 async function load(){
   if(!state.ready||state.loading)return;
   state.loading=true;state.error="";render();
   try{
     const [a,s,r,tagged]=await Promise.all([
       state.client.from("running_activities").select("id,garmin_activity_id,started_at,title,activity_type,distance_m,moving_time_seconds,elapsed_time_seconds,avg_heart_rate_bpm,max_heart_rate_bpm,avg_cadence_spm,avg_stride_length_cm,training_type,shoe_id,race_id,rpe,fatigue,pain_note,memo,raw_summary").order("started_at",{ascending:false}).limit(1000),
       state.client.from("running_shoes").select("id,shoe_name,brand,model,garmin_gear_id,started_on,retired_on,baseline_distance_m").order("shoe_name"),
       state.client.from("running_races").select("id,race_name,race_date,race_month,distance_m,location,official_url,registration_status,priority,target_time_seconds").order("race_date",{ascending:true,nullsFirst:false}),
       state.client.from("running_laps").select("activity_id,lap_index,distance_m,segment_type").in("segment_type",["work","recovery"]).order("lap_index").limit(1000)
     ]);
     state.activities=checked(a);state.shoes=checked(s);state.races=checked(r);
     state.intervalLaps=new Map();
     if(!tagged.error){
       for(const lap of tagged.data||[]){
         const current=state.intervalLaps.get(lap.activity_id)||[];
         current.push(lap);state.intervalLaps.set(lap.activity_id,current);
       }
     }else console.warn("Interval lap metadata unavailable:",tagged.error.message);
     state.loaded=true;
   }catch(e){state.error="記録を取得できなかったよ: "+(e.message||String(e));}
   finally{state.loading=false;render();}
 }
 async function open(id){
   const a=state.activities.find(x=>x.id===id);if(!a)return;
   state.returnView=state.view==="detail"?"history":state.view;state.view="detail";state.selected=a;state.axis="time";state.lapPage=0;state.editing=false;state.laps=[];state.points=[];render();
   try{
     const [l,p]=await Promise.all([
       state.client.from("running_laps").select("lap_index,distance_m,duration_seconds,avg_heart_rate_bpm,max_heart_rate_bpm,avg_pace_sec_per_km,segment_type").eq("activity_id",id).order("lap_index"),
       state.client.from("running_activity_graph_points").select("point_index,elapsed_seconds,distance_m,avg_heart_rate_bpm,avg_pace_sec_per_km,bucket_seconds").eq("activity_id",id).order("point_index")
     ]);
     if(state.selected?.id!==id)return;
     state.laps=checked(l);state.points=checked(p);renderDetail();
   }catch(e){if(state.selected?.id===id){state.error="グラフを読み込めなかったよ: "+(e.message||String(e));render();}}
 }
 function strideSourceLabel(a){
   const source=a.raw_summary?.stride_length_source;
   if(source==="garmin_connect_user_reported")return "Garmin Connect表示値（本人提供）";
   if(source==="estimated_from_distance_time_cadence")return "距離・走行時間・ピッチから計算した推定値";
   if(source==="garmin_api")return "Garmin API取得値";
   return "取得元未確認";
 }
 function metricCard(a){
   const values=[["走行距離",fmtDist(a.distance_m)],["走行時間",fmtTime(a.moving_time_seconds)],["平均ペース",fmtPace(a.moving_time_seconds,a.distance_m)],["平均心拍",finite(a.avg_heart_rate_bpm)?a.avg_heart_rate_bpm+" bpm":"—"]];
   if(finite(a.avg_cadence_spm)&&n(a.avg_cadence_spm)>0)values.push(["平均ピッチ",Math.round(n(a.avg_cadence_spm))+" spm"]);
   if(finite(a.avg_stride_length_cm)&&n(a.avg_stride_length_cm)>0)values.push(["平均歩幅",(n(a.avg_stride_length_cm)/100).toFixed(2)+" m"]);
   const sourceNote=finite(a.avg_stride_length_cm)&&n(a.avg_stride_length_cm)>0?
     '<p class="small run-stride-source">歩幅の出典：'+esc(strideSourceLabel(a))+'。フォームの調子は心拍・ペースとあわせて判断しよう。</p>':"";
   return '<div class="run-metrics">'+values.map(([k,v])=>'<div class="run-stat"><div>'+k+'</div><strong>'+esc(v)+'</strong></div>').join("")+'</div>'+sourceNote;
 }
 const field=(id,l,html)=>'<label class="run-field"><span>'+l+'</span>'+html+"</label>";
 const options=(values,current)=>values.map(([v,name])=>'<option value="'+esc(v)+'" '+(String(current||"")===v?"selected":"")+'>'+esc(name)+"</option>").join("");
 function form(a){
   const typeValues=[["","未分類"],["jog","ジョグ"],["long_run","ロング走"],["pace_run","ペース走"],["tempo_run","テンポ走"],["intervals","インターバル走"],["repetition","レペティション"],["race","レース"],["other","その他"]];
   const shoeVals=[["","未設定"],...state.shoes.map(s=>[s.id,s.shoe_name])];
   const nums=(limit)=>[["","未設定"],...Array.from({length:limit},(_,i)=>[String(i+1),String(i+1)])];
   return '<form id="run-edit-form" class="run-edit-fields">'+
     field("run-training","練習種別",'<select name="training_type">'+options(typeValues,a.training_type)+'</select>')+
     field("run-shoe","シューズ",'<select name="shoe_id">'+options(shoeVals,a.shoe_id)+'</select>')+
     field("run-rpe","きつさ（RPE）",'<select name="rpe">'+options(nums(10),a.rpe)+'</select>')+
     field("run-fatigue","疲労感",'<select name="fatigue">'+options(nums(5),a.fatigue)+'</select>')+
     field("run-pain","違和感・痛み",'<input name="pain_note" maxlength="500" value="'+esc(a.pain_note||"")+'" placeholder="任意">')+
     field("run-memo","練習メモ",'<textarea name="memo" maxlength="3000" placeholder="練習の目的・感想">'+esc(a.memo||"")+'</textarea>')+
     '<div class="run-actions"><button type="submit" class="btn">保存する</button>'+smallbtn("キャンセル",'data-run-edit="0"')+'</div><p id="run-edit-status" class="status" role="status"></p></form>';
 }

 function detailMeta(a){
   const shoe=state.shoes.find(s=>s.id===a.shoe_id)?.shoe_name||null;
   const lines=[];
   const row=(k,v)=>'<div class="run-datarow"><span>'+esc(k)+'</span><strong>'+esc(v)+'</strong></div>';
   if(a.training_type)lines.push(row("練習種別",label(a.training_type)));
   if(shoe)lines.push(row("シューズ",shoe));
   if(a.rpe!=null)lines.push(row("きつさ（RPE）",a.rpe+"/10"));
   if(a.fatigue!=null)lines.push(row("疲労感",a.fatigue+"/5"));
   if(a.pain_note)lines.push('<div class="run-textnote"><small>違和感・痛み</small><p>'+esc(a.pain_note)+'</p></div>');
   if(a.memo)lines.push('<div class="run-textnote"><small>メモ</small><p>'+esc(a.memo)+'</p></div>');
   return lines.length?lines.join(""):'<div class="small">未記入でOK。FITの記録だけで使えるよ。</div>';
 }

 // Optional, fully automatic comparison of runs at broadly similar distance
 // and moving pace. A heart-rate difference is descriptive, not a diagnosis
 // of fatigue or a medically validated training-load measurement.
 function automaticComparison(a){
   const d=n(a.distance_m),t=n(a.moving_time_seconds),hr=n(a.avg_heart_rate_bpm);
   if(!(d>=3000&&t>=1200&&Number.isFinite(hr)&&hr>0))return null;
   const pace=t*1000/d;
   const other=state.activities.filter(b=>{
     if(b.id===a.id||!finite(b.distance_m)||!finite(b.moving_time_seconds)||!finite(b.avg_heart_rate_bpm))return false;
     const bd=n(b.distance_m),bt=n(b.moving_time_seconds);
     if(bd<3000||bt<1200||n(b.avg_heart_rate_bpm)<1)return false;
     const bp=bt*1000/bd;
     return Math.abs(bd-d)/d<=.07&&Math.abs(bp-pace)/pace<=.08;
   });
   if(other.length<2)return {count:other.length};
   const baseline=other.reduce((sum,b)=>sum+n(b.avg_heart_rate_bpm),0)/other.length;
   return {count:other.length,baseline,diff:hr-baseline};
 }

 // Garmin running HR zones from the supplied Garmin Connect screenshot.
 // Ranges: Z1 93–110, Z2 111–129, Z3 130–147, Z4 148–166, Z5 >=167.
 // Prefer per-record FIT estimates (timer-paused sections excluded). Fall back
 // to coarse bucket averages only for older imports without FIT zone metadata.
 function heartZoneOf(hr){
   if(hr<93)return 0;
   if(hr<111)return 1;
   if(hr<130)return 2;
   if(hr<148)return 3;
   if(hr<167)return 4;
   return 5;
 }
 function heartZoneData(a){
   const raw=a.raw_summary&&a.raw_summary.hr_zones_seconds;
   if(Array.isArray(raw)&&raw.length===6&&raw.every(x=>Number.isFinite(Number(x))&&Number(x)>=0)){
     return {seconds:raw.map(Number),source:"fit"};
   }
   const seconds=[0,0,0,0,0,0];
   for(const p of state.points){
     if(!finite(p.avg_heart_rate_bpm))continue;
     const sec=finite(p.bucket_seconds)&&n(p.bucket_seconds)>0?n(p.bucket_seconds):0;
     if(sec>0)seconds[heartZoneOf(n(p.avg_heart_rate_bpm))]+=sec;
   }
   return {seconds,source:"coarse"};
 }
 function effortCard(a){
   const {seconds,source}=heartZoneData(a);
   const total=seconds.reduce((s,x)=>s+x,0);
   if(total<=0)return "";
   const zoneNames=["ゾーン外","リラックス","イージー","中強度","ハード","高強度"];
   const main=[1,2,3,4,5].reduce((best,i)=>seconds[i]>seconds[best]?i:best,1);
   const mainLabel="Z"+main+"中心・"+zoneNames[main];
   const percent=i=>Math.round(seconds[i]/total*100);
   const comparison=automaticComparison(a);
   const historical=comparison&&comparison.count>=2
     ?'<div class="run-zone-comparison">近い距離・ペースの'+comparison.count+'回と比較：平均心拍 '+(Math.round(comparison.diff)>0?"+":"")+Math.round(comparison.diff)+' bpm</div>'
     :"";
   return card(titlebar("心拍ゾーン",'<span class="run-zone-main">'+esc(mainLabel)+'</span>')+
     '<div class="run-zone-bar" role="img" aria-label="ゾーン別の心拍滞在割合">'+
     seconds.map((sec,i)=>sec>0?'<span class="run-zone-color run-zone-color-'+i+'" style="width:'+(sec/total*100).toFixed(3)+'%"></span>':"").join("")+'</div>'+
     '<div class="run-zone-labels">'+[1,2,3,4,5].map(i=>'<span><i class="run-zone-key run-zone-color-'+i+'"></i>Z'+i+' <strong>'+percent(i)+'%</strong></span>').join("")+'</div>'+
     '<div class="run-zone-caption">FIT心拍から'+(source==="fit"?"記録点ごとに":"30秒平均から")+'自動推定。Garminの表示とは差が出ることがあるよ。</div>'+historical);
 }

 function renderDetail(){
   const a=state.selected,el=root();if(!a||!el)return;
   const g=state.points.length, l=state.laps.length;
   el.innerHTML='<button class="run-back" type="button" data-run-back="1">‹ ランニングに戻る</button>'+
   card('<div class="run-hero-label">Garmin FIT · '+esc(fdate(a.started_at))+'</div><div class="run-title-line"><h2 class="run-title">'+esc(autoRunTitle(a))+'</h2>'+intensityBadge(a)+'</div>'+metricCard(a)+
   '<div class="run-details-strip"><span>最大心拍 '+esc(finite(a.max_heart_rate_bpm)?a.max_heart_rate_bpm+" bpm":"—")+'</span><span>Garminラップ '+l+'件</span><span>グラフ '+g+'点</span></div>')+
   effortCard(a)+
   card(titlebar("ペース・心拍の推移")+
     '<div class="run-axis" role="tablist" aria-label="横軸の切替">'+[["time","時間"],["distance","距離"],["lap","ラップ"]].map(([k,v])=>'<button type="button" data-run-axis="'+k+'" aria-selected="'+(state.axis===k)+'" class="'+(state.axis===k?"active":"")+'">'+v+'</button>').join("")+'</div>'+
     '<div class="run-legend"><span><i class="run-swatch run-hr"></i>心拍：点＋線（左軸）</span><span><i class="run-swatch run-pace"></i>ペース：縦棒（右軸）</span></div>'+
     '<div class="run-lap-pager" id="run-lap-pager" hidden><button type="button" data-run-lap-page="-1" aria-label="前のラップを表示">‹ 前へ</button><span id="run-lap-page-status" aria-live="polite"></span><button type="button" data-run-lap-page="1" aria-label="次のラップを表示">次へ ›</button></div><div class="run-plot-wrap" id="run-plot"></div><p class="run-chart-hint" id="run-chart-info" hidden></p>')+
   card(titlebar("Garminラップ")+(l?'<div class="run-table-wrap"><table class="run-table"><thead><tr><th>Lap</th><th>区間</th><th>距離</th><th>ペース</th><th>平均心拍</th></tr></thead><tbody>'+
     state.laps.map(x=>'<tr><td>'+esc(x.lap_index)+'</td><td>'+esc(segments[x.segment_type]||"—")+'</td><td>'+esc(fmtDist(x.distance_m))+'</td><td>'+esc(fmtPaceSec(x.avg_pace_sec_per_km))+'</td><td>'+esc(finite(x.avg_heart_rate_bpm)?x.avg_heart_rate_bpm+" bpm":"—")+'</td></tr>').join("")+'</tbody></table></div>':empty("FITにラップ情報がないよ。")))+
   card(titlebar("練習メモ（任意）",!state.editing?smallbtn("必要なときだけ編集",'data-run-edit="1"'):"")+(state.editing?form(a):detailMeta(a)));
   renderGraph();
 }

 // Aggregate the stored 30-second FIT display points without changing Supabase data.
 // Split each adjacent pair at exact 10-minute or 1-km boundaries.
 // Heart rate is time-weighted; pace uses total elapsed time / total distance.
 function coarseRunningPoints(raw,activity,mode){
   const step=mode==="time"?600:1000;
   const valid=(raw||[]).filter(p=>finite(p.elapsed_seconds)&&finite(p.distance_m))
     .sort((a,b)=>n(a.elapsed_seconds)-n(b.elapsed_seconds));
   if(!valid.length)return [];
   const last=valid[valid.length-1];
   const totalT=Math.max(n(last.elapsed_seconds),finite(activity.elapsed_time_seconds)?n(activity.elapsed_time_seconds):0,
     finite(activity.moving_time_seconds)?n(activity.moving_time_seconds):0);
   const totalD=Math.max(n(last.distance_m),finite(activity.distance_m)?n(activity.distance_m):0);
   const heart=p=>p.avg_heart_rate_bpm==null?NaN:n(p.avg_heart_rate_bpm);
   const pace=p=>finite(p.avg_pace_sec_per_km)&&n(p.avg_pace_sec_per_km)>0?n(p.avg_pace_sec_per_km):NaN;
   const anchors=[{t:0,d:0,h:heart(valid[0]),p:pace(valid[0])}];
   for(const p of valid){
     const t=n(p.elapsed_seconds),d=n(p.distance_m);
     if(t<=anchors[anchors.length-1].t)continue;
     anchors.push({t,d:Math.max(anchors[anchors.length-1].d,d),h:heart(p),p:pace(p)});
   }
   if(totalT>anchors[anchors.length-1].t){
     anchors.push({t:totalT,d:Math.max(totalD,anchors[anchors.length-1].d),h:anchors[anchors.length-1].h,p:anchors[anchors.length-1].p});
   }
   // Reconstruct active (moving) time from the stored bucket pace and distance.
   // Calendar elapsed time still controls the time-axis x positions; pauses
   // must not inflate average running pace in either graph.
   const movingEstimate=(a,b)=>{
     const delta=Math.max(0,b.d-a.d);
     const secPerKm=Number.isFinite(b.p)&&b.p>0?b.p:(Number.isFinite(a.p)&&a.p>0?a.p:NaN);
     return delta>0&&Number.isFinite(secPerKm)?delta*secPerKm/1000:(b.t-a.t);
   };
   let inferredMoving=0;
   for(let i=1;i<anchors.length;i++)inferredMoving+=movingEstimate(anchors[i-1],anchors[i]);
   const officialMoving=finite(activity.moving_time_seconds)?n(activity.moving_time_seconds):NaN;
   const factor=Number.isFinite(officialMoving)&&officialMoving>0&&inferredMoving>0
     ?officialMoving/inferredMoving:1;
   const groups=new Map(),total=mode==="time"?totalT:totalD;
   for(let i=1;i<anchors.length;i++){
     const a=anchors[i-1],b=anchors[i],startX=mode==="time"?a.t:a.d,endX=mode==="time"?b.t:b.d;
     if(endX<=startX)continue;
     let cursor=startX;
     while(cursor<endX-1e-7){
       const index=Math.floor((cursor+1e-8)/step);
       const upto=Math.min(endX,(index+1)*step);
       const f0=(cursor-startX)/(endX-startX),f1=(upto-startX)/(endX-startX);
       const dt=Math.max(0,(b.t-a.t)*(f1-f0));
       const dd=Math.max(0,(b.d-a.d)*(f1-f0));
       let g=groups.get(index);
       if(!g){g={index,dt:0,movingDt:0,dd:0,heartTotal:0,heartTime:0};groups.set(index,g);}
       g.dt+=dt;g.dd+=dd;
       g.movingDt+=movingEstimate(a,b)*(f1-f0)*factor;
       if(Number.isFinite(a.h)&&Number.isFinite(b.h)&&dt>0){
         const ha=a.h+(b.h-a.h)*f0,hb=a.h+(b.h-a.h)*f1;
         g.heartTotal+=(ha+hb)/2*dt;g.heartTime+=dt;
       }else if(Number.isFinite(a.h)&&dt>0){g.heartTotal+=a.h*dt;g.heartTime+=dt;}
       else if(Number.isFinite(b.h)&&dt>0){g.heartTotal+=b.h*dt;g.heartTime+=dt;}
       cursor=upto;
     }
   }
   return [...groups.values()].sort((a,b)=>a.index-b.index).map(g=>{
     const start=g.index*step,end=Math.min((g.index+1)*step,total);
     return {
       x:(start+end)/2,start,end,
       hr:g.heartTime>0?g.heartTotal/g.heartTime:NaN,
       pace:g.dd>0?g.movingDt*1000/g.dd:NaN,
       label:mode==="time"?fmtTime(start)+"〜"+fmtTime(end):
         (start/1000).toFixed(0)+"〜"+(end/1000).toFixed(end%1000?2:0)+" km"
     };
   });
 }


 function renderGraph(){
   const target=$("#run-plot"),info=$("#run-chart-info"),pager=$("#run-lap-pager");
   if(!target||!info)return;
   const mode=state.axis,allLaps=state.laps,raw=state.points;
   // Fit the SVG to the available content width, never a fixed wider canvas.
   // No sideways scrolling on an iPhone. Extra interval laps use page controls.
   const width=Math.max(260,Math.round(target.getBoundingClientRect().width||target.clientWidth||360));
   const height=mode==="lap"?285:265,left=43,right=width-47,top=16,bottom=207;
   const plotWidth=right-left;
   let samples=[],shownLaps=[];
   if(mode==="lap"){
     const pageSize=width<420?6:width<660?9:12;
     const pages=Math.max(1,Math.ceil(allLaps.length/pageSize));
     state.lapPage=Math.max(0,Math.min(state.lapPage,pages-1));
     const from=state.lapPage*pageSize;
     shownLaps=allLaps.slice(from,from+pageSize);
     samples=shownLaps.map((lap,i)=>({
       x:i+0.5,hr:n(lap.avg_heart_rate_bpm),pace:n(lap.avg_pace_sec_per_km),
       label:"Lap "+lap.lap_index,lap
     }));
     if(pager){
       pager.hidden=pages<=1;
       const status=pager.querySelector("#run-lap-page-status");
       if(status)status.textContent=(from+1)+"〜"+(from+shownLaps.length)+" / "+allLaps.length+"ラップ";
       const prev=pager.querySelector('[data-run-lap-page="-1"]'),next=pager.querySelector('[data-run-lap-page="1"]');
       if(prev)prev.disabled=state.lapPage===0;
       if(next)next.disabled=state.lapPage===pages-1;
     }
   }else{
     samples=coarseRunningPoints(raw,state.selected,mode);
     if(pager)pager.hidden=true;
   }
   if(!samples.length){
     target.innerHTML=empty(mode==="lap"?"この記録のGarminラップはまだないよ。":"この記録のグラフデータはまだないよ。");
     info.textContent="";return;
   }
   const hrValues=samples.map(s=>s.hr).filter(Number.isFinite);
   const paceValues=samples.map(s=>s.pace).filter(v=>Number.isFinite(v)&&v>0);
   if(!hrValues.length&&!paceValues.length){
     target.innerHTML=empty("表示可能な心拍・ペースデータがないよ。");
     info.textContent="";return;
   }
   let hMin=Math.max(40,Math.floor(((hrValues.length?Math.min(...hrValues):100)-12)/10)*10);
   let hMax=Math.min(230,Math.ceil(((hrValues.length?Math.max(...hrValues):160)+12)/10)*10);
   if(hMax-hMin<40){hMin=Math.max(40,hMin-20);hMax=hMin+60;}
   let pMin=paceValues.length?Math.max(60,Math.floor(Math.min(...paceValues)*.9/30)*30):180;
   let pMax=paceValues.length?Math.ceil(Math.max(...paceValues)*1.1/30)*30:600;
   if(pMax-pMin<90){pMin=Math.max(60,pMin-45);pMax=pMin+135;}
   const xMin=0,xMax=mode==="lap"?samples.length:Math.max(...samples.map(s=>s.end));
   const X=v=>left+plotWidth*(v-xMin)/Math.max(xMax-xMin,1);
   const Yh=v=>bottom-(v-hMin)/(hMax-hMin)*(bottom-top);
   // Larger values are slower: draw fast-pace bars higher.
   const Yp=v=>top+(v-pMin)/(pMax-pMin)*(bottom-top);
   const at=v=>Number(v.toFixed(2));
   let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+'" width="100%" height="auto" preserveAspectRatio="xMidYMid meet" role="img" aria-label="平均心拍は青い点と線、平均ペースはオレンジの棒。横スクロールなしのグラフ">';
   for(let i=0;i<=4;i++){
     const y=at(top+(bottom-top)*i/4),hr=Math.round(hMax-(hMax-hMin)*i/4),pace=pMin+(pMax-pMin)*i/4;
     svg+='<line x1="'+left+'" x2="'+right+'" y1="'+y+'" y2="'+y+'" stroke="#e4ebf1" stroke-dasharray="3 4"/>'+
       '<text x="'+(left-6)+'" y="'+(y+3.5)+'" text-anchor="end" fill="#2d6595" font-size="10">'+hr+'</text>'+
       '<text x="'+(right+5)+'" y="'+(y+3.5)+'" fill="#b16a40" font-size="10">'+esc(fmtPaceSec(pace).replace("/km",""))+'</text>';
   }
   svg+='<line x1="'+left+'" x2="'+right+'" y1="'+bottom+'" y2="'+bottom+'" stroke="#b3c3cf"/>';
   if(mode==="lap"){
     shownLaps.forEach((lap,i)=>{
       const x=X(i),end=X(i+1);
       const colors={work:"#e8f1fa",recovery:"#fff0e6",warmup:"#f2f5f7",cooldown:"#f2f5f7",steady:"#f8fafb",unknown:i%2?"#fff":"#f8fafb"};
       svg+='<rect x="'+at(x)+'" y="'+top+'" width="'+at(end-x)+'" height="'+(bottom-top)+'" fill="'+(colors[lap.segment_type]||"#f7f9fb")+'"/>'+
         '<line x1="'+at(end)+'" x2="'+at(end)+'" y1="'+top+'" y2="'+bottom+'" stroke="#dbe5ed" stroke-dasharray="2 4"/>';
     });
   }
   samples.forEach((s,i)=>{
     if(!Number.isFinite(s.pace)||s.pace<=0)return;
     const center=X(s.x),span=mode==="lap"?plotWidth/samples.length:X(s.end)-X(s.start);
     const barW=Math.max(4,Math.min(mode==="lap"?48:44,span*.64));
     const y=Math.max(top,Math.min(bottom,Yp(s.pace)));
     svg+='<rect x="'+at(center-barW/2)+'" y="'+at(y)+'" width="'+at(barW)+'" height="'+at(bottom-y)+'" rx="2" fill="#dc8954" fill-opacity=".78" stroke="#cb7845" stroke-opacity=".6"/>';
   });
   // The blue heart-rate line is drawn on top of the orange pace bars.
   const hrSamples=samples.filter(s=>Number.isFinite(s.hr));
   if(hrSamples.length>1)
     svg+='<polyline points="'+hrSamples.map(s=>at(X(s.x))+","+at(Yh(s.hr))).join(" ")+'" fill="none" stroke="#2d6595" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
   for(const s of hrSamples)
     svg+='<circle cx="'+at(X(s.x))+'" cy="'+at(Yh(s.hr))+'" r="'+(width<380?3.7:4.4)+'" fill="#2d6595" stroke="#fff" stroke-width="1.2"/>';
   if(mode==="lap"){
     shownLaps.forEach((lap,i)=>{
       const x=at(X(i+.5)),label=segments[lap.segment_type]||"未分類";
       svg+='<text x="'+x+'" y="225" fill="#536f86" text-anchor="middle" font-size="10" font-weight="700">L'+esc(lap.lap_index)+'</text>'+
         '<text x="'+x+'" y="241" fill="#6b7e8f" text-anchor="middle" font-size="9">'+(finite(lap.distance_m)?Math.round(n(lap.distance_m))+"m":"—")+'</text>';
       if(shownLaps.length<=6)
         svg+='<text x="'+x+'" y="255" fill="#73899b" text-anchor="middle" font-size="9">'+esc(label)+'</text>';
       svg+='<rect x="'+at(X(i))+'" y="'+top+'" width="'+at(X(i+1)-X(i))+'" height="'+(bottom-top)+'" fill="transparent" data-run-point="'+i+'" aria-label="Lap '+esc(lap.lap_index)+'"/>';
     });
     // Keep the footer hidden until a graph segment is selected.
   }else{
     const step=mode==="time"?600:1000;
     const tickCount=Math.floor(xMax/step);
     const maxTickCount=Math.max(2,Math.floor(plotWidth/47));
     const stride=Math.max(1,Math.ceil(tickCount/maxTickCount));
     for(let t=0;t<=tickCount;t+=stride){
       const value=t*step,x=at(X(value));
       svg+='<text x="'+x+'" y="225" text-anchor="middle" fill="#6b7e8f" font-size="10">'+esc(mode==="time"?t*10+"分":t+"km")+'</text>';
     }
     // Wider transparent columns make small mobile bars/points easy to select.
     samples.forEach((s,i)=>{
       const x=at(X(s.start)),w=at(Math.max(1,X(s.end)-X(s.start)));
       svg+='<rect x="'+x+'" y="'+top+'" width="'+w+'" height="'+(bottom-top)+'" fill="transparent" data-run-point="'+i+'" aria-label="'+esc(s.label)+'"/>';
     });
     // Keep the footer hidden until a graph segment is selected.
   }
   svg+='<text x="'+at((left+right)/2)+'" y="'+(mode==="lap"?277:256)+'" text-anchor="middle" font-size="10" fill="#6b7e8f">'+
     (mode==="time"?"経過時間":mode==="distance"?"累積距離":"Garminラップ（1本＝1ラップ）")+'</text></svg>';
   target.innerHTML=svg;
   target._pointSamples=samples;
   info.textContent="";
   info.hidden=true;
 }
 async function save(form){
   const a=state.selected;if(!a)return;
   const fd=new FormData(form),s=name=>String(fd.get(name)||"").trim();
   const payload={training_type:s("training_type")||null,shoe_id:s("shoe_id")||null,rpe:s("rpe")?Number(s("rpe")):null,fatigue:s("fatigue")?Number(s("fatigue")):null,pain_note:s("pain_note")||null,memo:s("memo")||null};
   const status=$("#run-edit-status"),button=form.querySelector('button[type="submit"]');button.disabled=true;status.textContent="保存中…";
   try{
     const {data,error}=await state.client.from("running_activities").update(payload).eq("id",a.id).select("id").single();if(error)throw error;
     if(!data)throw Error("変更を確認できなかったよ。");
     Object.assign(a,payload);state.editing=false;renderDetail();
   }catch(e){status.textContent="保存できなかったよ: "+(e.message||e);button.disabled=false;}
 }
 function init({client,role}={}){
   if(!client||!root())return;
   state.client=client;state.role=role==="admin"?"admin":"member";state.month=currentMonth();
   if(!state.ready){
     state.ready=true;
     root().addEventListener("click",e=>{
       if(e.target?.dataset?.runSyncOverlay!==undefined){closeGarminSync();return;}
       const b=e.target.closest("button,[data-run-point]");if(!b)return;
       if(b.dataset.runSyncOpen!==undefined){openGarminSync();return;}
       if(b.dataset.runSyncClose!==undefined){closeGarminSync();return;}
       if(b.dataset.runBack!==undefined){state.view=state.returnView||"history";state.selected=null;render();return;}
       if(b.dataset.runRetry!==undefined){load();return;}
       if(b.dataset.runSyncPreview!==undefined){previewGarminSync();return;}
       if(b.dataset.runSyncAll!==undefined){syncAllGarmin();return;}
       if(b.dataset.runSyncStop!==undefined){state.syncStopRequested=true;state.syncMessage="現在の1件が終わったら中断するよ。";render();return;}
       if(b.dataset.runSyncRepair!==undefined){repairImportedGarmin(b.dataset.runSyncRepair);return;}
       if(b.dataset.runNav){if(state.syncRunning)return;state.editor=null;state.syncDialogOpen=false;state.view=b.dataset.runNav;render();return;}
       if(b.dataset.runItemAdd){showCatalogEditor(b.dataset.runItemAdd);return;}
       if(b.dataset.runItemEdit){showCatalogEditor(b.dataset.runItemEdit,b.dataset.runItemId);return;}
       if(b.dataset.runEditorCancel!==undefined){state.editor=null;render();return;}
       if(b.dataset.runOpen){open(b.dataset.runOpen);return;}
       if(b.dataset.runMonth){state.month=changeMonth(state.month,Number(b.dataset.runMonth));render();return;}
       if(b.dataset.runAxis){state.axis=b.dataset.runAxis;state.lapPage=0;renderGraph();root().querySelectorAll("[data-run-axis]").forEach(x=>{x.classList.toggle("active",x.dataset.runAxis===state.axis);x.setAttribute("aria-selected",x.dataset.runAxis===state.axis?"true":"false");});return;}
       if(b.dataset.runLapPage!==undefined){
         const width=$("#run-plot")?.clientWidth||360;
         const pageSize=width<420?6:width<660?9:12;
         const totalPages=Math.max(1,Math.ceil(state.laps.length/pageSize));
         state.lapPage=Math.max(0,Math.min(totalPages-1,state.lapPage+Number(b.dataset.runLapPage)));
         renderGraph();return;
       }
       if(b.dataset.runEdit!==undefined){
         state.editing=b.dataset.runEdit==="1";
         renderDetail();
         if(state.editing)$("#run-edit-form")?.scrollIntoView({behavior:"smooth",block:"start"});
         return;
       }
       if(b.dataset.runPoint!==undefined){
         const points=$("#run-plot")?._pointSamples||[],p=points[Number(b.dataset.runPoint)],out=$("#run-chart-info");if(!p||!out)return;
         out.textContent=state.axis==="lap"?(p.label+"・"+(segments[p.lap.segment_type]||"未分類")+"・"+fmtDist(p.lap.distance_m)+"・"+fmtTime(p.lap.duration_seconds)+"・ペース "+fmtPaceSec(p.pace)+"・平均心拍 "+(finite(p.hr)?Math.round(p.hr)+" bpm":"—")+"・最大心拍 "+(finite(p.lap.max_heart_rate_bpm)?Math.round(n(p.lap.max_heart_rate_bpm))+" bpm":"—")):(p.label+"・ペース "+fmtPaceSec(p.pace)+"・心拍 "+(finite(p.hr)?Math.round(p.hr)+" bpm":"—"));
         out.hidden=false;
       }
     });
     root().addEventListener("keydown",e=>{
       if(!state.syncDialogOpen)return;
       if(e.key==="Escape"){e.preventDefault();closeGarminSync();return;}
       if(e.key==="Tab"){
         const dialog=root()?.querySelector("#run-garmin-dialog");
         const items=[...(dialog?.querySelectorAll('button:not([disabled])')||[])];
         if(!items.length)return;
         const first=items[0],last=items[items.length-1];
         if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
         else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
       }
     });
     root().addEventListener("submit",e=>{
       if(e.target.id==="run-edit-form"){e.preventDefault();save(e.target);}
       else if(e.target.id==="run-shoe-form"){e.preventDefault();saveCatalog(e.target,"shoe");}
       else if(e.target.id==="run-race-form"){e.preventDefault();saveCatalog(e.target,"race");}
     });
   }
 }
 window.FamilyRunning={init,load};
})();
})();
