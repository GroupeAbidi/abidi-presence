'use strict';
// Presence PostgreSQL API. This is separate from Station: own database, port and secrets.
const http=require('node:http');
const path=require('node:path');
const crypto=require('node:crypto');
require('dotenv').config({path:path.join(__dirname,'..','.env')});
const {Pool}=require('pg');
const core=require('../src/core');

const PORT=Number(process.env.PORT||4001);
const HOST=process.env.HOST||'0.0.0.0';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required in .env');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:10});
const sessions=new Map();
const allowed=new Set(['company:save','company:delete','shift:save','shift:delete','employee:save','employee:delete','shift:set','shift:clear','attendance:save','settings:save']);

function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function body(req){return new Promise((resolve,reject)=>{let text='';req.on('data',chunk=>{text+=chunk;if(text.length>20*1024*1024)reject(new Error('طلب كبير جدًا.'));});req.on('end',()=>{try{resolve(text?JSON.parse(text):{});}catch{reject(new Error('JSON غير صالح.'));}});});}
function clean(db){return core.validateState(db);}
async function initialize(){
  await pool.query('CREATE TABLE IF NOT EXISTS presence_state (id SMALLINT PRIMARY KEY CHECK (id = 1), data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  await pool.query('INSERT INTO presence_state (id,data) VALUES (1,$1::jsonb) ON CONFLICT (id) DO NOTHING',[JSON.stringify(core.newState())]);
}
async function load(){const result=await pool.query('SELECT data FROM presence_state WHERE id=1');return clean(result.rows[0].data);}
async function write(change){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const row=await client.query('SELECT data FROM presence_state WHERE id=1 FOR UPDATE');
    const db=clean(row.rows[0].data),out=await change(db);
    const next=clean(out.state||out.data||out);
    await client.query('UPDATE presence_state SET data=$1::jsonb, updated_at=now() WHERE id=1',[JSON.stringify(next)]);
    await client.query('COMMIT');
    return {data:next,result:out.result};
  }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{client.release();}
}
async function user(req){const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');const id=sessions.get(token);if(!id)throw new Error('يجب تسجيل الدخول.');const u=(await load()).users.find(x=>x.id===id);if(!u)throw new Error('المستخدم غير موجود.');return u;}
function safeUser(u){return {id:u.id,username:u.username,displayName:u.displayName,role:u.role};}

const server=http.createServer(async(req,res)=>{try{
  if(req.method==='GET'&&req.url==='/health')return send(res,200,{ok:true,service:'presence-api'});
  if(req.method==='POST'&&req.url==='/auth/login'){
    const p=await body(req),u=(await load()).users.find(x=>x.username.toLowerCase()===String(p.username||'').trim().toLowerCase()&&x.passwordHash===core.passwordHash(p.password||''));
    if(!u)return send(res,401,{error:'اسم المستخدم أو كلمة المرور غير صحيحة.'});
    const token=crypto.randomBytes(32).toString('hex');sessions.set(token,u.id);return send(res,200,{token,user:safeUser(u)});
  }
  const u=await user(req);
  if(req.method==='GET'&&req.url==='/state'){const db=await load();if(u.role!=='MANAGER')delete db.punchImports;return send(res,200,{data:db});}
  if(req.method==='POST'&&req.url==='/mutate'){
    const p=await body(req);if(!allowed.has(p.action))return send(res,400,{error:'طلب غير مسموح.'});
    if(p.action==='settings:save'&&p.payload?.punchRules!==undefined&&u.role!=='MANAGER')return send(res,403,{error:'قواعد H− مخصصة لحساب المدير.'});
    const out=await write(db=>core.mutate(db,p.action,p.payload||{}));return send(res,200,{result:out.result,data:out.data});
  }
  if(req.method==='POST'&&req.url==='/punch/import'){
    if(u.role!=='MANAGER')return send(res,403,{error:'هذه الوظيفة مخصصة لحساب المدير.'});const p=await body(req);
    if(!p.item||!Array.isArray(p.item.records)||!p.item.records.length)return send(res,400,{error:'ملف البصمة فارغ.'});
    const out=await write(db=>{db.punchImports.push(p.item);return db;});return send(res,200,{ok:true,data:out.data});
  }
  if(req.method==='GET'&&req.url==='/punch/list'){
    if(u.role!=='MANAGER')return send(res,403,{error:'هذه الوظيفة مخصصة لحساب المدير.'});
    const items=(await load()).punchImports.map(x=>({id:x.id,fileName:x.fileName,importedAt:x.importedAt,count:x.records.length})).reverse();return send(res,200,{items});
  }
  if(req.method==='POST'&&req.url==='/punch/delete'){
    if(u.role!=='MANAGER')return send(res,403,{error:'هذه الوظيفة مخصصة لحساب المدير.'});const p=await body(req);
    const out=await write(db=>{const n=db.punchImports.length;db.punchImports=db.punchImports.filter(x=>x.id!==p.id);if(n===db.punchImports.length)throw new Error('ملف البصمة غير موجود.');return db;});return send(res,200,{ok:true,data:out.data});
  }
  if(req.method==='POST'&&req.url==='/backup/restore'){const p=await body(req),out=await write(()=>clean(p.data));return send(res,200,{ok:true,data:out.data});}
  return send(res,404,{error:'المسار غير موجود.'});
}catch(error){console.error(error);send(res,400,{error:error.message||'خطأ في الخادم.'});}});

initialize().then(()=>server.listen(PORT,HOST,()=>console.log(`Presence PostgreSQL API listening on http://${HOST}:${PORT}`))).catch(error=>{console.error('Presence API startup failed:',error);process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>pool.end(()=>process.exit(0))));
