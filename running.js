(function runningBundle(){
"use strict";
(function(){
 const root=()=>document.getElementById("running-root");
 const state={client:null,ready:false,loading:false,loaded:false,activities:[],shoes:[],races:[],view:"home",returnView:"home",selected:null,laps:[],points:[],axis:"time",editing:false,month:"",error:""};
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
   state.returnView=state.view==="detail"?"history":state.view;state.view="detail";state.selected=a;state.axis="time";state.editing=false;state.laps=[];state.points=[];render();
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
 function renderDetail(){
   const a=state.selected,el=root();if(!a||!el)return;
   const g=state.points.length, l=state.laps.length;
   el.innerHTML='<button class="run-back" type="button" data-run-back="1">‹ ランニングに戻る</button>'+
   card('<div class="run-hero-label">Garmin FIT · '+esc(fdate(a.started_at))+'</div><h2 class="run-title">'+esc(a.title||"ランニング")+'</h2>'+metricCard(a)+
   '<div class="run-details-strip"><span>最大心拍 '+esc(finite(a.max_heart_rate_bpm)?a.max_heart_rate_bpm+" bpm":"—")+'</span><span>Garminラップ '+l+'件</span><span>グラフ '+g+'点</span></div>')+
   card(titlebar("ペース・心拍の推移")+
     '<div class="run-axis" role="tablist" aria-label="横軸の切替">'+[["time","時間"],["distance","距離"],["lap","ラップ（距離）"]].map(([k,v])=>'<button type="button" data-run-axis="'+k+'" aria-selected="'+(state.axis===k)+'" class="'+(state.axis===k?"active":"")+'">'+v+'</button>').join("")+'</div>'+
     '<div class="run-legend"><span><i class="run-swatch run-hr"></i>心拍：点＋線（左軸）</span><span><i class="run-swatch run-pace"></i>ペース：縦棒（右軸）</span></div>'+
     '<div class="run-plot-wrap" id="run-plot"></div><p class="run-chart-hint" id="run-chart-info"></p>'+
     '<div class="run-chart-note">時間・距離はFITから軽量化したデータ、ラップはGarmin本来の区間を表示。速いペースほど棒が高くなるよ。</div>')+
   card(titlebar("Garminラップ")+(l?'<div class="run-table-wrap"><table class="run-table"><thead><tr><th>Lap</th><th>区間</th><th>距離</th><th>ペース</th><th>平均心拍</th></tr></thead><tbody>'+
     state.laps.map(x=>'<tr><td>'+esc(x.lap_index)+'</td><td>'+esc(segments[x.segment_type]||"—")+'</td><td>'+esc(fmtDist(x.distance_m))+'</td><td>'+esc(fmtPaceSec(x.avg_pace_sec_per_km))+'</td><td>'+esc(finite(x.avg_heart_rate_bpm)?x.avg_heart_rate_bpm+" bpm":"—")+'</td></tr>').join("")+'</tbody></table></div>':empty("FITにラップ情報がないよ。")))+
   card(titlebar("練習メモ",!state.editing?smallbtn("編集する",'data-run-edit="1"'):"")+(state.editing?form(a):detailMeta(a)));
   renderGraph();
 }
 function renderGraph(){
   const target=$("#run-plot"),info=$("#run-chart-info");
   if(!target||!info)return;
   const mode=state.axis, laps=state.laps, raw=state.points;
   let samples;
   if(mode==="lap"){
     let d=0; samples=laps.map(l=>{const distance=Math.max(0,n(l.distance_m)||0);const point={x:d+distance/2,hr:n(l.avg_heart_rate_bpm),pace:n(l.avg_pace_sec_per_km),label:"Lap "+l.lap_index,lap:l};d+=distance;return point;});
   }else samples=raw.map(p=>({x:mode==="time"?n(p.elapsed_seconds):n(p.distance_m),hr:n(p.avg_heart_rate_bpm),pace:n(p.avg_pace_sec_per_km),label:mode==="time"?fmtTime(p.elapsed_seconds):fmtDist(p.distance_m),raw:p})).filter(p=>Number.isFinite(p.x));
   if(!samples.length){target.innerHTML=empty("この記録のグラフデータはまだないよ。");info.textContent="";return;}
   const width=Math.max(740,mode==="lap"?samples.length*55+110:740),height=292,left=63,right=width-67,top=24,bottom=228;
   const valuesH=samples.map(x=>x.hr).filter(Number.isFinite),valuesP=samples.map(x=>x.pace).filter(x=>Number.isFinite(x)&&x>0);
   if(!valuesH.length&&!valuesP.length){target.innerHTML=empty("表示可能な心拍・ペースデータがないよ。");info.textContent="";return;}
   let h0=Math.max(40,Math.floor(((valuesH.length?Math.min(...valuesH):100)-12)/10)*10),h1=Math.min(230,Math.ceil(((valuesH.length?Math.max(...valuesH):160)+12)/10)*10);
   if(h1-h0<40){h0=Math.max(40,h0-20);h1=h0+60;}
   let p0=valuesP.length?Math.max(60,Math.floor(Math.min(...valuesP)*0.90/30)*30):180;
   let p1=valuesP.length?Math.ceil(Math.max(...valuesP)*1.1/30)*30:600;
   if(p1-p0<90){p0=Math.max(60,p0-45);p1=p0+135;}
   let xMin=mode==="lap"?0:Math.min(0,samples[0].x), xMax=mode==="lap"?sum(laps,l=>l.distance_m):Math.max(...samples.map(s=>s.x));
   if(xMax<=xMin)xMax=xMin+1;
   const X=v=>left+(right-left)*(v-xMin)/(xMax-xMin);
   const Yh=v=>bottom-(v-h0)/(h1-h0)*(bottom-top);
   const Yp=v=>top+(v-p0)/(p1-p0)*(bottom-top);
   const at=(v)=>Number(v.toFixed(2));
   let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+'" style="min-width:'+width+'px" role="img" aria-label="心拍は青い点と線、ペースは橙色の棒グラフ">';
   for(let i=0;i<=4;i++){
     const y=top+(bottom-top)*i/4,hr=(h1-(h1-h0)*i/4).toFixed(0),pace=p0+(p1-p0)*i/4;
     svg+='<line x1="'+left+'" x2="'+right+'" y1="'+y+'" y2="'+y+'" stroke="#e5edf4" stroke-dasharray="3 5"/>'+
       '<text x="'+(left-9)+'" y="'+(y+4)+'" text-anchor="end" fill="#2d6595">'+hr+'</text>'+
       '<text x="'+(right+10)+'" y="'+(y+4)+'" fill="#bd7243">'+esc(fmtPaceSec(pace).replace("/km",""))+'</text>';
   }
   svg+='<line x1="'+left+'" x2="'+right+'" y1="'+bottom+'" y2="'+bottom+'" stroke="#a8bbc9"/>';
   if(mode==="lap"){
     let d=0;
     laps.forEach((l,i)=>{const newD=d+(Math.max(0,n(l.distance_m)||0));const start=X(d),end=X(newD);if(i%2===0)svg+='<rect x="'+start+'" y="'+top+'" width="'+Math.max(0,end-start)+'" height="'+(bottom-top)+'" fill="#f4f8fb"/>';svg+='<line x1="'+end+'" x2="'+end+'" y1="'+top+'" y2="'+bottom+'" stroke="#cfdee9" stroke-dasharray="2 4"/>';d=newD;});
   }
   for(let i=0;i<samples.length;i++){
     const s=samples[i];if(!Number.isFinite(s.pace)||s.pace<=0)continue;
     const px=X(s.x),prev=i?samples[i-1].x:xMin,next=i+1<samples.length?samples[i+1].x:xMax;
     const available=Math.min((px-X(prev))*1.2,(X(next)-px)*1.2);
     const barW=mode==="lap"?Math.min(85,Math.max(10,available)):Math.max(3,Math.min(14,available||8));
     const y=Math.max(top,Math.min(bottom,Yp(s.pace)));
     svg+='<rect x="'+at(px-barW/2)+'" y="'+at(y)+'" width="'+at(barW)+'" height="'+at(bottom-y)+'" rx="2" fill="#d9814b" fill-opacity=".58" stroke="#c7743e" stroke-opacity=".65" data-run-point="'+i+'"/>';
   }
   const hrPts=samples.filter(s=>Number.isFinite(s.hr));
   if(hrPts.length>1)svg+='<polyline points="'+hrPts.map(s=>at(X(s.x))+","+at(Yh(s.hr))).join(" ")+'" fill="none" stroke="#2d6595" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>';
   for(const s of hrPts){const ix=samples.indexOf(s);svg+='<circle cx="'+at(X(s.x))+'" cy="'+at(Yh(s.hr))+'" r="3.8" stroke="#fff" stroke-width="1.3" fill="#2d6595" data-run-point="'+ix+'"/>';}
   if(mode==="lap"){
     samples.forEach((s,i)=>{const x=X(s.x);svg+='<text x="'+at(x)+'" y="247" text-anchor="middle" fill="#6b7e8f" font-size="11">L'+(i+1)+'</text><text x="'+at(x)+'" y="262" text-anchor="middle" fill="#8797a6" font-size="10">'+Math.round(n(laps[i].distance_m)||0)+'m</text>';});
     info.textContent=laps.length===1?"このFITのGarminラップは1件だよ。":"ラップ区間をタップすると距離・心拍・ペースを確認できるよ。";
   }else{
     for(let i=0;i<=5;i++){const x=left+(right-left)*i/5,v=xMin+(xMax-xMin)*i/5;svg+='<text x="'+at(x)+'" y="251" text-anchor="middle" fill="#6b7e8f">'+esc(mode==="time"?fmtTime(v):(v/1000).toFixed(1))+'</text>';}
     info.textContent="点や棒をタップすると、その区間の数値を確認できるよ。";
   }
   svg+='<text x="'+at((left+right)/2)+'" y="282" text-anchor="middle" fill="#6b7e8f">'+(mode==="time"?"経過時間":mode==="distance"?"累積距離 (km)":"Garminラップ (区間距離に比例)")+'</text></svg>';
   target.innerHTML=svg;
   target._pointSamples=samples;
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
       if(b.dataset.runAxis){state.axis=b.dataset.runAxis;renderGraph();root().querySelectorAll("[data-run-axis]").forEach(x=>{x.classList.toggle("active",x.dataset.runAxis===state.axis);x.setAttribute("aria-selected",x.dataset.runAxis===state.axis?"true":"false");});return;}
       if(b.dataset.runEdit!==undefined){state.editing=b.dataset.runEdit==="1";renderDetail();return;}
       if(b.dataset.runPoint!==undefined){
         const points=$("#run-plot")?._pointSamples||[],p=points[Number(b.dataset.runPoint)],out=$("#run-chart-info");if(!p||!out)return;
         out.textContent=state.axis==="lap"?(p.label+"・"+fmtDist(p.lap.distance_m)+"・"+fmtPaceSec(p.pace)+"・心拍 "+(finite(p.hr)?Math.round(p.hr)+" bpm":"—")):(p.label+"・ペース "+fmtPaceSec(p.pace)+"・心拍 "+(finite(p.hr)?Math.round(p.hr)+" bpm":"—"));
       }
     });
     root().addEventListener("submit",e=>{if(e.target.id==="run-edit-form"){e.preventDefault();save(e.target);}});
   }
 }
 window.FamilyRunning={init,load};
})();
})();
