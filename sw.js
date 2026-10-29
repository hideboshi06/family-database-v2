/* Family Database service worker: deliberately no caching of private data. */
"use strict";
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  let data={};
  try{data=event.data?.json()||{};}catch{data={body:event.data?.text()||""};}
  const title=String(data.title||"Family Database");
  const body=String(data.body||"今日の家族予定を確認しよう");
  const root=new URL(self.registration.scope);
  let target=new URL("./?from=push",root).href;
  // The shopping notification should open the action list, not the dashboard.
  // Accept only a same-origin URL inside this app's exact scope.
  try{
    const requested=new URL(String(data.url||""),root);
    if(requested.origin===root.origin&&requested.pathname===root.pathname)
      target=requested.href;
  }catch{}
  event.waitUntil(self.registration.showNotification(title,{
    body,tag:data.url&&target.includes("from=shopping")?"family-database-shopping":"family-database-daily",data:{url:target}
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const root=new URL(self.registration.scope);
  const requested=event.notification.data?.url;
  const url=new URL(requested||"./?from=notification",root).href;
  if(!url.startsWith(root.href))return;
  event.waitUntil((async()=>{
    const list=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const existing=list.find(client=>client.url.startsWith(root.href));
    if(existing){
      await existing.navigate(url);
      return existing.focus();
    }
    return self.clients.openWindow(url);
  })());
});
