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
    tasks:[],shoppingCategory:"食品",showCompleted:false};
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
    state.tab=page;
    document.querySelectorAll(".page").forEach(el=>el.classList.toggle("active",el.id==="page-"+page));
    document.querySelectorAll(".tabbar [data-tab]").forEach(el=>el.classList.toggle("active",el.dataset.tab===(page==="month"?"dashboard":page)));
    if(page==="month"){renderMonth();loadMonth().catch(e=>report(e,"月間読込: "));}
    if(page==="todo")renderTodo();
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
    const [d,c,s,t]=await Promise.all([
      state.client.from("daily").select("*").gte("day",isoToday()).lte("day",dateAdd(isoToday(),8)).order("day"),
      state.client.from("cleaning").select("*").order("id"),
      state.client.from("shopping").select("*").order("sort_order",{ascending:true,nullsFirst:false}),
      state.client.from("tasks").select("*").order("created_at",{ascending:true})
    ]);
    state.daily=check(d);state.cleaning=check(c);state.shopping=check(s);state.tasks=check(t);
    renderDashboard();renderTodo();
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
      (compact?"":'<button type="button" data-action="edit-day" data-day="'+day+'" class="daydate '+weekend(day)+'">'+fmtDay(day)+(holidayName(day)?' <span class="holiday-name">'+esc(holidayName(day))+'</span>':"")+'</button>')+
      '<div class="daycontent">'+(lines||'<div class="empty">予定なし</div>')+'</div></div>';
  }
  // Today/tomorrow use the same two-column person labels as the future agenda.
  // No outer "予定" row, so entries line up with lunch and garbage.
  function renderDailyAgenda(id,row){
    const lines=filledAgendaFields(row).map(k=>line(person[k],row[k])).join("");
    $(id).innerHTML=lines||'<div class="empty daily-agenda-empty">予定なし</div>';
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
      .map(x=>String(x.product||"").trim()+(x.quantity?" ×"+String(x.quantity).trim():""))
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

    // Future section is for scheduled family plans only, never garbage, cleaning or tasks.
    const upcoming=Array.from({length:7},(_,i)=>dateAdd(today,i+2))
      .filter(day=>filledAgendaFields(byDate.get(day)||{}).length>0);
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
      .concat(needed.map(x=>({kind:"shopping",id:x.id,label:x.product+(x.quantity?" ×"+x.quantity:""),meta:x.category||"",due:"9999-12-31"})));
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
    const cats=["食品","雑貨","育児",...state.shopping.map(x=>String(x.category||"").trim()||"未分類")]
      .filter((x,i,a)=>a.indexOf(x)===i);
    if(!cats.includes(state.shoppingCategory))state.shoppingCategory="食品";
    $("shopping-categories").innerHTML=cats.map(cat=>'<button type="button" data-action="shopping-category" data-category="'+esc(cat)+'" class="category-pill'+(state.shoppingCategory===cat?" active":"")+'">'+esc(cat)+'</button>').join("");
    const rows=state.shopping.filter(x=>(String(x.category||"").trim()||"未分類")===state.shoppingCategory);
    $("shopping-items").innerHTML=rows.length?rows.map(x=>shoppingRow(x)).join(""):'<p class="empty">このカテゴリの商品はありません</p>';
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
    const category=x.category||state.shoppingCategory||"食品";
    const categories=["食品","雑貨","育児",...state.shopping.map(x=>x.category).filter(Boolean),category].filter((v,i,a)=>a.indexOf(v)===i);
    const html='<form id="modal-form" data-kind="shopping"><input type="hidden" name="id" value="'+esc(id||"")+'">'+
      '<label class="field" for="shopping-product">商品名</label><input class="input" name="product" id="shopping-product" value="'+esc(x.product||"")+'" required maxlength="150">'+
      '<label class="field">カテゴリ</label><select class="input" name="category">'+categories.map(c=>'<option value="'+esc(c)+'" '+(c===category?"selected":"")+'>'+esc(c)+'</option>').join("")+'</select>'+
      '<label class="field">数量</label><input class="input" name="quantity" value="'+esc(x.quantity||"1")+'">'+
      '<label class="field">購入場所</label><input class="input" name="store" value="'+esc(x.store||"")+'">'+
      '<label class="field">メモ</label><textarea name="note" rows="3">'+esc(x.note||"")+'</textarea></form>';
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
      check(await state.client.from("shopping").update({needed:false,last_bought:isoToday(),updated_at:new Date().toISOString()}).eq("id",el.dataset.id));
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
        const data={};fields.forEach(k=>data[k]=String(fd.get(k)||"").trim()||null);
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
        const props={product:String(fd.get("product")||"").trim(),quantity:String(fd.get("quantity")||"").trim()||null,category:String(fd.get("category")||"").trim()||null,store:String(fd.get("store")||"").trim()||null,note:String(fd.get("note")||"").trim()||null,updated_at:new Date().toISOString()};
        if(!props.product)throw Error("商品名を入力してね");
        const existing=state.shopping.some(x=>x.id===id);
        if(existing)check(await state.client.from("shopping").update(props).eq("id",id));
        else check(await state.client.from("shopping").insert({...props,id:"item-"+(crypto.randomUUID?.()||String(Date.now())+Math.random().toString(36).slice(2)),needed:true,quick_display:true,sort_order:Math.max(0,...state.shopping.map(x=>Number(x.sort_order)||0))+1}));
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
      if(a==="remove-member")await removeMember(el.dataset.email);
    }catch(error){report(error,"操作エラー: ");}
  }
  function change(e){
    const el=e.target;
    if(el.matches('input[data-action="shopping-needed"]'))toggleShopping(el);
    if(el.matches('input[data-action="task-completed"]'))toggleTask(el);
    if(el.matches('input[data-action="todo-bought"]'))completeShopping(el);
    if(el.matches('input[data-action="todo-cleaned"]'))completeCleaning(el);
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
