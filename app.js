"use strict";
(function(){
  const $ = id => document.getElementById(id);
  const cfg = window.FD_CONFIG || {};
  const person = {kai:"カイ",papa:"パパ",mama:"ママ",event:"イベント",lunch:"給食"};
  const fields = ["kai","papa","mama","event"];
  // One shared genre list and one canonical category field for both screens.
  const catalogGenres=[
    {name:"ホーム",icon:"🏠"},{name:"パパ",icon:"👨"},
    {name:"ママ",icon:"👩"},{name:"カイ",icon:"👦"},
    {name:"食品",icon:"🥬"},{name:"生活雑貨",icon:"🧴"},
    {name:"炊事",icon:"🍳"},{name:"アウトドア",icon:"🏕️"}
  ];
  const genreAliases={"家":"ホーム","キャンプ":"アウトドア","雑貨":"生活雑貨","育児":"カイ"};
  function itemGenre(x){
    const original=x.category||x.catalog_genre||"";
    const genre=genreAliases[original]||original;
    return catalogGenres.some(g=>g.name===genre)?genre:"生活雑貨";
  }
  // Shopping groups are display-only; the shared master keeps eight genres.
  const shoppingGroup=x=>{
    const genre=itemGenre(x);
    return genre==="食品"||genre==="生活雑貨"?genre:"その他";
  };
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const isoToday = () => {
    const pts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const pick=x=>pts.find(p=>p.type===x).value;
    return pick("year")+"-"+pick("month")+"-"+pick("day");
  };
  const dateAdd=(day,n)=>{let d=new Date(day+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  const weekday=day=>new Date(day+"T12:00:00Z").getUTCDay();
  const fmtDay=day=>Number(day.slice(5,7))+"/"+Number(day.slice(8))+"("+["日","月","火","水","木","金","土"][weekday(day)]+")";
  // Japan Cabinet Office holidays for 2026-2027, including substitute and bridge holidays.
  // Update the year-specific table after the government announces subsequent dates.
  const holidays={"2026":{"01-01":"元日","01-12":"成人の日","02-11":"建国記念の日","02-23":"天皇誕生日","03-20":"春分の日","04-29":"昭和の日","05-03":"憲法記念日","05-04":"みどりの日","05-05":"こどもの日","05-06":"振替休日","07-20":"海の日","08-11":"山の日","09-21":"敬老の日","09-22":"国民の休日","09-23":"秋分の日","10-12":"スポーツの日","11-03":"文化の日","11-23":"勤労感謝の日"},"2027":{"01-01":"元日","01-11":"成人の日","02-11":"建国記念の日","02-23":"天皇誕生日","03-21":"春分の日","03-22":"振替休日","04-29":"昭和の日","05-03":"憲法記念日","05-04":"みどりの日","05-05":"こどもの日","07-19":"海の日","08-11":"山の日","09-20":"敬老の日","09-23":"秋分の日","10-11":"スポーツの日","11-03":"文化の日","11-23":"勤労感謝の日"}};
  const holidayName=day=>holidays[day.slice(0,4)]?.[day.slice(5)]||"";
  const weekend=day=>weekday(day)===0||holidayName(day)?"sun":weekday(day)===6?"sat":"";
  const monthDays=month=>{
    const [y,m]=month.split("-").map(Number);
    return Array.from({length:new Date(Date.UTC(y,m,0)).getUTCDate()},(_,i)=>month+"-"+String(i+1).padStart(2,"0"));
  };
  const state={client:null,user:null,role:null,tab:"dashboard",daily:[],shopping:[],cleaning:[],members:[],
    month:isoToday().slice(0,7),mode:"schedule",monthCache:null,monthRows:new Map(),draft:new Map(),opened:new Set(),
    tasks:[],shoppingCategory:"食品",showCompleted:false,catalog:[],catalogGenre:"ホーム",
    catalogImageUrls:new Map()};
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
    $("modal-save-status").hidden=true;
    $("modal-save-status").textContent="";
    $("modal").hidden=false;
  }
  function closeModal(){$("modal").hidden=true;$("modal-content").innerHTML="";}
  // Use a real click handler instead of a form-associated button outside the form:
  // iOS Safari standalone/webview may not dispatch submit for that layout.
  function actions(){return '<button class="btn secondary" type="button" data-action="close">キャンセル</button><button class="btn" type="button" data-action="save-modal">保存</button>';}
  function navigate(page){
    if(page==="catalog"&&state.role!=="admin")return;
    state.tab=page;
    document.querySelectorAll(".page").forEach(el=>el.classList.toggle("active",el.id==="page-"+page));
    document.querySelectorAll(".tabbar [data-tab]").forEach(el=>el.classList.toggle("active",el.dataset.tab===(page==="month"?"dashboard":page)));
    if(page==="month"){renderMonth();loadMonth().catch(e=>report(e,"月間読込: "));}
    if(page==="todo")renderTodo();
    if(page==="catalog")renderCatalog();
    if(page==="settings"){
      refreshPushDeviceStatus().catch(e=>report(e,"受信端末: "));
      loadMembers().catch(e=>report(e,"メンバー読込: "));
      if(state.role==="admin")loadNotificationSettings().catch(e=>{
        $("notification-time-status").textContent="時刻の読み込みに失敗しました: "+errorText(e);
        report(e,"通知設定読込: ");
      });
    }
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
      $("page-catalog").hidden=state.role!=="admin";
      $("catalog-tab").hidden=state.role!=="admin";
      $("notification-admin-controls").hidden=state.role!=="admin";
      show("main");navigate("dashboard");
      if("serviceWorker" in navigator)
        navigator.serviceWorker.register("./sw.js",{scope:"./"}).catch(e=>console.warn("Service Worker:",e));
      if(location.search.includes("code="))history.replaceState(null,"",location.pathname);
      await refresh();
    }catch(e){
      show("login");$("login-error").textContent="ログイン確認: "+errorText(e);$("login-error").hidden=false;
    }
  }
  async function invokePush(action,payload={}){
    const res=await state.client.functions.invoke("family-push",{body:{action,...payload}});
    if(res.error){
      let reason="";
      try{reason=(await res.error.context?.json())?.error||"";}catch{}
      const readable={no_registered_device:"先に管理者の端末を登録してください。",
        backend_missing:"サーバー設定を確認してください。",
        login_required:"再ログインしてください。",
        admin_only:"管理者専用の操作です。"};
      throw Error(readable[reason]||reason||res.error.message||"送信処理が失敗しました");
    }
    if(res.data?.error)throw Error(res.data.error);
    return res.data;
  }
  function assertPushReady(){
    if(!("serviceWorker" in navigator)||!("Notification" in window)||!("PushManager" in window))
      throw Error("この環境はプッシュ通知に対応していません");
    const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent||"");
    const standalone=window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true;
    if(ios&&!standalone)throw Error("ホーム画面に追加したFamily Databaseを開いてください");
  }
  async function refreshPushDeviceStatus(){
    if(!state.user)return;
    const status=$("push-device-status");
    try{
      assertPushReady();
      const reg=await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.getSubscription();
      if(!sub){
        status.textContent=Notification.permission==="denied"
          ?"通知が拒否されています。端末の設定で許可してください。"
          :"この端末はまだ登録されていません。";
        return;
      }
      const saved=check(await state.client.from("push_subscriptions").select("endpoint")
        .eq("endpoint",sub.endpoint).eq("user_id",state.user.id).maybeSingle());
      status.textContent=saved?"この端末は受信登録済みです。":"この端末はまだSupabaseに登録されていません。";
    }catch(e){status.textContent=errorText(e);}
  }
  function parseVapidPublicKey(value){
    const b64=value.replace(/-/g,"+").replace(/_/g,"/");
    const binary=atob(b64.padEnd(Math.ceil(b64.length/4)*4,"="));
    return Uint8Array.from(binary,c=>c.charCodeAt(0));
  }
  async function registerPushDevice(){
    if(!state.user)throw Error("ログインしてください");
    assertPushReady();
    const button=$("register-push-device");
    button.disabled=true;
    $("push-device-status").textContent="この端末を登録しています…";
    try{
      if(Notification.permission!=="granted"){
        const granted=await Notification.requestPermission();
        if(granted!=="granted")throw Error("通知の許可が必要です");
      }
      const reg=await navigator.serviceWorker.ready;
      const key=await invokePush("public-key");
      if(!key?.publicKey)throw Error("サーバー公開鍵の取得に失敗しました");
      let sub=await reg.pushManager.getSubscription();
      if(!sub)sub=await reg.pushManager.subscribe({
        userVisibleOnly:true,applicationServerKey:parseVapidPublicKey(key.publicKey)
      });
      const keys=sub.toJSON().keys||{};
      if(!keys.p256dh||!keys.auth)throw Error("端末の暗号鍵を確認できません");
      check(await state.client.from("push_subscriptions").upsert({
        endpoint:sub.endpoint,user_id:state.user.id,p256dh:keys.p256dh,auth:keys.auth,
        user_agent:(navigator.userAgent||"").slice(0,350),
        updated_at:new Date().toISOString()
      },{onConflict:"endpoint"}));
      await refreshPushDeviceStatus();
      toast("プッシュ通知の受信端末として登録したよ！");
    }catch(e){
      $("push-device-status").textContent="端末登録エラー: "+errorText(e);
      throw e;
    }finally{button.disabled=false;}
  }
  async function removePushDevice(){
    if(!state.user)throw Error("ログインしてください");
    assertPushReady();
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.getSubscription();
    if(!sub){await refreshPushDeviceStatus();return;}
    check(await state.client.from("push_subscriptions").delete().eq("endpoint",sub.endpoint)
      .eq("user_id",state.user.id));
    await sub.unsubscribe();
    await refreshPushDeviceStatus();
    toast("この端末の通知登録を解除したよ");
  }
  async function toggleAutomaticPush(){
    if(state.role!=="admin")throw Error("管理者専用です");
    const button=$("push-auto-toggle"),enabled=button.dataset.enabled==="true";
    const prompt=enabled?"家族全員への毎朝の自動配信を停止しますか？"
      :"登録済みの家族全員の端末へ、毎朝設定時刻に通知を配信します。開始しますか？ 旧ショートカット通知との二重配信に注意してください。";
    if(!confirm(prompt))return;
    button.disabled=true;
    try{
      await invokePush("set-delivery",{enabled:!enabled});
      await loadNotificationSettings();
      toast(enabled?"自動配信を停止したよ":"毎朝の自動配信を開始したよ！");
    }finally{button.disabled=false;}
  }
  async function loadNotificationSettings(){
    if(state.role!=="admin")return;
    const row=check(await state.client.from("notification_settings")
      .select("send_time,delivery_enabled").eq("id",1).single());
    const time=String(row.send_time||"05:30").slice(0,5);
    $("notification-time").value=time;
    $("notification-time-status").textContent="保存済み: "+time+"（日本時間）";
    const toggle=$("push-auto-toggle");
    toggle.dataset.enabled=String(!!row.delivery_enabled);
    toggle.textContent=row.delivery_enabled?"自動配信を停止":"自動配信を開始";
    $("push-auto-status").textContent=row.delivery_enabled
      ?"自動配信中：毎朝"+time+"（日本時間）"
      :"自動配信は停止中。開始すると登録済みの端末へ毎朝配信します。";
  }
  async function saveNotificationTime(){
    if(state.role!=="admin")throw Error("管理者専用の設定です");
    const input=$("notification-time"),time=String(input.value||"");
    if(!/^[0-2][0-9]:[0-5][0-9]$/.test(time)||Number(time.slice(0,2))>23)
      throw Error("通知時刻を正しく入力してください");
    const button=$("save-notification-time");
    if(button.disabled)return;
    button.disabled=true;
    button.textContent="保存中…";
    $("notification-time-status").textContent="通知時刻を保存しています…";
    try{
      // The DB grants administrators UPDATE on send_time only, not delivery_enabled.
      const saved=check(await state.client.from("notification_settings")
        .update({send_time:time+":00"}).eq("id",1).select("send_time,delivery_enabled").single());
      if(String(saved.send_time||"").slice(0,5)!==time)
        throw Error("保存結果の確認に失敗しました");
      await loadNotificationSettings();
      toast("通知時刻を"+time+"に保存したよ！");
    }catch(e){
      $("notification-time-status").textContent="保存できませんでした: "+errorText(e);
      report(e,"通知時刻: ");
    }finally{
      button.disabled=false;
      button.textContent="時刻を保存";
    }
  }
  async function signIn(){
    const button=$("login-button");
    button.disabled=true;
    $("login-error").hidden=true;
    try{
      const {error}=await state.client.auth.signInWithOAuth({
        provider:"google",
        options:{redirectTo:location.origin+location.pathname,queryParams:{prompt:"select_account"}}
      });
      if(error)throw error;
    }catch(e){
      button.disabled=false;
      $("login-error").textContent="Googleログイン: "+errorText(e);
      $("login-error").hidden=false;
    }
  }
  async function signOut(){
    const r=await state.client.auth.signOut();check(r);
    state.user=null;state.draft.clear();show("login");$("login-button").disabled=false;
  }
  async function refresh(){
    $("page-status").textContent="データを読み込み中…";
    const [d,c,s,t,catalog]=await Promise.all([
      state.client.from("daily").select("*").gte("day",isoToday()).lte("day",dateAdd(isoToday(),8)).order("day"),
      state.client.from("cleaning").select("*").order("id"),
      state.client.from("shopping").select("*").eq("shopping_list",true).order("sort_order",{ascending:true,nullsFirst:false}),
      state.client.from("tasks").select("*").order("created_at",{ascending:true}),
      state.role==="admin"?state.client.from("shopping").select("*").order("product"):Promise.resolve(null)
    ]);
    state.daily=check(d);state.cleaning=check(c);state.shopping=check(s);state.tasks=check(t);
    state.catalog=state.role==="admin"?check(catalog):[];
    renderDashboard();renderTodo();
    if(state.role==="admin")renderCatalog();
    $("page-status").textContent="Supabase接続中 · "+new Date().toLocaleTimeString("ja-JP",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit"})+" 読込";
  }
  const agendaUrlField=k=>k+"_url";
  function safeAgendaHref(value){
    const input=String(value||"").trim();
    if(!input)return "";
    try{
      const url=new URL(input);
      if(!["http:","https:"].includes(url.protocol)||!url.hostname||url.username||url.password)return "";
      return url.href;
    }catch{return "";}
  }
  function normalizeAgendaUrl(input,label){
    const raw=String(input||"").trim();
    if(!raw)return null;
    if(raw.length>2048)throw Error(label+"のHPリンクは2048文字以内にしてね");
    if(!/^(?:https?:\/\/)/i.test(raw)&&/^[a-z][a-z0-9+.-]*:/i.test(raw))
      throw Error(label+"のHPリンクはhttpかhttpsのURLを入力してね");
    const candidate=/^https?:\/\//i.test(raw)?raw:"https://"+raw;
    const href=safeAgendaHref(candidate);
    if(!href||href.length>2048||/[\s<>]/.test(raw))
      throw Error(label+"のHPリンクを確認してね（例: https://example.com）");
    return href;
  }
  function agendaHpIcon(label,value){
    const href=safeAgendaHref(value);
    if(!href)return "";
    return '<a class="agenda-hp-link" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer" aria-label="'+esc(label)+'のHPを開く" title="'+esc(label)+'のHPを開く">↗</a>';
  }
  function agendaUrlEditor(getValue,day){
    const current=fields.some(k=>String(getValue(agendaUrlField(k))||"").trim());
    const inMonth=!!day;
    const inputs=fields.map(k=>{
      const urlKey=agendaUrlField(k);
      const attrs=inMonth?' data-month-field="'+urlKey+'" data-day="'+esc(day)+'"':' name="'+urlKey+'"';
      return '<label class="field">'+person[k]+'のHP</label><input class="input agenda-url-input" type="text" inputmode="url" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="https://..."'+attrs+' value="'+esc(getValue(urlKey)||"")+'">';
    }).join("");
    return '<details class="agenda-url-editor"'+(current?' open':'')+'><summary>🔗 HPリンクを設定（任意）</summary><div class="agenda-url-fields">'+inputs+'</div></details>';
  }
  function line(label,value,url){
    return value?'<div class="scheduleline"><span class="who">'+esc(label)+'</span><span class="schedule-text">'+esc(value)+agendaHpIcon(label,url)+'</span></div>':"";
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
    return '<div class="itemrow"><label class="checkboxlabel"><input type="checkbox" data-action="shopping-needed" data-id="'+esc(x.id)+'" '+(x.needed?"checked":"")+'><span class="itemmain"><span class="item-title">'+esc(x.product)+'</span><span class="item-sub" style="display:block">'+esc(x.note||"")+'</span></span></label>'+
      (brief?"":'<button type="button" class="btn secondary smallbtn" data-action="edit-shopping" data-id="'+esc(x.id)+'">編集</button>')+'</div>';
  }
  function filledAgendaFields(row){
    return fields.filter(k=>row[k]&&String(row[k]).trim());
  }
  function agendaDetails(day,row,compact=false){
    const lines=filledAgendaFields(row).map(k=>line(person[k],row[k],row[agendaUrlField(k)])).join("");
    return '<div class="dayrow'+(compact?' dayrow-inline':'')+'">'+
      (compact?"":'<button type="button" data-action="edit-day" data-day="'+day+'" class="daydate '+weekend(day)+'">'+fmtDay(day)+(holidayName(day)?' <span class="holiday-name">'+esc(holidayName(day))+'</span>':"")+'</button>')+
      '<div class="daycontent">'+(lines||'<div class="empty">予定なし</div>')+'</div></div>';
  }
  // Today/tomorrow use the same two-column person labels as the future agenda.
  // No outer "予定" row, so entries line up with lunch and garbage.
  function renderDailyAgenda(id,row){
    const lines=filledAgendaFields(row).map(k=>line(person[k],row[k],row[agendaUrlField(k)])).join("");
    $(id).innerHTML=lines||line("予定","なし");
  }
  // Keep persisted item names untouched: cleaning suffixes are display-only.
  function cleaningScheduleName(raw){
    const name=String(raw||"").trim();
    if(!name)return "";
    if(name.endsWith("掃除"))return name;
    return name.replace(/(拭き|ふき)$/u,"")+"掃除";
  }
  function garbageScheduleLines(value){
    return String(value||"").split(/\r?\n/u).map(x=>x.trim()).filter(Boolean);
  }
  function dueCleaningToday(today){
    return state.cleaning
      .filter(c=>!c.next_due||c.next_due<=today)
      .map(c=>cleaningScheduleName(c.name)).filter(Boolean);
  }
  function dueTasksToday(today){
    return state.tasks
      .filter(t=>!t.completed&&(!t.due_on||t.due_on<=today))
      .sort(taskSort)
      .map(t=>String(t.title||"").trim()+(t.assignee?"("+t.assignee+")":""))
      .filter(Boolean);
  }
  function shoppingToday(){
    return state.shopping
      .filter(x=>x.needed)
      .map(x=>String(x.product||"").trim())
      .filter(Boolean);
  }
  function todoLinesHTML(lines){
    return lines.map(x=>'<div class="schedule-todo-line">'+esc(x)+'</div>').join("");
  }
  function setScheduleTodo(id,lines){
    $(id+"-block").hidden=!lines.length;
    $(id).innerHTML=todoLinesHTML(lines);
  }
  function shortSummary(items,label){
    if(!items.length)return "";
    const names=items.slice(0,2).map(label).filter(Boolean).join("、");
    return items.length+"件"+(names?" · "+names:"")+(items.length>2?" ほか"+(items.length-2)+"件":"");
  }
  function showOptional(id,value){
    $(id+"-block").hidden=!String(value||"").trim();
    $(id).textContent=value||"";
  }
  function setDayHeading(id,holidayId,day){
    const button=$(id),name=holidayName(day),tone=weekend(day);
    button.textContent=fmtDay(day);
    button.dataset.day=day;
    button.classList.toggle("sat",tone==="sat");
    button.classList.toggle("sun",tone==="sun");
    $(holidayId).textContent=name;
    $(holidayId).hidden=!name;
  }
  function renderDashboard(){
    const today=isoToday(),byDate=new Map(state.daily.map(x=>[x.day,x])),now=byDate.get(today)||{};
    setDayHeading("today-date","today-holiday",today);
    $("weather-summary").innerHTML='<div class="weather-summary"><strong>朝</strong> '+weatherPart(now.morning_weather,now.morning_temp_c,now.morning_rain_pct)+' <span class="muted">／</span> <strong>夕</strong> '+weatherPart(now.evening_weather,now.evening_temp_c,now.evening_rain_pct)+'</div>';
    renderDailyAgenda("today-schedule",now);
    showOptional("today-lunch",now.lunch);
    setScheduleTodo("today-garbage",garbageScheduleLines(now.garbage));
    setScheduleTodo("today-cleaning",dueCleaningToday(today));
    setScheduleTodo("today-task",dueTasksToday(today));
    setScheduleTodo("today-shopping",shoppingToday());

    const tomorrow=dateAdd(today,1),next=byDate.get(tomorrow)||{};
    setDayHeading("tomorrow-title","tomorrow-holiday",tomorrow);
    $("tomorrow-weather").innerHTML='<span class="tomorrow-forecast"><strong>朝</strong> '+weatherPart(next.morning_weather,next.morning_temp_c,next.morning_rain_pct)+'</span>'+
      ' <span class="muted">／</span> <span class="tomorrow-forecast"><strong>夕</strong> '+weatherPart(next.evening_weather,next.evening_temp_c,next.evening_rain_pct)+'</span>';
    renderDailyAgenda("tomorrow-schedule",next);
    showOptional("tomorrow-lunch",next.lunch);
    showOptional("tomorrow-garbage",next.garbage);

    // Always show all seven days from the day after tomorrow, including days without plans.
    const upcoming=Array.from({length:7},(_,i)=>dateAdd(today,i+2));
    $("future-card").hidden=!upcoming.length;
    $("schedule-list").innerHTML=upcoming.map(day=>agendaDetails(day,byDate.get(day)||{})).join("");
  }
  function taskSort(a,b){
    const d1=a.due_on||"9999-12-31",d2=b.due_on||"9999-12-31";
    return d1.localeCompare(d2)||String(a.created_at).localeCompare(String(b.created_at));
  }
  function taskDetail(t){
    return [t.assignee||"",t.due_on?fmtDay(t.due_on):""].filter(Boolean).join(" · ");
  }
  function todoRow(label,meta,kind,id,checked=false){
    const action=kind==="task"?"task-completed":kind==="shopping"?"todo-bought":"todo-cleaned";
    const badge=kind==="task"?"タスク":kind==="shopping"?"買い物":"掃除";
    const edited=kind==="task"?'<button type="button" class="btn ghost smallbtn task-edit" data-action="edit-task" data-id="'+esc(id)+'" aria-label="'+esc(label)+'を編集">編集</button>':"";
    return '<div class="todo-row'+(checked?" completed":"")+'"><label class="checkboxlabel todo-check"><input type="checkbox" data-action="'+action+'" data-id="'+esc(id)+'" '+(checked?"checked":"")+'><span class="todo-copy"><span class="todo-title">'+esc(label)+'</span><span class="todo-meta"><span class="todo-origin">'+badge+'</span>'+(meta?" · "+esc(meta):"")+'</span></span></label>'+edited+'</div>';
  }
  function renderTodo(){
    const today=isoToday();
    const openTasks=state.tasks.filter(t=>!t.completed).sort(taskSort);
    const dueCleaning=state.cleaning.filter(c=>!c.next_due||c.next_due<=today)
      .sort((a,b)=>String(a.next_due||"").localeCompare(String(b.next_due||"")));
    const needed=state.shopping.filter(x=>x.needed);
    const all=openTasks.map(t=>({kind:"task",id:t.id,label:t.title,meta:taskDetail(t),due:t.due_on||"9999-12-31"}))
      .concat(dueCleaning.map(c=>({kind:"cleaning",id:c.id,label:c.name,meta:c.next_due?fmtDay(c.next_due):"期限なし",due:c.next_due||"9999-12-31"})))
      .concat(needed.map(x=>({kind:"shopping",id:x.id,label:x.product,meta:x.category||"",due:"9999-12-31"})));
    const order={task:0,cleaning:1,shopping:2};
    all.sort((a,b)=>a.due.localeCompare(b.due)||order[a.kind]-order[b.kind]||a.label.localeCompare(b.label,"ja"));
    $("todo-items").innerHTML=all.length?all.map(t=>todoRow(t.label,t.meta,t.kind,t.id)).join(""):'<p class="empty">やることはありません</p>';
    $("todo-count").textContent=all.length?"("+all.length+")":"";
    const completed=state.tasks.filter(t=>t.completed).sort((a,b)=>String(b.completed_at||"").localeCompare(String(a.completed_at||"")));
    $("todo-show-completed").hidden=!completed.length;
    $("todo-show-completed").textContent="完了済み "+completed.length+"件 "+(state.showCompleted?"▲":"▼");
    $("todo-completed-list").hidden=!state.showCompleted||!completed.length;
    $("todo-completed-list").innerHTML=state.showCompleted?completed.map(t=>todoRow(t.title,taskDetail(t),"task",t.id,true)).join(""):"";
    renderShopping();renderCleaning();
  }
  function renderShopping(){
    const cats=["食品","生活雑貨","その他"];
    if(!cats.includes(state.shoppingCategory))state.shoppingCategory="食品";
    $("shopping-categories").innerHTML=cats.map(cat=>'<button type="button" data-action="shopping-category" data-category="'+esc(cat)+'" class="category-pill'+(state.shoppingCategory===cat?" active":"")+'">'+esc(cat)+'</button>').join("");
    const rows=state.shopping.filter(x=>shoppingGroup(x)===state.shoppingCategory);
    $("shopping-items").innerHTML=rows.length?rows.map(x=>shoppingRow(x)).join(""):'<p class="empty">このカテゴリの商品はありません</p>';
  }


  // Compress only on the device, once per upload. Never send an original large photo.
  const catalogPhotoBucket="family-item-images";
  const isCatalogPhotoPath=path=>/^items\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.jpg$/.test(String(path||""));
  async function resizeCatalogPhoto(file){
    if(!file||!file.size)throw Error("写真を選んでね");
    if(file.size>20*1024*1024)throw Error("写真は20MB以下のものを選んでね");
    if(!file.type.startsWith("image/"))throw Error("画像ファイルを選んでね");
    const source=URL.createObjectURL(file);
    let image;
    try{
      image=await new Promise((resolve,reject)=>{
        const img=new Image();
        img.onload=()=>resolve(img);
        img.onerror=()=>reject(Error("写真を読み込めませんでした。JPEGの写真でも試してね"));
        img.src=source;
      });
      if(!image.naturalWidth||!image.naturalHeight)throw Error("画像の大きさを確認できません");
      const canvas=document.createElement("canvas"),side=640;
      canvas.width=side;canvas.height=side;
      const context=canvas.getContext("2d");
      if(!context)throw Error("この端末では画像を加工できません");
      context.fillStyle="#fff";context.fillRect(0,0,side,side);
      const scale=Math.min(side/image.naturalWidth,side/image.naturalHeight);
      const w=Math.max(1,Math.round(image.naturalWidth*scale));
      const h=Math.max(1,Math.round(image.naturalHeight*scale));
      context.drawImage(image,(side-w)/2,(side-h)/2,w,h);
      let blob=null;
      for(const quality of [0.82,0.72,0.6]){
        blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
        if(!blob)throw Error("写真をJPEGに変換できませんでした");
        if(blob.size<=450*1024)break;
      }
      if(blob.size>1024*1024)throw Error("写真が大きすぎるため保存できません");
      return blob;
    }finally{URL.revokeObjectURL(source);}
  }
  async function showCatalogImages(){
    if(state.role!=="admin")return;
    const images=[...document.querySelectorAll("#catalog-items img[data-image-path]")];
    const now=Date.now(),paths=[...new Set(images.map(el=>el.dataset.imagePath))];
    const needed=paths.filter(path=>isCatalogPhotoPath(path)
      &&(!state.catalogImageUrls.has(path)||state.catalogImageUrls.get(path).expires<=now));
    if(needed.length){
      const signed=check(await state.client.storage.from(catalogPhotoBucket).createSignedUrls(needed,3600));
      signed.forEach((item,i)=>{
        if(item.signedUrl&&!item.error){
          const url=new URL(item.signedUrl,cfg.url);
          if(url.origin===new URL(cfg.url).origin)
            state.catalogImageUrls.set(needed[i],{url:url.href,expires:Date.now()+50*60*1000});
        }
      });
    }
    // Recheck the current DOM: the user may have switched genres while signing.
    document.querySelectorAll("#catalog-items img[data-image-path]").forEach(el=>{
      const entry=state.catalogImageUrls.get(el.dataset.imagePath);
      if(entry&&entry.expires>Date.now()){
        el.src=entry.url;
        el.hidden=false;
        const placeholder=el.parentElement.querySelector(".catalog-image-placeholder");
        if(placeholder)placeholder.hidden=true;
      }
    });
  }
  function chosenCatalogFile(fd){
    for(const name of ["photo_camera","photo_library"]){
      const file=fd.get(name);
      if(file instanceof File&&file.size>0)return file;
    }
    return null;
  }
  async function removeCatalogPhoto(path){
    if(!isCatalogPhotoPath(path))return;
    const result=await state.client.storage.from(catalogPhotoBucket).remove([path]);
    if(result.error)console.warn("Photo cleanup:",result.error);
    state.catalogImageUrls.delete(path);
  }
  function renderCatalog(){
    if(state.role!=="admin")return;
    const all=state.catalog;
    $("catalog-total").textContent=all.length+"品目";
    $("catalog-genres").innerHTML=catalogGenres.map(g=>{
      const count=all.filter(x=>itemGenre(x)===g.name).length;
      const active=state.catalogGenre===g.name;
      return '<button type="button" class="catalog-genre'+(active?" active":"")+'" data-action="catalog-genre" data-genre="'+esc(g.name)+'" aria-pressed="'+active+'"><span class="emoji">'+g.icon+'</span><span class="genre-name">'+esc(g.name)+'</span><span class="genre-count">'+count+'品目</span></button>';
    }).join("");
    const selected=catalogGenres.find(g=>g.name===state.catalogGenre)||catalogGenres[0];
    $("catalog-current-title").textContent=selected.icon+" "+selected.name+"の図鑑";
    const rows=all.filter(x=>itemGenre(x)===selected.name).sort((a,b)=>String(a.product).localeCompare(String(b.product),"ja"));
    $("catalog-current-count").textContent=rows.length+"品目";
    $("catalog-items").innerHTML=rows.map(x=>{
      const detail=[x.shopping_list?"🛒":null,x.needed?"今買うもの":null,x.arrived_on?"来た日 "+x.arrived_on:null,x.released_on?"手放した日 "+x.released_on:null,x.note||null].filter(Boolean).join(" · ");
      const hasPhoto=isCatalogPhotoPath(x.image);
      const picture='<div class="catalog-imagebox"><span class="catalog-image-placeholder" aria-hidden="true">📦</span>'+
        (hasPhoto?'<img class="catalog-thumb" data-image-path="'+esc(x.image)+'" alt="'+esc(x.product)+'の写真" loading="lazy" decoding="async" hidden>':"")+'</div>';
      return '<div class="catalog-row">'+picture+'<div class="catalog-row-main"><div class="catalog-item-name">'+esc(x.product)+'</div>'+(detail?'<div class="catalog-item-meta">'+esc(detail)+'</div>':"")+'</div><button class="btn secondary smallbtn" type="button" data-action="edit-catalog" data-id="'+esc(x.id)+'">編集</button></div>';
    }).join("")||'<p class="empty">まだ品目はありません。上の入力欄から登録できるよ。</p>';
    if(rows.some(x=>isCatalogPhotoPath(x.image)))
      showCatalogImages().catch(e=>console.warn("Photo display:",e));
  }
  async function addCatalog(form){
    if(state.role!=="admin")throw Error("管理者専用です");
    const product=String(new FormData(form).get("product")||"").trim(),genre=state.catalogGenre;
    if(!product||product.length>150)throw Error("品名は1〜150文字で入力してね");
    if(!catalogGenres.some(g=>g.name===genre))throw Error("ジャンルを確認してね");
    const b=form.querySelector('button[type="submit"]');b.disabled=true;
    try{
      check(await state.client.from("shopping").insert({
        id:"catalog-"+(crypto.randomUUID?.()||String(Date.now())+Math.random().toString(36).slice(2)),
        product,category:genre,shopping_list:false,
        needed:false,quick_display:false,updated_at:new Date().toISOString()
      }));
      form.reset();await refresh();toast("図鑑に登録したよ");
    }finally{b.disabled=false;}
  }
  function editCatalog(id){
    if(state.role!=="admin")throw Error("管理者専用です");
    const x=state.catalog.find(x=>x.id===id);
    if(!x)throw Error("品目が見つかりません");
    const genre=itemGenre(x);
    const html='<form id="modal-form" data-kind="catalog"><input type="hidden" name="id" value="'+esc(id)+'">'+
      '<label class="field">品名</label><input name="product" class="input" required maxlength="150" value="'+esc(x.product)+'">'+
      '<label class="field">ジャンル</label><select class="input" name="category">'+catalogGenres.map(g=>'<option value="'+esc(g.name)+'"'+(g.name===genre?" selected":"")+'>'+esc(g.name)+'</option>').join("")+'</select>'+
      '<label class="catalog-check"><input type="checkbox" name="shopping_list" data-action="catalog-shopping-list" '+(x.shopping_list?"checked":"")+'>買い物リストに登録（リピート用）</label>'+
      '<label class="catalog-check"><input type="checkbox" name="needed" '+(x.needed?"checked":"")+' '+(!x.shopping_list?"disabled":"")+'>今、買うもの</label>'+
      '<label class="field">メモ（任意）</label><textarea name="note" rows="3">'+esc(x.note||"")+'</textarea>'+
      '<div class="catalog-photo-editor"><label class="field">写真（任意）</label>'+
      '<div class="catalog-photo-buttons">'+
      '<label class="btn secondary smallbtn catalog-photo-button">📷 撮影する<input type="file" name="photo_camera" accept="image/*" capture="environment" data-action="catalog-photo-select" class="catalog-photo-input"></label>'+
      '<label class="btn secondary smallbtn catalog-photo-button">🖼️ 写真を選ぶ<input type="file" name="photo_library" accept="image/*" data-action="catalog-photo-select" class="catalog-photo-input"></label>'+
      '</div><p class="tiny" id="catalog-photo-status">'+(x.image?"写真を登録済み。別の写真を選ぶと差し替えられるよ。":"写真を選ばなくても登録できるよ。")+'</p>'+
      (x.image?'<label class="catalog-check"><input type="checkbox" name="remove_photo" data-action="catalog-remove-photo">写真を外す</label>':"")+
      '</div>'+
      '<details class="catalog-date-fields"'+((x.arrived_on||x.released_on)?" open":"")+'><summary>日付を入力（任意）</summary>'+
      '<label class="field">来た日</label><input type="date" class="input" name="arrived_on" value="'+esc(x.arrived_on||"")+'">'+
      '<label class="field">手放した日</label><input type="date" class="input" name="released_on" value="'+esc(x.released_on||"")+'"></details></form>';
    modal("図鑑の品目を編集",html,'<button type="button" class="btn secondary smallbtn danger" data-action="delete-catalog" data-id="'+esc(id)+'">削除</button>'+actions());
  }
  async function removeCatalog(id){
    if(state.role!=="admin")throw Error("管理者専用です");
    const x=state.catalog.find(x=>x.id===id);
    if(!x||!confirm("「"+x.product+"」を図鑑と買い物リストの両方から削除する？ 取り消しはできないよ。"))return;
    check(await state.client.from("shopping").delete().eq("id",id).select("id").single());
    if(x.image)await removeCatalogPhoto(x.image);
    closeModal();await refresh();toast("品目を削除したよ");
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
      fields.map(k=>'<label class="field">'+person[k]+'</label><textarea name="'+k+'" rows="2">'+esc(row[k]||"")+'</textarea>').join("")+
      agendaUrlEditor(key=>row[key])+'</form>';
    modal(fmtDay(day)+" の予定",html,actions());
  }
  async function editShopping(id){
    const x=state.shopping.find(a=>a.id===id)||{};
    const category=id?itemGenre(x):(state.shoppingCategory==="その他"?"ホーム":state.shoppingCategory);
    const html='<form id="modal-form" data-kind="shopping"><input type="hidden" name="id" value="'+esc(id||"")+'">'+
      '<label class="field" for="shopping-product">商品名</label><input class="input" name="product" id="shopping-product" value="'+esc(x.product||"")+'" required maxlength="150">'+
      '<label class="field">ジャンル</label><select class="input" name="category">'+catalogGenres.map(g=>'<option value="'+esc(g.name)+'" '+(g.name===category?"selected":"")+'>'+esc(g.name)+'</option>').join("")+'</select>'+
      '<label class="field">メモ（購入場所など）</label><textarea name="note" rows="3">'+esc(x.note||"")+'</textarea></form>';
    modal(id?"商品を編集":"買い物を追加",html,actions());
  }
  async function editTask(id){
    const t=state.tasks.find(x=>x.id===id)||{};
    const html='<form id="modal-form" data-kind="task"><input type="hidden" name="id" value="'+esc(t.id||"")+'">'+
      '<label class="field" for="task-title">やること名</label><input class="input" id="task-title" name="title" value="'+esc(t.title||"")+'" maxlength="200" required>'+
      '<label class="field" for="task-assignee">担当</label><select class="input" id="task-assignee" name="assignee">'+
      [["","指定なし"],["パパ","パパ"],["ママ","ママ"],["カイ","カイ"]].map(([v,label])=>'<option value="'+v+'" '+((t.assignee||"")===v?"selected":"")+'>'+label+'</option>').join("")+'</select>'+
      '<label class="field" for="task-date">予定日・期限（任意）</label><input class="input" id="task-date" type="date" name="due_on" value="'+esc(t.due_on||"")+'">'+
      '</form>';
    const footer='<button class="btn secondary" type="button" data-action="close">キャンセル</button>'+
      (id?'<button class="btn danger" type="button" data-action="delete-task" data-id="'+esc(id)+'">削除</button>':"")+
      '<button class="btn" type="button" data-action="save-modal">保存</button>';
    modal(id?"やることを編集":"やることを追加",html,footer);
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
      return '<div class="monthday'+(changed?" dirty":"")+'"><button type="button" class="monthtop" data-action="expand-day" data-day="'+day+'"><span class="monthdate '+weekend(day)+'">'+fmtDay(day)+(holidayName(day)?'<span class="holiday-name month-holiday">'+esc(holidayName(day))+'</span>':"")+(changed?'<span class="changedmark">変更</span>':"")+'</span><span class="monthpreview">'+esc(preview||"未入力")+'</span><span class="tiny">'+(opened?"▲":"▼")+'</span></button>'+
        (opened?'<div class="monthfields">'+f.map(k=>'<label class="field">'+person[k]+'</label><textarea data-month-field="'+k+'" data-day="'+day+'" rows="'+(k==="lunch"?5:2)+'" placeholder="'+person[k]+'を入力・貼り付け">'+esc(monthValue(day,k))+'</textarea>').join("")+
          (state.mode==="schedule"?agendaUrlEditor(key=>monthValue(day,key),day):"")+'</div>':"")+'</div>';
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
    const r=await state.client.from("daily").select("day,kai,papa,mama,event,lunch,kai_url,papa_url,mama_url,event_url").gte("day",dates[0]).lte("day",dates[dates.length-1]).order("day");
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
        try{
          const props=Object.fromEntries(Object.entries(ch).map(([k,v])=>[
            k,k.endsWith("_url")?normalizeAgendaUrl(v,person[k.replace(/_url$/,"")]||"予定"):String(v||"").trim()||null
          ]));
          await updateDay(day,props);state.draft.delete(day);count++;
        }
        catch(e){fail.push(fmtDay(day)+" "+errorText(e));}
      }));
    }
    b.textContent="まとめて保存";
    if(count)toast(count+"日分を保存したよ！");
    if(fail.length)toast("保存失敗: "+fail.slice(0,2).join(", "),true);
    await loadMonth(true);await refresh();
  }
  async function toggleTask(el){
    const checked=el.checked;el.disabled=true;
    try{
      check(await state.client.from("tasks").update({completed:checked,completed_at:checked?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("id",el.dataset.id));
      await refresh();toast(checked?"完了したよ！":"未完了に戻したよ");
    }catch(e){el.checked=!checked;report(e,"タスク更新: ");}
    finally{el.disabled=false;}
  }
  async function completeShopping(el){
    el.disabled=true;
    try{
      check(await state.client.from("shopping").update({needed:false,updated_at:new Date().toISOString()}).eq("id",el.dataset.id));
      await refresh();toast("買い物を完了したよ！");
    }catch(e){el.checked=false;report(e,"購入更新: ");}
    finally{el.disabled=false;}
  }
  async function completeCleaning(el){
    el.disabled=true;
    try{await finishCleaning(el.dataset.id);}
    catch(e){report(e,"掃除更新: ");}
    finally{el.checked=false;el.disabled=false;}
  }
  async function deleteTask(id){
    const t=state.tasks.find(t=>t.id===id);
    if(!t||!confirm("「"+t.title+"」を削除する？"))return;
    check(await state.client.from("tasks").delete().eq("id",id));
    closeModal();await refresh();toast("タスクを削除したよ");
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
    const b=$("modal-actions").querySelector('[data-action="save-modal"]');
    if(!b)throw Error("保存ボタンが見つかりません");
    b.disabled=true;
    b.textContent="保存中…";
    const status=$("modal-save-status");
    status.hidden=false;status.textContent="保存しています…";status.classList.remove("err");
    let savedTaskId=null;
    try{
      if(kind==="day"){
        const data={};fields.forEach(k=>{
          data[k]=String(fd.get(k)||"").trim()||null;
          data[agendaUrlField(k)]=normalizeAgendaUrl(fd.get(agendaUrlField(k)),person[k]);
        });
        await updateDay(String(fd.get("day")),data);
        state.monthCache=null;
      }else if(kind==="task"){
        const id=String(fd.get("id")||"");
        const props={title:String(fd.get("title")||"").trim(),assignee:String(fd.get("assignee")||"")||null,due_on:String(fd.get("due_on")||"")||null,updated_at:new Date().toISOString()};
        if(!props.title||props.title.length>200)throw Error("やること名を入力してください（200文字まで）");
        if(props.assignee&&!["パパ","ママ","カイ"].includes(props.assignee))throw Error("担当者を確認してください");
        const result=id
          ?await state.client.from("tasks").update(props).eq("id",id).select("id").single()
          :await state.client.from("tasks").insert(props).select("id").single();
        const saved=check(result);
        if(!saved?.id)throw Error("タスクの保存結果を確認できませんでした");
        savedTaskId=saved.id;
      }else if(kind==="shopping"){
        const id=String(fd.get("id")||"");
        const props={product:String(fd.get("product")||"").trim(),category:String(fd.get("category")||"").trim(),note:String(fd.get("note")||"").trim()||null,updated_at:new Date().toISOString()};
        if(!catalogGenres.some(g=>g.name===props.category))throw Error("ジャンルを確認してね");
        if(!props.product||props.product.length>150)throw Error("品名は1〜150文字で入力してね");
        if(state.shopping.some(x=>x.id===id))check(await state.client.from("shopping").update(props).eq("id",id));
        else check(await state.client.from("shopping").insert({...props,id:"item-"+(crypto.randomUUID?.()||String(Date.now())+Math.random().toString(36).slice(2)),shopping_list:true,needed:true,quick_display:true,sort_order:Math.max(0,...state.shopping.map(x=>Number(x.sort_order)||0))+1}));
      }else if(kind==="catalog"){
        if(state.role!=="admin")throw Error("図鑑は管理者専用です");
        const id=String(fd.get("id")||""),product=String(fd.get("product")||"").trim();
        const genre=String(fd.get("category")||""),listed=fd.get("shopping_list")==="on";
        if(!state.catalog.some(x=>x.id===id))throw Error("品目が見つかりません");
        if(!product||product.length>150)throw Error("品名は1〜150文字で入力してね");
        if(!catalogGenres.some(g=>g.name===genre))throw Error("ジャンルを確認してね");
        const props={product,category:genre,shopping_list:listed,needed:listed&&fd.get("needed")==="on",
          note:String(fd.get("note")||"").trim()||null,
          arrived_on:String(fd.get("arrived_on")||"")||null,released_on:String(fd.get("released_on")||"")||null,updated_at:new Date().toISOString()};
        const existing=state.catalog.find(x=>x.id===id),file=chosenCatalogFile(fd);
        const removePhoto=fd.get("remove_photo")==="on";
        let uploadedPath=null;
        try{
          if(file&&!removePhoto){
            status.textContent="写真を小さく整えています…";
            const jpeg=await resizeCatalogPhoto(file);
            uploadedPath="items/"+id+"/"+(crypto.randomUUID?.()||String(Date.now())+Math.random().toString(36).slice(2))+".jpg";
            status.textContent="写真を保存しています…";
            check(await state.client.storage.from(catalogPhotoBucket).upload(uploadedPath,jpeg,
              {contentType:"image/jpeg",cacheControl:"31536000",upsert:false}));
            props.image=uploadedPath;
          }else if(removePhoto)props.image=null;
          check(await state.client.from("shopping").update(props).eq("id",id).select("id").single());
        }catch(error){
          if(uploadedPath)await removeCatalogPhoto(uploadedPath);
          throw error;
        }
        if((uploadedPath||removePhoto)&&existing.image)
          await removeCatalogPhoto(existing.image);
      }
      await refresh();
      if(savedTaskId&&!state.tasks.some(t=>t.id===savedTaskId))
        throw Error("保存できましたが一覧へ反映されません。ページを更新してください");
      closeModal();toast("保存したよ！");
    }catch(e){
      b.disabled=false;b.textContent="保存";
      status.textContent="保存できませんでした: "+errorText(e);status.hidden=false;status.classList.add("err");
      report(e,"保存: ");
    }
  }
  async function click(e){
    const el=e.target.closest("[data-action],[data-tab]");if(!el)return;
    if(el.dataset.tab){navigate(el.dataset.tab);return;}
    const a=el.dataset.action;
    try{
      if(a==="login")await signIn();
      if(a==="logout"||a==="switch")await signOut();
      if(a==="reload"){location.reload();return;}
      if(a==="refresh"){await refresh();toast("更新したよ！");}
      if(a==="save-notification-time")await saveNotificationTime();
      if(a==="register-push-device")await registerPushDevice();
      if(a==="remove-push-device")await removePushDevice();
      if(a==="toggle-push-auto")await toggleAutomaticPush();
      if(a==="save-modal"){
        const form=$("modal-form");
        if(!form)throw Error("入力画面が見つかりません");
        if(typeof form.reportValidity==="function"&&!form.reportValidity())return;
        await submitModal(form);
      }
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
      if(a==="add-task")await editTask("");
      if(a==="edit-task")await editTask(el.dataset.id);
      if(a==="delete-task")await deleteTask(el.dataset.id);
      if(a==="toggle-completed"){state.showCompleted=!state.showCompleted;renderTodo();}
      if(a==="shopping-category"){state.shoppingCategory=el.dataset.category;renderShopping();}
      if(a==="add-shopping")await editShopping("");
      if(a==="edit-shopping")await editShopping(el.dataset.id);
       if(a==="catalog-genre"&&state.role==="admin"&&catalogGenres.some(g=>g.name===el.dataset.genre)){state.catalogGenre=el.dataset.genre;renderCatalog();}
       if(a==="edit-catalog")editCatalog(el.dataset.id);
       if(a==="delete-catalog")await removeCatalog(el.dataset.id);
      if(a==="remove-member")await removeMember(el.dataset.email);
    }catch(error){report(error,"操作エラー: ");}
  }
  function change(e){
    const el=e.target;
    if(el.matches('input[data-action="catalog-photo-select"]')){
      const form=el.closest("form");
      const sibling=form?.querySelector('input[data-action="catalog-photo-select"]:not([name="'+el.name+'"])');
      if(sibling)sibling.value="";
      const remove=form?.querySelector('input[name="remove_photo"]');
      if(remove)remove.checked=false;
      const status=$("catalog-photo-status");
      if(status&&el.files?.length)status.textContent=el.files[0].name+" を保存時に軽く整えるよ";
    }
    if(el.matches('input[data-action="catalog-remove-photo"]')&&el.checked){
      const form=el.closest("form");
      form?.querySelectorAll('input[data-action="catalog-photo-select"]').forEach(input=>input.value="");
      const status=$("catalog-photo-status");
      if(status)status.textContent="保存すると写真を外すよ";
    }
    if(el.matches('input[data-action="catalog-shopping-list"]')){
      const needed=$("modal-form")?.querySelector('input[name="needed"]');
      if(needed){if(!el.checked)needed.checked=false;needed.disabled=!el.checked;}
    }
    if(el.matches('input[data-action="shopping-needed"]'))toggleShopping(el);
    if(el.matches('input[data-action="task-completed"]'))toggleTask(el);
    if(el.matches('input[data-action="todo-bought"]'))completeShopping(el);
    if(el.matches('input[data-action="todo-cleaned"]'))completeCleaning(el);
  }
  function input(e){if(e.target.matches("textarea[data-month-field],input[data-month-field]"))updateDraft(e.target);}
  async function submit(e){
    const form=e.target;if(!["modal-form","member-form","catalog-quick-form"].includes(form.id))return;
    e.preventDefault();
    if(form.id==="catalog-quick-form"){
      try{await addCatalog(form);}catch(error){report(error,"図鑑登録: ");}
      return;
    }
    try{if(form.id==="modal-form")await submitModal(form);else await addMember(form);}
    catch(error){report(error,"追加失敗: ");}
  }
  document.addEventListener("DOMContentLoaded",init);
})();
