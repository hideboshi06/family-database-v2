"use strict";
(function(){
  const $ = id => document.getElementById(id);
  const cfg = window.FD_CONFIG || {};
  const person = {kai:"カイ",papa:"パパ",mama:"ママ",event:"イベント",lunch:"給食"};
  const fields = ["kai","papa","mama","event"];
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const isoToday = () => {
    const pts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const pick=x=>pts.find(p=>p.type===x).value;
    return pick("year")+"-"+pick("month")+"-"+pick("day");
  };
  const dateAdd=(day,n)=>{let d=new Date(day+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  const weekday=day=>new Date(day+"T12:00:00Z").getUTCDay();
  const fmtDay=day=>Number(day.slice(5,7))+"/"+Number(day.slice(8))+"("+["日","月","火","水","木","金","土"][weekday(day)]+")";
  const weekend=day=>weekday(day)===0?"sun":weekday(day)===6?"sat":"";
  const monthDays=month=>{
    const [y,m]=month.split("-").map(Number);
    return Array.from({length:new Date(Date.UTC(y,m,0)).getUTCDate()},(_,i)=>month+"-"+String(i+1).padStart(2,"0"));
  };
  const state={client:null,user:null,role:null,tab:"dashboard",daily:[],shopping:[],cleaning:[],members:[],
    month:isoToday().slice(0,7),mode:"schedule",monthCache:null,monthRows:new Map(),draft:new Map(),opened:new Set()};
  let toastTimeout;
  const check = r => {if(r.error)throw r.error;return r.data;};
  const errorText=e=>e?.message||String(e);
  function toast(message,isError=false){
    const el=$("toast");el.hidden=false;el.textContent=message;el.style.background=isError?"#984952":"#2d485f";
    clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.hidden=true,3500);
  }
  function report(e,prefix=""){console.error(prefix,e);toast(prefix+errorText(e),true);}
  function show(id){["loading","login","denied","main"].forEach(x=>$(x).hidden=(x!==id));}
  function modal(title,content,footer){
    $("modal-title").textContent=title;
    $("modal-content").innerHTML=content;
    $("modal-actions").innerHTML=footer;
    $("modal").hidden=false;
  }
  function closeModal(){$("modal").hidden=true;$("modal-content").innerHTML="";}
  function actions(){return '<button class="btn secondary" type="button" data-action="close">キャンセル</button><button class="btn" type="submit" form="modal-form">保存</button>';}
  function navigate(page){
    state.tab=page;
    document.querySelectorAll(".page").forEach(el=>el.classList.toggle("active",el.id==="page-"+page));
    document.querySelectorAll("[data-tab]").forEach(el=>el.classList.toggle("active",el.dataset.tab===page));
    if(page==="month"){renderMonth();loadMonth().catch(e=>report(e,"月間読込: "));}
    if(page==="shopping")renderShopping();
    if(page==="cleaning")renderCleaning();
    if(page==="settings")loadMembers().catch(e=>report(e,"メンバー読込: "));
    scrollTo(0,0);
  }
  async function init(){
    document.addEventListener("click",click);
    document.addEventListener("change",change);
    document.addEventListener("input",input);
    document.addEventListener("submit",submit);
    window.addEventListener("beforeunload",e=>{
      if(state.draft.size){e.preventDefault();e.returnValue="";}
    });
    if(!window.supabase?.createClient||!cfg.url||!cfg.key){
      show("login");$("login-button").disabled=true;$("login-error").textContent="ログイン用ライブラリが読み込めませんでした。再読み込みしてください。";$("login-error").hidden=false;return;
    }
    state.client=window.supabase.createClient(cfg.url,cfg.key,{auth:{flowType:"pkce",persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    try{
      const s=await state.client.auth.getSession();check(s);
      if(!s.data.session){show("login");return;}
      const u=await state.client.auth.getUser();check(u);
      const email=(u.data.user?.email||"").toLowerCase();
      if(!email)throw Error("メールアドレスを確認できません");
      const m=await state.client.from("family_members").select("role").eq("email",email).maybeSingle();
      check(m);
      if(!m.data){$("denied-email").textContent=email;show("denied");return;}
      state.user=u.data.user;state.role=m.data.role;
      $("settings-admin").hidden=state.role!=="admin";
      show("main");navigate("dashboard");
      if(location.search.includes("code="))history.replaceState(null,"",location.pathname);
      await refresh();
    }catch(e){
      show("login");$("login-error").textContent="ログイン確認: "+errorText(e);$("login-error").hidden=false;
    }
  }
  function isIPad(){
    return /iPad/i.test(navigator.userAgent) ||
      (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
  }
  async function signIn(){
    const button=$("login-button"),link=$("oauth-continue"),help=$("login-flow-help");
    button.disabled=true;$("login-error").hidden=true;link.hidden=true;
    help.textContent="Googleのログイン画面を準備しています…";
    try{
      const tablet=isIPad();
      const options={redirectTo:location.origin+location.pathname,skipBrowserRedirect:true};
      // The forced account chooser can be unstable in older iPad webviews.
      if(!tablet)options.queryParams={prompt:"select_account"};
      const {data,error}=await state.client.auth.signInWithOAuth({provider:"google",options});
      if(error)throw error;
      if(!data?.url)throw Error("GoogleログインのURLを取得できませんでした");
      // The OAuth destination must be our own Supabase Auth endpoint.
      const target=new URL(data.url),expected=new URL(cfg.url);
      if(target.origin!==expected.origin||target.pathname!=="/auth/v1/authorize")
        throw Error("ログイン先を検証できませんでした");
      link.href=target.href;
      link.hidden=false;
      if(tablet){
        button.hidden=true;
        help.textContent="下のリンクを押してGoogleログインへ進んでください。";
        $("oauth-ipad-tip").hidden=false;
      }else{
        // Keep the normal one-tap experience on browsers where it works.
        location.assign(target.href);
      }
    }catch(error){
      button.hidden=false;button.disabled=false;
      help.textContent="Googleログイン後、このページに戻ります。";
      $("login-error").textContent="ログイン開始: "+errorText(error);
      $("login-error").hidden=false;
    }
  }
  async function signOut(){
    const r=await state.client.auth.signOut();check(r);
    state.user=null;state.draft.clear();show("login");$("login-button").disabled=false;
  }
  async function refresh(){
    $("page-status").textContent="データを読み込み中…";
    const [d,c,s]=await Promise.all([
      state.client.from("daily").select("*").gte("day",isoToday()).lte("day",dateAdd(isoToday(),8)).order("day"),
      state.client.from("cleaning").select("*").order("id"),
      state.client.from("shopping").select("*").order("sort_order",{ascending:true,nullsFirst:false})
    ]);
    state.daily=check(d);state.cleaning=check(c);state.shopping=check(s);
    renderDashboard();renderShopping();renderCleaning();
    $("page-status").textContent="Supabase接続中 · "+new Date().toLocaleTimeString("ja-JP",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit"})+" 読込";
  }
  function line(label,value){
    return value?'<div class="scheduleline"><span class="who">'+esc(label)+'</span><span class="schedule-text">'+esc(value)+'</span></div>':"";
  }
  function weatherEmoji(condition){
    const text=String(condition||"").trim();
    if(!text)return "❔";
    // Older imported sheet data may already contain a weather emoji.
    const existing=text.match(/[☀🌤⛅🌥☁🌦🌧⛈🌩🌨❄🌙🌫]/u);
    if(existing&&!/[ぁ-んァ-ン一-龯]/u.test(text))return existing[0]==="☀"?"☀️":existing[0];
    if(/雷|稲妻/i.test(text))return "⛈️";
    if(/雪|吹雪|みぞれ|霰|雹|氷粒/i.test(text))return "❄️";
    if(/雨|小雨|霧雨|豪雨|にわか雨|しぐれ/i.test(text))return "🌧️";
    if(/霧|もや|靄|霞/i.test(text))return "🌫️";
    if(/晴|快晴/i.test(text)&&/曇|くもり|雲/i.test(text))return "⛅";
    if(/曇|くもり|雲/i.test(text))return "☁️";
    if(/晴|快晴|日差し/i.test(text))return "☀️";
    return existing?existing[0]:text;
  }
  function weatherPart(w,t,r,compact=false){
    if(w==null&&t==null&&r==null)return "未登録";
    const condition=String(w||"");
    const icon=weatherEmoji(condition);
    const rain=r==null?"–":esc(r);
    // The umbrella appears to the right of precipitation probability at 60% or more.
    const umbrella=r!=null&&Number.parseFloat(String(r))>=60
      ?' <span class="rain-alert" role="img" aria-label="傘が必要な降水確率">☂️</span>':"";
    const gap=compact?"":" ";
    return '<span class="weather-icon" role="img" aria-label="'+esc(condition||"天気不明")+'">'+esc(icon)+'</span>'+gap+
      (t==null?"–":esc(t))+"℃"+gap+rain+"%"+umbrella;
  }
  function shoppingRow(x,brief=false){
    return '<div class="itemrow"><label class="checkboxlabel"><input type="checkbox" data-action="shopping-needed" data-id="'+esc(x.id)+'" '+(x.needed?"checked":"")+'><span class="itemmain"><span class="item-title">'+esc(x.product)+(x.quantity?' <span class="tiny">×'+esc(x.quantity)+'</span>':"")+'</span><span class="item-sub" style="display:block">'+esc(brief?(x.note||""):[x.note,x.store].filter(Boolean).join(" · "))+'</span></span></label>'+
      (brief?"":'<button type="button" class="btn secondary smallbtn" data-action="edit-shopping" data-id="'+esc(x.id)+'">編集</button>')+'</div>';
  }
  function filledAgendaFields(row){
    return fields.filter(k=>row[k]&&String(row[k]).trim());
  }
  function agendaDetails(day,row,compact=false){
    const lines=filledAgendaFields(row).map(k=>line(person[k],row[k])).join("");
    return '<div class="dayrow'+(compact?' dayrow-inline':'')+'">'+
      (compact?"":'<button type="button" data-action="edit-day" data-day="'+day+'" class="daydate '+weekend(day)+'">'+fmtDay(day)+'</button>')+
      '<div class="daycontent">'+(lines||'<div class="empty">予定なし</div>')+'</div></div>';
  }
  function shortSummary(items,label){
    if(!items.length)return "なし";
    const names=items.slice(0,2).map(label).filter(Boolean).join("、");
    return items.length+"件"+(names?" · "+names:"")+(items.length>2?" ほか"+(items.length-2)+"件":"");
  }
  function renderDashboard(){
    const today=isoToday(),byDate=new Map(state.daily.map(x=>[x.day,x])),now=byDate.get(today)||{};
    $("today-date").textContent=fmtDay(today);
    $("today-date").dataset.day=today;
    $("weather-summary").innerHTML='<div class="weather-summary"><strong>朝</strong> '+weatherPart(now.morning_weather,now.morning_temp_c,now.morning_rain_pct)+' <span class="muted">／</span> <strong>夕</strong> '+weatherPart(now.evening_weather,now.evening_temp_c,now.evening_rain_pct)+'</div>';
    $("today-lunch").textContent=now.lunch||"未登録";
    $("today-garbage").textContent=now.garbage||"未登録";
    const todayHasPlans=filledAgendaFields(now).length>0;
    $("today-agenda-block").hidden=!todayHasPlans;
    $("today-schedule").innerHTML=todayHasPlans?agendaDetails(today,now,true):"";
    const due=state.cleaning.filter(c=>!c.next_due||c.next_due<=today);
    const needed=state.shopping.filter(x=>x.needed);
    $("today-cleaning").textContent=shortSummary(due,c=>String(c.name||"").trim());
    $("today-shopping").textContent=shortSummary(needed,x=>String(x.product||"").trim());

    const tomorrow=dateAdd(today,1),next=byDate.get(tomorrow)||{};
    $("tomorrow-title").textContent=fmtDay(tomorrow);
    $("tomorrow-title").dataset.day=tomorrow;
    $("tomorrow-weather").innerHTML='<span class="tomorrow-forecast"><strong>朝</strong> '+weatherPart(next.morning_weather,next.morning_temp_c,next.morning_rain_pct)+'</span>'+
      ' <span class="muted">／</span> <span class="tomorrow-forecast"><strong>夕</strong> '+weatherPart(next.evening_weather,next.evening_temp_c,next.evening_rain_pct)+'</span>';
    $("tomorrow-lunch").textContent=next.lunch||"未登録";
    $("tomorrow-garbage").textContent=next.garbage||"未登録";
    const tomorrowHasPlans=filledAgendaFields(next).length>0;
    $("tomorrow-agenda-block").hidden=!tomorrowHasPlans;
    $("tomorrow-schedule").innerHTML=tomorrowHasPlans?agendaDetails(tomorrow,next,true):"";

    const upcoming=Array.from({length:7},(_,i)=>dateAdd(today,i+2))
      .filter(day=>filledAgendaFields(byDate.get(day)||{}).length>0);
    $("future-card").hidden=!upcoming.length;
    $("schedule-list").innerHTML=upcoming.map(day=>agendaDetails(day,byDate.get(day)||{})).join("");
  }
  function renderShopping(){
    const filter=$("shopping-filter").value;
    const rows=state.shopping.filter(x=>filter==="all"||filter==="needed"&&x.needed||filter==="quick"&&x.quick_display);
    $("shopping-items").innerHTML=rows.length?rows.map(x=>shoppingRow(x)).join(""):'<p class="empty">該当する商品がありません</p>';
  }
  function renderCleaning(){
    $("cleaning-items").innerHTML=state.cleaning.map(c=>'<div class="itemrow"><div class="itemmain"><div class="item-title">'+esc(c.name)+'</div><div class="item-sub">周期 '+esc(c.interval_days||"未設定")+'日 · 最終 '+esc(c.last_done||"—")+' · 次回 '+esc(c.next_due||"—")+'</div></div><button type="button" class="btn secondary smallbtn" data-action="done-clean" data-id="'+esc(c.id)+'">完了</button></div>').join("")||'<p class="empty">掃除項目はありません</p>';
  }
  async function updateDay(day,values){
    const exists=check(await state.client.from("daily").select("day").eq("day",day).maybeSingle());
    const data={...values,updated_at:new Date().toISOString()};
    const r=exists?await state.client.from("daily").update(data).eq("day",day):
      await state.client.from("daily").insert({day,...data});
    check(r);
  }
  async function editDay(day){
    let row=state.daily.find(x=>x.day===day);
    if(!row)row=check(await state.client.from("daily").select("*").eq("day",day).maybeSingle())||{};
    const html='<form id="modal-form" data-kind="day"><input type="hidden" name="day" value="'+esc(day)+'">'+
      fields.map(k=>'<label class="field">'+person[k]+'</label><textarea name="'+k+'" rows="2">'+esc(row[k]||"")+'</textarea>').join("")+'</form>';
    modal(fmtDay(day)+" の予定",html,actions());
  }
  async function editShopping(id){
    const x=state.shopping.find(a=>a.id===id)||{};
    const html='<form id="modal-form" data-kind="shopping"><input type="hidden" name="id" value="'+esc(id||"")+'">'+
      Object.entries({product:"商品名",quantity:"数量",category:"カテゴリ",store:"購入場所",note:"メモ"}).map(([k,v])=>'<label class="field">'+v+'</label>'+(k==="note"?'<textarea name="'+k+'" rows="3">'+esc(x[k]||"")+'</textarea>':'<input class="input" name="'+k+'" value="'+esc(x[k]||(k==="quantity"?"1":""))+'" '+(k==="product"?"required maxlength='150'":"")+'>')).join("")+'</form>';
    modal(id?"商品を編集":"買い物を追加",html,actions());
  }
  function monthValue(day,k){
    const change=state.draft.get(day);
    return change&&Object.prototype.hasOwnProperty.call(change,k)?change[k]:(state.monthRows.get(day)?.[k]||"");
  }
  function renderMonth(){
    const arr=monthDays(state.month),f=state.mode==="lunch"?["lunch"]:fields;
    $("month-title").textContent=Number(state.month.slice(0,4))+"年"+Number(state.month.slice(5))+"月";
    $("mode-schedule").classList.toggle("active",state.mode==="schedule");
    $("mode-lunch").classList.toggle("active",state.mode==="lunch");
    $("month-days").innerHTML=arr.map(day=>{
      const changed=state.draft.has(day),opened=state.opened.has(day);
      const preview=f.map(k=>monthValue(day,k)).filter(Boolean).map(x=>String(x).replace(/\s+/g," ").slice(0,20)).join(" / ");
      return '<div class="monthday'+(changed?" dirty":"")+'"><button type="button" class="monthtop" data-action="expand-day" data-day="'+day+'"><span class="monthdate '+weekend(day)+'">'+fmtDay(day)+(changed?'<span class="changedmark">変更</span>':"")+'</span><span class="monthpreview">'+esc(preview||"未入力")+'</span><span class="tiny">'+(opened?"▲":"▼")+'</span></button>'+
        (opened?'<div class="monthfields">'+f.map(k=>'<label class="field">'+person[k]+'</label><textarea data-month-field="'+k+'" data-day="'+day+'" rows="'+(k==="lunch"?5:2)+'" placeholder="'+person[k]+'を入力・貼り付け">'+esc(monthValue(day,k))+'</textarea>').join("")+'</div>':"")+'</div>';
    }).join("");
    updateCount();
  }
  function updateCount(){
    const n=[...state.draft.keys()].filter(d=>d.startsWith(state.month)).length;
    $("save-count").textContent=n+"日分の変更";
    $("save-month").disabled=n===0;
  }
  function updateDraft(el){
    const d=el.dataset.day,k=el.dataset.monthField,v=el.value,old=state.monthRows.get(d)?.[k]||"";
    const ch=state.draft.get(d)||{};
    if(v===old)delete ch[k];else ch[k]=v;
    if(Object.keys(ch).length)state.draft.set(d,ch);else state.draft.delete(d);
    el.closest(".monthday").classList.toggle("dirty",state.draft.has(d));
    updateCount();
  }
  async function loadMonth(force=false){
    if(!force&&state.monthCache===state.month)return;
    const dates=monthDays(state.month);
    const r=await state.client.from("daily").select("day,kai,papa,mama,event,lunch").gte("day",dates[0]).lte("day",dates[dates.length-1]).order("day");
    state.monthRows=new Map(check(r).map(x=>[x.day,x]));
    state.monthCache=state.month;renderMonth();
  }
  async function stepMonth(n){
    if(state.draft.size&&!confirm("未保存の入力内容を破棄して月を変更しますか？"))return;
    state.draft.clear();state.opened.clear();
    const [y,m]=state.month.split("-").map(Number);
    state.month=new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,7);
    state.monthCache=null;renderMonth();await loadMonth(true);
  }
  async function saveMonth(){
    const work=[...state.draft].filter(([d])=>d.startsWith(state.month));
    if(!work.length)return;
    const b=$("save-month");b.disabled=true;b.textContent="保存中…";
    let count=0,fail=[];
    for(let i=0;i<work.length;i+=4){
      await Promise.all(work.slice(i,i+4).map(async([day,ch])=>{
        try{await updateDay(day,Object.fromEntries(Object.entries(ch).map(([k,v])=>[k,v.trim()||null])));state.draft.delete(day);count++;}
        catch(e){fail.push(fmtDay(day)+" "+errorText(e));}
      }));
    }
    b.textContent="まとめて保存";
    if(count)toast(count+"日分を保存したよ！");
    if(fail.length)toast("保存失敗: "+fail.slice(0,2).join(", "),true);
    await loadMonth(true);await refresh();
  }
  async function finishCleaning(id){
    const x=state.cleaning.find(c=>c.id===id);if(!x)return;
    if(!confirm("「"+x.name+"」を今日完了にする？"))return;
    const today=isoToday(),next=x.interval_days?dateAdd(today,Number(x.interval_days)):null;
    check(await state.client.from("cleaning").update({last_done:today,next_due:next,updated_at:new Date().toISOString()}).eq("id",id));
    await refresh();toast("掃除を完了にしたよ！");
  }
  async function toggleShopping(el){
    const checked=el.checked;el.disabled=true;
    try{
      check(await state.client.from("shopping").update({needed:checked,updated_at:new Date().toISOString()}).eq("id",el.dataset.id));
      await refresh();toast("買い物リストを更新したよ！");
    }catch(e){el.checked=!checked;report(e,"買い物更新: ");}
    finally{el.disabled=false;}
  }
  async function loadMembers(){
    $("settings-user").textContent=state.user?.email||"";
    if(state.role!=="admin")return;
    state.members=check(await state.client.from("family_members").select("email,role").order("email"));
    $("member-list").innerHTML=state.members.map(x=>'<div class="between settings-member"><div><strong>'+esc(x.email)+'</strong><div class="small">'+(x.role==="admin"?"管理者":"編集可能")+'</div></div>'+
      (x.role==="member"?'<button type="button" class="btn secondary smallbtn danger" data-action="remove-member" data-email="'+esc(x.email)+'">削除</button>':"")+'</div>').join("");
  }
  async function addMember(form){
    const email=String(new FormData(form).get("email")||"").trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error("メールアドレスを確認してね");
    check(await state.client.from("family_members").insert({email,role:"member"}));
    form.reset();await loadMembers();toast("家族を追加したよ！");
  }
  async function removeMember(email){
    if(state.role!=="admin"||email===state.user.email)return;
    if(!confirm(email+" のアクセス許可を削除する？"))return;
    check(await state.client.from("family_members").delete().eq("email",email).eq("role","member"));
    await loadMembers();toast("アクセス許可を削除したよ");
  }
  async function submitModal(form){
    const fd=new FormData(form),kind=form.dataset.kind;
    const b=$("modal-actions").querySelector('button[type="submit"]');b.disabled=true;
    try{
      if(kind==="day"){
        const data={};fields.forEach(k=>data[k]=String(fd.get(k)||"").trim()||null);
        await updateDay(String(fd.get("day")),data);
        state.monthCache=null;
      }else if(kind==="shopping"){
        const id=String(fd.get("id")||"");
        const props={product:String(fd.get("product")||"").trim(),quantity:String(fd.get("quantity")||"").trim()||null,category:String(fd.get("category")||"").trim()||null,store:String(fd.get("store")||"").trim()||null,note:String(fd.get("note")||"").trim()||null,updated_at:new Date().toISOString()};
        if(!props.product)throw Error("商品名を入力してね");
        const existing=state.shopping.some(x=>x.id===id);
        if(existing)check(await state.client.from("shopping").update(props).eq("id",id));
        else check(await state.client.from("shopping").insert({...props,id:"item-"+(crypto.randomUUID?.()||String(Date.now())+Math.random().toString(36).slice(2)),needed:true,quick_display:true,sort_order:Math.max(0,...state.shopping.map(x=>Number(x.sort_order)||0))+1}));
      }
      closeModal();await refresh();toast("保存したよ！");
    }catch(e){b.disabled=false;report(e,"保存: ");}
  }
  async function click(e){
    const el=e.target.closest("[data-action],[data-tab]");if(!el)return;
    if(el.dataset.tab){navigate(el.dataset.tab);return;}
    const a=el.dataset.action;
    try{
      if(a==="login")await signIn();
      if(a==="logout"||a==="switch")await signOut();
      if(a==="refresh"){await refresh();toast("更新したよ！");}
      if(a==="edit-day")await editDay(el.dataset.day);
      if(a==="close")closeModal();
      if(a==="expand-day"){const d=el.dataset.day;state.opened.has(d)?state.opened.delete(d):state.opened.add(d);renderMonth();}
      if(a==="mode"){state.mode=el.dataset.mode;renderMonth();}
      if(a==="prev")await stepMonth(-1);
      if(a==="next")await stepMonth(1);
      if(a==="expand-all"){state.opened=new Set(monthDays(state.month));renderMonth();}
      if(a==="collapse-all"){state.opened.clear();renderMonth();}
      if(a==="save-month")await saveMonth();
      if(a==="done-clean")await finishCleaning(el.dataset.id);
      if(a==="add-shopping")await editShopping("");
      if(a==="edit-shopping")await editShopping(el.dataset.id);
      if(a==="remove-member")await removeMember(el.dataset.email);
    }catch(error){report(error,"操作エラー: ");}
  }
  function change(e){
    if(e.target.matches('input[data-action="shopping-needed"]'))toggleShopping(e.target);
    if(e.target.id==="shopping-filter")renderShopping();
  }
  function input(e){if(e.target.matches("textarea[data-month-field]"))updateDraft(e.target);}
  async function submit(e){
    const form=e.target;if(!["modal-form","member-form"].includes(form.id))return;
    e.preventDefault();
    try{if(form.id==="modal-form")await submitModal(form);else await addMember(form);}
    catch(error){report(error,"追加失敗: ");}
  }
  document.addEventListener("DOMContentLoaded",init);
})();
