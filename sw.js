/* Family Database service worker: deliberately no caching of private data. */
"use strict";
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  let data={};
  try{data=event.data?.json()||{};}catch{data={body:event.data?.text()||""};}
  const title=String(data.title||"Family Database");
  const body=String(data.body||"今日の家族予定を確認しよう");
  const target=new URL("./?from=push",self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(title,{
    body,tag:"family-database-daily",data:{url:target}
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
