'use strict';
// Service LAN: une seule instance sur le serveur écrit le fichier de données.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const core=require('./core');
const PORT=Number(process.env.PRESENCE_PORT||3210);
// Keep data next to the server script, including when Windows starts it as a scheduled task.
const DATA_FILE=process.env.PRESENCE_DATA_FILE||path.join(__dirname,'data','presence-data.json');
const sessions=new Map();
function load(){if(!fs.existsSync(DATA_FILE))return core.newState();return core.validateState(JSON.parse(fs.readFileSync(DATA_FILE,'utf8')));}
function save(db){core.validateState(db);fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true});const temp=DATA_FILE+'.tmp';fs.writeFileSync(temp,JSON.stringify(db,null,2),'utf8');fs.renameSync(temp,DATA_FILE);}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function body(req){return new Promise((resolve,reject)=>{let text='';req.on('data',c=>{text+=c;if(text.length>20*1024*1024)reject(new Error('طلب كبير جدًا.'));});req.on('end',()=>{try{resolve(text?JSON.parse(text):{});}catch{reject(new Error('JSON غير صالح.'));}});});}
function user(req){const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');const id=sessions.get(token);if(!id)throw new Error('يجب تسجيل الدخول.');const u=load().users.find(x=>x.id===id);if(!u)throw new Error('المستخدم غير موجود.');return u;}
function safeUser(u){return {id:u.id,username:u.username,displayName:u.displayName,role:u.role};}
http.createServer(async(req,res)=>{try{
  if(req.method==='GET'&&req.url==='/health')return send(res,200,{ok:true});
  if(req.method==='POST'&&req.url==='/auth/login'){const p=await body(req),u=load().users.find(x=>x.username.toLowerCase()===String(p.username||'').trim().toLowerCase()&&x.passwordHash===core.passwordHash(p.password||''));if(!u)return send(res,401,{error:'اسم المستخدم أو كلمة المرور غير صحيحة.'});const token=crypto.randomBytes(32).toString('hex');sessions.set(token,u.id);return send(res,200,{token,user:safeUser(u)});}
  const u=user(req);
  if(req.method==='GET'&&req.url==='/state'){const db=load();if(u.role!=='MANAGER')delete db.punchImports;return send(res,200,{data:db});}
  if(req.method==='POST'&&req.url==='/mutate'){const p=await body(req);const allowed=['company:save','company:delete','shift:save','shift:delete','employee:save','employee:delete','shift:set','shift:clear','attendance:save','settings:save'];if(!allowed.includes(p.action))return send(res,400,{error:'طلب غير مسموح.'});const out=core.mutate(load(),p.action,p.payload||{});save(out.state);return send(res,200,{result:out.result,data:out.state});}
  if(req.method==='POST'&&req.url==='/punch/import'){if(u.role!=='MANAGER')return send(res,403,{error:'هذه الوظيفة مخصصة لحساب المدير.'});const p=await body(req);if(!p.item||!Array.isArray(p.item.records)||!p.item.records.length)return send(res,400,{error:'ملف البصمة فارغ.'});const db=load();db.punchImports.push(p.item);save(db);return send(res,200,{ok:true,data:db});}
  if(req.method==='GET'&&req.url==='/punch/list'){if(u.role!=='MANAGER')return send(res,403,{error:'هذه الوظيفة مخصصة لحساب المدير.'});return send(res,200,{items:load().punchImports.map(x=>({id:x.id,fileName:x.fileName,importedAt:x.importedAt,count:x.records.length})).reverse()});}
  if(req.method==='POST'&&req.url==='/punch/delete'){if(u.role!=='MANAGER')return send(res,403,{error:'هذه الوظيفة مخصصة لحساب المدير.'});const p=await body(req),db=load(),n=db.punchImports.length;db.punchImports=db.punchImports.filter(x=>x.id!==p.id);if(n===db.punchImports.length)return send(res,404,{error:'ملف البصمة غير موجود.'});save(db);return send(res,200,{ok:true,data:db});}
  if(req.method==='POST'&&req.url==='/backup/restore'){const p=await body(req);const db=core.validateState(p.data);save(db);return send(res,200,{ok:true,data:db});}
  return send(res,404,{error:'المسار غير موجود.'});
}catch(e){send(res,400,{error:e.message||'خطأ في الخادم.'});}}).listen(PORT,'0.0.0.0',()=>console.log(`Presence LAN server listening on http://0.0.0.0:${PORT}`));
