(function runningBundle(){
"use strict";
(function(){
 const root=()=>document.getElementById("running-root");
 const state={client:null,ready:false,loading:false,loaded:false,activities:[],shoes:[],races:[],view:"home",returnView:"home",selected:null,laps:[],points:[],axis:"time",lapPage:0,editing:false,month:"",error:""};
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
 const renderRow=a=>'<button class="run-activity" type="button" data-run-open="'+esc(a.id)+'"><span class="run-date">'+esc(activityDate(a).slice(5).replace("-","/"))+'</span><span class="run-activity-mid"><strong>'+esc(a.title||"ランニング")+'</strong><small>'+esc(fmtDist(a.distance_m))+' · '+esc(fmtPace(a.moving_time_seconds,a.distance_m))+' · '+(finite(a.avg_heart_rate_bpm)?esc(a.avg_heart_rate_bpm)+" bpm":"心拍なし")+'</small></span><span class="run-badge">'+esc(label(a.training_type))+'</span><span class="run-right">›</span></button>';
 const monthly=()=>state.activities.filter(a=>activityDate(a).slice(0,7)===state.month);
 const metrics=arr=>{let km=sum(arr,a=>a.distance_m),time=sum(arr,a=>a.moving_time_seconds);return '<div class="run-metrics">'+
   [["走行距離",km?(km/1000).toFixed(2)+" km":"0 km"],["練習回数",arr.length+"回"],["合計時間",fmtTime(time)],["平均ペース",km>0?fmtPace(time,km):"—"]].map(([l,v])=>'<div class="run-stat"><div>'+l+'</div><strong>'+v+"</strong></div>").join("")+"</div>";};
 const weeklyGraph=arr=>{
   const weeks=[0,0,0,0,0];
   for(const a of arr){const day=Number(activityDate(a).slice(8));const idx=Math.min(4,Math.floor((day-1)/7));weeks[idx]+=n(a.distance_m)||0;}
   const max=Math.max(...weeks,1000);
   return '<div class="run-weekly">'+weeks.map((v,i)=>'<div class="run-week"><span>'+((v/1000).toFixed(1))+'</span><div class="run-week-well"><div class="run-week-bar" style="height:'+Math.max(v?4:0,v/max*100)+'%"></div></div><small>'+["1–7日","8–14日","15–21日","22–28日","29日〜"][i]+'</small></div>').join("")+"</div>";
 };
 const home=()=>{
   const arr=monthly();
   const current=state.races.filter(x=>x.registration_status!=="cancelled" && (x.race_date||x.race_month)>=dateKey(new Date().toISOString())).sort((a,b)=>(a.race_date||a.race_month).localeCompare(b.race_date||b.race_month))[0];
   const goal=current?'<strong>'+esc(current.race_name)+'</strong><p class="small">'+esc(current.race_date||current.race_month||"日程未定")+' · '+(n(current.distance_m)/1000).toFixed(2)+' km</p>':'<strong>2027年3月 ハーフマラソン</strong><p class="small">大会名・日程は未登録</p>';
   return card('<div class="run-race-info"><span class="run-race-icon">🏅</span><div><div class="small">NEXT TARGET</div>'+goal+'</div></div>','run-race-card')+
   card('<div class="run-heading"><h2>'+yearMonth(state.month)+'の記録</h2><div class="run-month-controls">'+smallbtn("‹",'data-run-month="-1"')+smallbtn("›",'data-run-month="1"')+'</div></div>'+metrics(arr))+
   card(titlebar("月内の走行距離（7日区分）")+weeklyGraph(arr))+
   card(titlebar("最近のランニング",smallbtn("すべて見る ›",'data-run-nav="history"'))+(state.activities.length?state.activities.slice(0,5).map(renderRow).join(""):empty("Garminの記録はまだ登録されていないよ。")));
 };
 const history=()=>card(titlebar("練習履歴",'<span class="small">'+state.activities.length+'件</span>')+(state.activities.length?state.activities.map(renderRow).join(""):empty("記録がまだないよ。")));
 const shoes=()=>card(titlebar("シューズ管理")+(state.shoes.length?state.shoes.map(s=>{
   const records=state.activities.filter(a=>a.shoe_id===s.id),d=sum(records,a=>a.distance_m)+(finite(s.baseline_distance_m)?n(s.baseline_distance_m):0);
   return '<div class="run-datarow"><span>👟 <strong>'+esc(s.shoe_name)+'</strong><small>'+records.length+'回使用</small></span><strong>'+(d/1000).toFixed(1)+' km</strong></div>';
 }).join(""):empty("シューズはまだ登録されていないよ。Garminのギア情報を追加したら、ここに累計距離を表示するよ。")));
 const races=()=>card(titlebar("大会管理")+(state.races.length?state.races.map(r=>'<div class="run-datarow"><span><strong>'+esc(r.race_name)+'</strong><small>'+esc(r.race_date||r.race_month||"日程未定")+' · '+(n(r.distance_m)/1000).toFixed(2)+' km</small></span><span class="run-badge">'+esc(r.registration_status||"")+"</span></div>").join(""):empty("大会データはまだ登録されていないよ。2027年3月のハーフマラソンを目標に準備中。")));
 function render(){
  const el=root();if(!el)return;
  if(state.loading&&!state.loaded){el.innerHTML=card('<p class="small">ランニング記録を読み込み中…</p>');return;}
  if(state.error){el.innerHTML=error(state.error);return;}
  if(state.view==="detail"){renderDetail();return;}
  el.innerHTML=nav()+(state.view==="home"?home():state.view==="history"?history():state.view==="shoes"?shoes():races());
 }
 async function load(){
   if(!state.ready||state.loading)return;
   state.loading=true;state.error="";render();
   try{
     const [a,s,r]=await Promise.all([
       state.client.from("running_activities").select("id,garmin_activity_id,started_at,title,activity_type,distance_m,moving_time_seconds,elapsed_time_seconds,avg_heart_rate_bpm,max_heart_rate_bpm,avg_cadence_spm,training_type,shoe_id,race_id,rpe,fatigue,pain_note,memo").order("started_at",{ascending:false}).limit(1000),
       state.client.from("running_shoes").select("id,shoe_name,baseline_distance_m,retired_on").order("shoe_name"),
       state.client.from("running_races").select("id,race_name,race_date,race_month,distance_m,registration_status,target_time_seconds").order("race_date",{ascending:true,nullsFirst:false})
     ]);
     state.activities=checked(a);state.shoes=checked(s);state.races=checked(r);state.loaded=true;
   }catch(e){state.error="記録を取得できなかったよ: "+(e.message||String(e));}
   finally{state.loading=false;render();}
 }
 async function open(id){
   const a=state.activities.find(x=>x.id===id);if(!a)return;
   state.returnView=state.view==="detail"?"history":state.view;state.view="detail";state.selected=a;state.axis="time";state.lapPage=0;state.editing=false;state.laps=[];state.points=[];render();
   try{
     const [l,p]=await Promise.all([
       state.client.from("running_laps").select("lap_index,distance_m,duration_seconds,avg_heart_rate_bpm,max_heart_rate_bpm,avg_pace_sec_per_km,segment_type").eq("activity_id",id).order("lap_index"),
       state.client.from("running_activity_graph_points").select("point_index,elapsed_seconds,distance_m,avg_heart_rate_bpm,avg_pace_sec_per_km").eq("activity_id",id).order("point_index")
     ]);
     if(state.selected?.id!==id)return;
     state.laps=checked(l);state.points=checked(p);renderDetail();
   }catch(e){if(state.selected?.id===id){state.error="グラフを読み込めなかったよ: "+(e.message||String(e));render();}}
 }
 function metricCard(a){
   const values=[["走行距離",fmtDist(a.distance_m)],["走行時間",fmtTime(a.moving_time_seconds)],["平均ペース",fmtPace(a.moving_time_seconds,a.distance_m)],["平均心拍",finite(a.avg_heart_rate_bpm)?a.avg_heart_rate_bpm+" bpm":"—"]];
   return '<div class="run-metrics">'+values.map(([k,v])=>'<div class="run-stat"><div>'+k+'</div><strong>'+esc(v)+'</strong></div>').join("")+'</div>';
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
   let shoe=state.shoes.find(s=>s.id===a.shoe_id)?.shoe_name||"未設定";
   return '<div class="run-datarow"><span>練習種別</span><strong>'+esc(label(a.training_type))+'</strong></div>'+
          '<div class="run-datarow"><span>シューズ</span><strong>'+esc(shoe)+'</strong></div>'+
          '<div class="run-datarow"><span>きつさ（RPE）</span><strong>'+esc(a.rpe==null?"未入力":a.rpe+"/10")+'</strong></div>'+
          '<div class="run-datarow"><span>疲労感</span><strong>'+esc(a.fatigue==null?"未入力":a.fatigue+"/5")+'</strong></div>'+
          (a.pain_note?'<div class="run-textnote"><small>違和感・痛み</small><p>'+esc(a.pain_note)+'</p></div>':"")+
          (a.memo?'<div class="run-textnote"><small>メモ</small><p>'+esc(a.memo)+'</p></div>':"");
 }

 // Session-RPE load: subjective exertion 1–10 times moving duration in minutes.
 // This is not Garmin's EPOC exercise load, nor an objective fatigue diagnosis.

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
 function effortCard(a){
   const comparison=automaticComparison(a);
   if(!comparison){
     return card(titlebar("ランニング比較")+
       '<div class="run-effort-meta">同じくらいの距離・ペースの記録が増えると、心拍の比較ができるよ。入力は不要。</div>');
   }
   if(comparison.count<2){
     return card(titlebar("ランニング比較")+
       '<div class="run-effort-meta">近い距離・ペースのランがあと'+(2-comparison.count)+'件増えると、平均心拍を比べられるよ。</div>');
   }
   const d=Math.round(comparison.diff);
   const delta=d>0?"+"+d:d.toString();
   const descriptor=Math.abs(d)<=3?"ほぼ同じ":d>0?"やや高め":"やや低め";
   return card(titlebar("ランニング比較")+
     '<div class="run-effort-metrics">'+
       '<div class="run-effort-item"><span>近い条件の平均心拍</span><strong>'+Math.round(comparison.baseline)+' bpm</strong></div>'+
       '<div class="run-effort-item"><span>今回との差</span><strong>'+esc(delta)+' bpm</strong></div>'+
     '</div><div class="run-effort-meta">'+esc(comparison.count)+'件の近い距離・ペースと比較：'+esc(descriptor)+'。心拍差だけで疲労や負荷は断定できないよ。</div>');
 }

 function renderDetail(){
   const a=state.selected,el=root();if(!a||!el)return;
   const g=state.points.length, l=state.laps.length;
   el.innerHTML='<button class="run-back" type="button" data-run-back="1">‹ ランニングに戻る</button>'+
   card('<div class="run-hero-label">Garmin FIT · '+esc(fdate(a.started_at))+'</div><h2 class="run-title">'+esc(a.title||"ランニング")+'</h2>'+metricCard(a)+
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
 function init({client}={}){
   if(!client||!root())return;
   state.client=client;state.month=currentMonth();
   if(!state.ready){
     state.ready=true;
     root().addEventListener("click",e=>{
       const b=e.target.closest("button,[data-run-point]");if(!b)return;
       if(b.dataset.runBack!==undefined){state.view=state.returnView||"history";state.selected=null;render();return;}
       if(b.dataset.runRetry!==undefined){load();return;}
       if(b.dataset.runNav){state.view=b.dataset.runNav;render();return;}
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
     root().addEventListener("submit",e=>{if(e.target.id==="run-edit-form"){e.preventDefault();save(e.target);}});
   }
 }
 window.FamilyRunning={init,load};
})();
})();
