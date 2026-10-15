"use strict";
(function(){
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const check=r=>{if(r.error)throw r.error;return r.data;};
  const genres=["料理","掃除・家事","子育て","緊急時","暮らし"];
  const icons={"料理":"🍳","掃除・家事":"🧹","子育て":"🎒","緊急時":"🆘","暮らし":"🏠"};
  const bucket="family-note-files",maxFile=8*1024*1024,maxFiles=10;
  const noteDate=value=>value?new Date(value).toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo"}):"";
  const rows=value=>String(value||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const stepText=s=>s.replace(/^(?:\d+[.．)、]\s*|[①②③④⑤⑥⑦⑧⑨⑩]\s*|[-・]\s*)/,"").trim();
  let client=null,bridge=null,notes=[],files=[],links=[],selectedGenre="すべて",query="",sort="updated",loaded=false;
  let active=null,mode="",editorLinks=[],queued=[],removed=new Set(),working=false;
  const fileUrls=new Map();
  const safeHref=str=>{
    try{const u=new URL(String(str||""));return ["https:","http:"].includes(u.protocol)&&!u.username&&!u.password?u.href:"";}catch{return "";}
  };
  const todayTokyo=()=>{const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const p=x=>parts.find(v=>v.type===x).value;return p("year")+"-"+p("month")+"-"+p("day");};
  const fileExt=f=>(f.type==="application/pdf"||/\.pdf$/i.test(f.name))?"pdf":"jpg";
  function say(message,isError=false){
    const node=$("notes-save-status")&&!$("notes-overlay").hidden?$("notes-save-status"):$("notes-feedback");
    if(node){node.textContent=message;node.className="small"+(isError?" notes-error":"");}
  }
  function dialog(html){
    $("notes-dialog-content").innerHTML=html;$("notes-overlay").hidden=false;
  }
  function close(){
    if(working)return;
    $("notes-overlay").hidden=true;$("notes-dialog-content").innerHTML="";mode="";active=null;queued=[];removed.clear();
  }
  async function load(){
    if(!client)return;
    say("読み込み中…");
    try{
      const result=await Promise.all([
        client.from("family_notes").select("*").order("updated_at",{ascending:false}),
        client.from("note_attachments").select("*").order("created_at"),
        client.from("note_links").select("*").order("created_at")
      ]);
      notes=check(result[0]);files=check(result[1]);links=check(result[2]);loaded=true;
      say("");renderList();
    }catch(e){say("読み込みに失敗しました: "+(e.message||e),true);}
  }
  function renderList(){
    if(!client)return;
    const grid=$("notes-list");if(!grid)return;
    const q=query.trim().toLocaleLowerCase("ja");
    const hits=notes.filter(n=>(selectedGenre==="すべて"||n.genre===selectedGenre)&&
      (!q||[n.title,n.description,n.supplies,n.steps,n.contacts,n.info_source].join(" ").toLocaleLowerCase("ja").includes(q)));
    hits.sort((a,b)=>(Number(b.pinned)-Number(a.pinned))||(sort==="title"?
      a.title.localeCompare(b.title,"ja"):new Date(b.updated_at)-new Date(a.updated_at)));
    $("notes-total").textContent=hits.length+"件";
    $("notes-genres").innerHTML=["すべて",...genres].map(g=>
      '<button type="button" class="notes-filter'+(g===selectedGenre?" active":"")+
      '" data-note-action="genre" data-genre="'+esc(g)+'" aria-pressed="'+(g===selectedGenre)+'">'+
      (icons[g]||"📚")+" "+esc(g)+'</button>').join("");
    grid.innerHTML=hits.map(n=>
      '<button type="button" class="notes-card" data-note-action="open" data-id="'+esc(n.id)+'">'+
      '<span class="notes-card-icon">'+(icons[n.genre]||"📖")+'</span><span class="notes-card-body">'+
      '<strong>'+(n.pinned?"📌 ":"")+esc(n.title)+'</strong>'+
      (n.description?'<span class="notes-card-desc">'+esc(n.description)+'</span>':"")+
      '<span class="tiny">'+esc(n.genre)+' · 更新 '+esc(noteDate(n.updated_at))+'</span></span>'+
      '<span aria-hidden="true">›</span></button>').join("")||
      '<p class="empty">'+(loaded?"ノートが見つからないよ。新しく追加してね。":"読み込み中…")+'</p>';
  }
  function section(label,html){return html?'<section class="notes-section"><h3>'+label+'</h3>'+html+'</section>':"";}
  function asText(v){return '<p class="notes-paragraph">'+esc(v)+'</p>';}
  function contactHtml(v){
    const re=/(?:0\d{1,4}-\d{1,4}-\d{3,4}|119|110)/g;
    return rows(v).map(line=>{
      let last=0,res="",m;
      while((m=re.exec(line))){
        res+=esc(line.slice(last,m.index));
        res+='<a href="tel:'+m[0].replace(/\D/g,"")+'">'+esc(m[0])+'</a>';
        last=m.index+m[0].length;
      }
      return '<div>'+res+esc(line.slice(last))+'</div>';
    }).join("");
  }
  function relationHtml(noteId){
    return links.filter(l=>l.note_id===noteId).map(l=>{
      if(l.kind==="url"){
        const href=safeHref(l.url);
        return href?'<a class="notes-link" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">↗ '+esc(l.title)+'</a>':"";
      }
      return '<button type="button" class="notes-link" data-note-action="catalog" data-catalog-id="'+esc(l.catalog_item_id)+'">📚 '+esc(l.title)+'</button>';
    }).join("");
  }
  function fileRow(f,url){
    const title=esc(f.file_name);
    if(!url)return '<span class="notes-link">📄 '+title+'（準備中…）</span>';
    return '<a href="'+esc(url)+'" class="notes-link" target="_blank" rel="noopener noreferrer">'+
      (f.mime_type==="application/pdf"?"📄 ":"🖼️ ")+title+(f.mime_type==="application/pdf"?"（開いて印刷）":"（開く）")+'</a>';
  }
  async function fillFileLinks(id){
    const entries=files.filter(f=>f.note_id===id);
    const waiting=entries.filter(f=>!fileUrls.has(f.storage_path)||fileUrls.get(f.storage_path).expires<Date.now());
    if(waiting.length){
      try{
        const data=check(await client.storage.from(bucket).createSignedUrls(waiting.map(f=>f.storage_path),1200));
        data.forEach((x,i)=>{
          if(x.signedUrl&&!x.error){
            const url=new URL(x.signedUrl,client.supabaseUrl);
            if(url.origin===new URL(client.supabaseUrl).origin)
              fileUrls.set(waiting[i].storage_path,{url:url.href,expires:Date.now()+15*60*1000});
          }
        });
      }catch(e){console.warn("Note file links:",e);}
    }
    if(active!==id||mode!=="view")return;
    const target=$("notes-attachment-links");if(!target)return;
    target.innerHTML=entries.map(f=>fileRow(f,fileUrls.get(f.storage_path)?.url)).join("")+
      (entries.some(f=>!fileUrls.has(f.storage_path))?'<p class="tiny">開けない資料があるよ。再ログイン後に試してね。</p>':"");
  }
  function open(id){
    const n=notes.find(x=>x.id===id);if(!n)return;
    active=id;mode="view";
    const ingredients=rows(n.supplies);
    const steps=rows(n.steps).map(stepText).filter(Boolean);
    const attach=files.filter(f=>f.note_id===id);
    dialog('<div class="between"><span class="tiny">'+(icons[n.genre]||"📖")+' '+esc(n.genre)+'</span>'+
      '<button class="btn secondary smallbtn" type="button" data-note-action="close">閉じる</button></div>'+
      '<h2 class="notes-detail-title">'+(n.pinned?"📌 ":"")+esc(n.title)+'</h2>'+
      section("どんなとき？",n.description?asText(n.description):"")+
      section("準備するもの",ingredients.length?'<ul class="notes-plain-list">'+ingredients.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>':"")+
      section("手順",steps.length?'<ol class="notes-steps">'+steps.map(x=>'<li><label><input type="checkbox"><span>'+esc(x)+'</span></label></li>').join("")+'</ol>':"")+
      section("連絡先",n.contacts?'<div class="notes-paragraph">'+contactHtml(n.contacts)+'</div>':"")+
      section("PDF・写真",attach.length?'<div class="notes-links" id="notes-attachment-links">'+attach.map(f=>fileRow(f,fileUrls.get(f.storage_path)?.url)).join("")+'</div><p class="tiny">PDFは開いたあと、iPhone・iPadの共有メニューから「プリント」を選んでね。</p>':"")+
      section("関連リンク・図鑑",relationHtml(id)?'<div class="notes-links">'+relationHtml(id)+'</div>':"")+
      section("情報源・確認日",n.info_source||n.checked_on?'<div class="small">'+(n.info_source?esc(n.info_source):"")+
        (n.checked_on?'<div>情報確認日: '+esc(n.checked_on)+'</div>':"")+'</div>':"")+
      '<p class="tiny">更新: '+esc(noteDate(n.updated_at))+'</p>'+
      '<div class="notes-modal-actions"><button class="btn secondary smallbtn" data-note-action="edit" data-id="'+esc(id)+'">編集</button>'+
      '<button class="btn danger smallbtn" data-note-action="delete" data-id="'+esc(id)+'">削除</button></div>');
    if(attach.length)fillFileLinks(id);
  }
  function editorLinkList(){
    const target=$("notes-link-entries");if(!target)return;
    target.innerHTML=editorLinks.map(l=>
      '<div class="notes-file-entry"><span>'+(l.kind==="catalog"?"📚 ":"🔗 ")+esc(l.title)+'</span>'+
      '<button type="button" class="btn secondary smallbtn" data-note-action="unlink" data-id="'+esc(l.id)+'">外す</button></div>').join("")||
      '<p class="tiny">関連リンクはまだないよ。</p>';
  }
  function editorFiles(){
    const target=$("notes-file-entries");if(!target)return;
    const existing=files.filter(f=>f.note_id===active&&!removed.has(f.id));
    target.innerHTML=existing.map(f=>
      '<div class="notes-file-entry"><span>📎 '+esc(f.file_name)+'</span>'+
      '<button class="btn secondary smallbtn" type="button" data-note-action="remove-file" data-id="'+esc(f.id)+'">外す</button></div>').join("")+
      queued.map((f,i)=>'<div class="notes-file-entry"><span>＋ '+esc(f.name)+'</span>'+
      '<button class="btn secondary smallbtn" type="button" data-note-action="unqueue" data-index="'+i+'">外す</button></div>').join("");
  }
  function edit(id){
    const n=notes.find(x=>x.id===id)||{title:"",genre:"暮らし",description:"",supplies:"",steps:"",contacts:"",info_source:"",checked_on:"",pinned:false};
    active=id||null;mode="edit";queued=[];removed=new Set();
    editorLinks=links.filter(l=>l.note_id===id).map(l=>({...l}));
    const field=(name,label,hint="")=>'<label class="field" for="notes-'+name+'">'+label+'</label>'+
      '<textarea id="notes-'+name+'" name="'+name+'" placeholder="'+esc(hint)+'">'+esc(n[name]||"")+'</textarea>';
    dialog('<div class="between"><strong>'+(id?"ノートを編集":"新しいノート")+'</strong>'+
      '<button type="button" class="btn secondary smallbtn" data-note-action="close">閉じる</button></div>'+
      '<form id="notes-form">'+
      '<label class="field" for="notes-title">タイトル（必須）</label><input class="input" id="notes-title" name="title" value="'+esc(n.title)+'" maxlength="150" required placeholder="例：カレーを作りたい">'+
      '<label class="field" for="notes-genre">ジャンル</label><select class="input" id="notes-genre" name="genre">'+genres.map(g=>'<option value="'+esc(g)+'"'+(n.genre===g?" selected":"")+'>'+esc(g)+'</option>').join("")+'</select>'+
      field("description","説明","どんなときに使うノート？")+
      field("supplies","準備するもの","1行に1つずつ（材料・道具など）")+
      field("steps","手順","1行に1つずつ。表示時に自動で番号が付くよ。")+
      '<p class="tiny">手順は改行するだけで 1、2、3… と表示されるよ。</p>'+
      field("contacts","連絡先","名前と電話番号など。電話番号はタップできるよ。")+
      field("info_source","情報源","例：園の配布資料、自治体の公式サイト")+
      '<div class="notes-date-row"><div><label class="field" for="notes-checked_on">情報確認日（任意）</label>'+
      '<input type="date" class="input" id="notes-checked_on" name="checked_on" value="'+esc(n.checked_on||"")+'"></div>'+
      '<button type="button" class="btn secondary smallbtn" data-note-action="today">今日にする</button></div>'+
      '<label class="notes-pin"><input type="checkbox" name="pinned" '+(n.pinned?"checked":"")+'>📌 よく使うノートとして上に固定</label>'+
      '<details class="notes-editor-extra"><summary>📎 PDF・写真を添付（複数OK）</summary>'+
      '<p class="tiny">PDFは1ファイル8MBまで。写真は小さくして保存。最大10ファイル。</p>'+
      '<input type="file" id="notes-file-picker" class="input" accept="image/*,.pdf,application/pdf" multiple>'+
      '<div id="notes-file-entries"></div></details>'+
      '<details class="notes-editor-extra"><summary>🔗 関連リンク・持ち物図鑑</summary>'+
      '<div id="notes-link-entries"></div><label class="field" for="notes-link-title">リンク名</label>'+
      '<input class="input" id="notes-link-title" placeholder="例：保育園の公式サイト" maxlength="150">'+
      '<label class="field" for="notes-link-url">WebページのURL</label>'+
      '<input class="input" id="notes-link-url" type="text" inputmode="url" placeholder="https://...">'+
      '<button type="button" class="btn secondary smallbtn" data-note-action="add-link">＋ Webリンクを追加</button>'+
      '<label class="field" for="notes-catalog-item">図鑑の品目を関連付ける</label>'+
      '<div class="notes-link-form"><select class="input" id="notes-catalog-item"><option value="">品目を選んでね</option>'+
      bridge.getCatalog().map(x=>'<option value="'+esc(x.id)+'">'+esc(x.product)+'</option>').join("")+
      '</select><button type="button" class="btn secondary smallbtn" data-note-action="add-catalog">＋ 追加</button></div>'+
      '</details></form>'+
      '<p id="notes-save-status" class="status" role="status" aria-live="polite"></p>'+
      '<div class="notes-modal-actions"><button type="button" class="btn secondary" data-note-action="close">キャンセル</button>'+
      '<button type="button" id="notes-save" class="btn" data-note-action="save">保存する</button></div>');
    editorFiles();editorLinkList();
  }
  async function encodePhoto(file){
    if(file.size>20*1024*1024)throw Error("写真は20MB以内にしてね");
    const source=URL.createObjectURL(file);
    try{
      const img=await new Promise((ok,ng)=>{
        const i=new Image();i.onload=()=>ok(i);i.onerror=()=>ng(Error("写真を読み込めませんでした"));i.src=source;
      });
      const scale=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext("2d");if(!ctx)throw Error("写真を加工できません");
      ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const blob=await new Promise(ok=>canvas.toBlob(ok,"image/jpeg",0.78));
      if(!blob||blob.size>maxFile)throw Error("写真を小さくできませんでした");
      return blob;
    }finally{URL.revokeObjectURL(source);}
  }
  async function save(){
    if(working||mode!=="edit")return;
    const form=$("notes-form");if(!form.reportValidity())return;
    const fd=new FormData(form),title=String(fd.get("title")||"").trim(),genre=String(fd.get("genre")||"");
    if(!title||title.length>150||!genres.includes(genre))throw Error("タイトルとジャンルを確認してね");
    const id=active||crypto.randomUUID();
    const old=files.filter(x=>x.note_id===id&&!removed.has(x.id));
    if(old.length+queued.length>maxFiles)throw Error("添付できるのは合計10ファイルまでだよ");
    const status=$("notes-save-status"),button=$("notes-save");
    working=true;button.disabled=true;
    const saySave=s=>{status.textContent=s;};
    try{
      const record={id,title,genre,description:String(fd.get("description")||""),
        supplies:String(fd.get("supplies")||""),steps:String(fd.get("steps")||""),
        contacts:String(fd.get("contacts")||""),info_source:String(fd.get("info_source")||""),
        checked_on:String(fd.get("checked_on")||"")||null,pinned:fd.get("pinned")==="on",
        updated_at:new Date().toISOString()};
      saySave("⏳ ノートを保存中…");
      check(await client.from("family_notes").upsert(record,{onConflict:"id"}).select("id").single());
      active=id;
      const former=links.filter(l=>l.note_id===id);
      const dead=former.filter(l=>!editorLinks.some(x=>x.id===l.id)).map(l=>l.id);
      if(dead.length)check(await client.from("note_links").delete().in("id",dead));
      if(editorLinks.length)check(await client.from("note_links").upsert(
        editorLinks.map(l=>({id:l.id,note_id:id,kind:l.kind,title:l.title,url:l.kind==="url"?l.url:null,
          catalog_item_id:l.kind==="catalog"?l.catalog_item_id:null})),{onConflict:"id"}));
      for(const file of [...queued]){
        const ext=fileExt(file);
        if(ext==="pdf"&&file.size>maxFile)throw Error(file.name+" は8MBを超えているよ");
        saySave("⏳ 添付ファイルを保存中… "+file.name);
        const data=ext==="pdf"?file:await encodePhoto(file);
        const path="notes/"+id+"/files/"+crypto.randomUUID()+"."+ext;
        check(await client.storage.from(bucket).upload(path,data,{
          contentType:ext==="pdf"?"application/pdf":"image/jpeg",upsert:false,cacheControl:"3600"
        }));
        try{
          check(await client.from("note_attachments").insert({note_id:id,storage_path:path,
            file_name:file.name.slice(0,200),mime_type:ext==="pdf"?"application/pdf":"image/jpeg",file_size:data.size}));
          queued=queued.filter(x=>x!==file);
        }catch(e){await client.storage.from(bucket).remove([path]);throw e;}
      }
      for(const f of files.filter(x=>x.note_id===id&&removed.has(x.id))){
        saySave("⏳ 古い添付を整理中…");
        check(await client.storage.from(bucket).remove([f.storage_path]));
        check(await client.from("note_attachments").delete().eq("id",f.id));
      }
      await load();
      working=false;open(id);
      say("ノートを保存したよ！");
    }catch(e){
      saySave("保存できなかった項目があります: "+(e.message||e));status.classList.add("err");
      button.disabled=false;throw e;
    }finally{working=false;}
  }
  async function removeNote(id){
    const n=notes.find(x=>x.id===id);
    if(!n||!confirm("「"+n.title+"」を削除する？元には戻せないよ。"))return;
    const list=files.filter(f=>f.note_id===id);
    if(list.length)check(await client.storage.from(bucket).remove(list.map(f=>f.storage_path)));
    check(await client.from("family_notes").delete().eq("id",id));
    close();await load();say("ノートを削除したよ");
  }
  function onClick(e){
    const button=e.target.closest("[data-note-action]");if(!button||working)return;
    const action=button.dataset.noteAction;
    try{
      if(action==="genre"){selectedGenre=button.dataset.genre;renderList();}
      if(action==="open")open(button.dataset.id);
      if(action==="new")edit(null);
      if(action==="edit")edit(button.dataset.id);
      if(action==="close")close();
      if(action==="today")$("notes-checked_on").value=todayTokyo();
      if(action==="unlink"){editorLinks=editorLinks.filter(l=>l.id!==button.dataset.id);editorLinkList();}
      if(action==="unqueue"){queued.splice(Number(button.dataset.index),1);editorFiles();}
      if(action==="remove-file"){removed.add(button.dataset.id);editorFiles();}
      if(action==="add-link"){
        const title=$("notes-link-title").value.trim(),url=safeHref($("notes-link-url").value.trim());
        if(!title||!url||title.length>150){say("リンク名とhttp(s)のURLを入力してね",true);return;}
        editorLinks.push({id:crypto.randomUUID(),kind:"url",title,url});
        $("notes-link-title").value="";$("notes-link-url").value="";editorLinkList();
      }
      if(action==="add-catalog"){
        const id=$("notes-catalog-item").value,item=bridge.getCatalog().find(x=>x.id===id);
        if(item&&!editorLinks.some(l=>l.kind==="catalog"&&l.catalog_item_id===id)){
          editorLinks.push({id:crypto.randomUUID(),kind:"catalog",catalog_item_id:id,title:item.product});
          editorLinkList();
        }
      }
      if(action==="catalog"){close();bridge.openCatalog(button.dataset.catalogId);}
      if(action==="delete")removeNote(button.dataset.id).catch(fail);
      if(action==="save")save().catch(fail);
    }catch(error){fail(error);}
  }
  function fail(error){const msg=error?.message||String(error);say(msg,true);console.error("Family notes:",error);}
  function init(args){
    client=args.client;bridge=args;
    document.addEventListener("click",onClick);
    $("notes-search").addEventListener("input",e=>{query=e.target.value;renderList();});
    $("notes-sort").addEventListener("change",e=>{sort=e.target.value;renderList();});
    document.addEventListener("change",e=>{
      if(e.target.id!=="notes-file-picker"||mode!=="edit")return;
      for(const file of e.target.files||[]){
        if(queued.length+files.filter(f=>f.note_id===active&&!removed.has(f.id)).length>=maxFiles){say("添付は合計10件までだよ",true);break;}
        if(fileExt(file)==="pdf"&&file.size>maxFile){say("PDFは8MB以内にしてね",true);continue;}
        if(fileExt(file)!=="pdf"&&!file.type.startsWith("image/")){say("PDFか写真だけ添付できるよ",true);continue;}
        queued.push(file);
      }
      e.target.value="";editorFiles();
    });
    $("notes-overlay").addEventListener("click",e=>{if(e.target.id==="notes-overlay")close();});
  }
  window.FamilyNotes={init,load,renderList};
})();
