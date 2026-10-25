'use strict';
const {app,BrowserWindow,ipcMain,dialog,Menu,shell} = require('electron');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const core=require('./core');
const ExcelJS=require('exceljs');
const {autoUpdater}=require('electron-updater');
let win, currentUser=null, sessionToken='', dbCache=null;
// Adresse fixe du PC serveur de l'entreprise. Toutes les copies de l'application utilisent cette même base.
// The shared Presence service runs privately on the company's Tailscale network.
const SERVER_URL=(process.env.PRESENCE_SERVER||'http://100.116.168.16:4001').replace(/\/$/,'');
const mainFile=()=>path.join(app.getPath('userData'),'presence-data.json');
function localState(){
  const p=mainFile();
  if(!fs.existsSync(p))return core.newState();
  try{return core.validateState(JSON.parse(fs.readFileSync(p,'utf8')));}
  catch(error){
    const backup=p+'.bak';
    if(fs.existsSync(backup)){
      try{const recovered=core.validateState(JSON.parse(fs.readFileSync(backup,'utf8')));dialog.showMessageBoxSync({type:'warning',title:'استرجاع البيانات',message:'حدث خطأ في ملف البيانات. سيتم تحميل نسخة التعافي السابقة.',detail:`الملف الأصلي لم يُحذف:\n${p}`});return recovered;}catch{}
    }
    throw new Error(`تعذّر قراءة قاعدة البيانات. لم يتم حذفها. استرجع نسخة احتياطية سليمة.\n${p}\n${error.message}`);
  }
}
function storeLocalState(state){
  core.validateState(state);
  const f=mainFile(), tmp=f+'.tmp';
  fs.mkdirSync(path.dirname(f),{recursive:true});
  if(fs.existsSync(f))fs.copyFileSync(f,f+'.bak');
  fs.writeFileSync(tmp,JSON.stringify(state,null,2),'utf8');
  try{fs.renameSync(tmp,f);}catch(error){try{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}catch{}throw error;}
}
function readState(){if(!dbCache)throw new Error('تعذّر الاتصال بالخادم المركزي. تحقق أن جهاز الخادم يعمل.');return core.clone(dbCache);}
async function serverRequest(route,{method='GET',data,auth=true}={}){
  // Native Node HTTP instead of fetch: Electron 22 / Windows 7 ships with Node 16,
  // which has no stable global fetch or AbortSignal.timeout.
  return new Promise((resolve,reject)=>{
    const target=new URL(SERVER_URL+route),payload=data===undefined?'':JSON.stringify(data);
    const request=http.request({hostname:target.hostname,port:target.port||80,path:target.pathname+target.search,method,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),...(auth&&sessionToken?{Authorization:`Bearer ${sessionToken}`}:{})}},response=>{
      let raw='';response.setEncoding('utf8');response.on('data',chunk=>raw+=chunk);response.on('end',()=>{
        let result={};try{result=raw?JSON.parse(raw):{};}catch{}
        if(response.statusCode<200||response.statusCode>=300)return reject(new Error(result.error||'حدث خطأ في الخادم المركزي.'));
        resolve(result);
      });
    });
    request.setTimeout(10000,()=>request.destroy(new Error('timeout')));
    request.on('error',()=>reject(new Error(`تعذّر الاتصال بالخادم المركزي (${SERVER_URL}). تأكد من تشغيل خدمة الحضور ومن الشبكة.`)));
    if(payload)request.write(payload);request.end();
  });
}
async function refreshState(){const r=await serverRequest('/state');dbCache=r.data;return dbCache;}
function guardSender(ev){
  const url=ev.senderFrame?.url || '';
  if(!url.startsWith('file://')||!url.includes('/index.html'))throw new Error('جهة غير مسموح لها بالوصول للبيانات.');
}
function handle(channel,fn){ipcMain.handle(channel,async(ev,...args)=>{guardSender(ev);if(!['auth:login','auth:logout'].includes(channel)&&!currentUser)throw new Error('يجب تسجيل الدخول أولًا.');return fn(...args);});}
function maybeFile(n){return (n||'').replace(/[\\/:*?"<>|]/g,'-').slice(0,100);}
async function saveDialog(defaultPath,filters){return dialog.showSaveDialog(win,{title:'حفظ الملف',defaultPath,filters});}
function beautify(sheet,headerCount){
  sheet.views=[{state:'frozen',ySplit:1,rightToLeft:true}];
  sheet.getRow(1).height=32;
  sheet.getRow(1).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'},size:12};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1C4553'}};c.alignment={horizontal:'center',vertical:'middle'};c.border={bottom:{style:'thin',color:{argb:'FFCBD5E1'}}};});
  sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(2,sheet.rowCount),column:headerCount}};
  for(let r=2;r<=sheet.rowCount;r++){
    sheet.getRow(r).height=24;
    if(r%2===0)sheet.getRow(r).eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F5F9'}};});
    sheet.getRow(r).eachCell(c=>{c.alignment={vertical:'middle',horizontal:'right'};});
  }
  sheet.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};
}
function excelText(x){return String(x??'');}
function reportRows(db,month,companyId){
  const employees=db.employees.filter(e=>(!companyId||e.companyId===companyId)&&core.employeeInMonth(e,month));
  employees.sort((a,b)=>a.fullName.localeCompare(b.fullName,'ar'));
  return employees.map(e=>({...core.monthlySummary(db,e,month),company:db.companies.find(c=>c.id===e.companyId)?.name||''}));
}
async function exportReport({month,companyId=''}){
  if(!core.isMonth(month))throw new Error('اختر شهرًا صالحًا.');
  if(companyId && !readState().companies.some(c=>c.id===companyId))throw new Error('الشركة غير موجودة.');
  const db=readState();const summaries=reportRows(db,month,companyId);
  const filename=`الحضور-${month}-${companyId?maybeFile(db.companies.find(c=>c.id===companyId)?.name):'كل-الشركات'}.xlsx`;
  const res=await saveDialog(path.join(app.getPath('downloads'),filename),[{name:'Excel',extensions:['xlsx']}]);
  if(res.canceled||!res.filePath)return {saved:false};
  const wb=new ExcelJS.Workbook();wb.creator='حضور المجموعة';wb.created=new Date();
  const summary=wb.addWorksheet('ملخص الموظفين');
  const heads=['الشركة','الرقم التعريفي','اسم الموظف','أيام الحضور','ساعات العمل','ساعات إضافية H+','عطلة C','مرض M','راحة R','مهمة MIS','غياب A','أيام دون تسجيل','عدد الخانات المسجلة'];
  summary.addRow(heads);
  for(const x of summaries)summary.addRow([excelText(x.company),excelText(x.employee.matricule),excelText(x.employee.fullName),x.workDays,x.workMinutes/1440,x.overtimeMinutes/1440,x.C,x.M,x.R,x.MIS,x.A,x.empty,x.recorded]);
  [23,18,28,14,14,16,13,13,13,13,13,19,22].forEach((w,i)=>summary.getColumn(i+1).width=w);
  summary.getColumn(5).numFmt='[h]:mm';summary.getColumn(6).numFmt='[h]:mm';beautify(summary,heads.length);
  const details=wb.addWorksheet('تفاصيل الأيام');
  const dh=['الشركة','الرقم التعريفي','اسم الموظف','التاريخ','الفترة المطبقة','بداية الفترة','نهاية الفترة','القيمة','الحالة','الدقائق الفعلية','ساعات فعلية','الساعات الإضافية H+','ملاحظة'];
  details.addRow(dh);
  for(const x of summaries){
    for(const date of core.dayList(month)){
      if(!core.employeeOnDate(x.employee,date))continue;
      const a=core.getRecord(db,x.employee.id,date),sh=core.getShift(db,x.employee,date);
      details.addRow([excelText(x.company),excelText(x.employee.matricule),excelText(x.employee.fullName),date,excelText(sh?.name),sh?.start||'',sh?.end||'',excelText(a?.value),a?core.STATUS_NAMES[a.status]:'غير مسجل',a?.minutes||0,(a?.minutes||0)/1440,(a?.overtimeMinutes||0)/1440,excelText(a?.note)]);
    }
  }
  [23,18,28,15,30,15,15,15,15,18,16,18,34].forEach((w,i)=>details.getColumn(i+1).width=w);details.getColumn(11).numFmt='[h]:mm';details.getColumn(12).numFmt='[h]:mm';beautify(details,dh.length);
  const changes=wb.addWorksheet('تغييرات المناوبات');
  changes.addRow(['الشركة','اسم الموظف','الرقم التعريفي','تاريخ بداية التغيير','الفترة الجديدة']);
  for(const c of [...db.shiftChanges].sort((a,b)=>a.date.localeCompare(b.date))){
    const e=db.employees.find(x=>x.id===c.employeeId);
    if(!e||(!companyId?false:e.companyId!==companyId)||!c.date.startsWith(month))continue;
    changes.addRow([db.companies.find(x=>x.id===e.companyId)?.name||'',e.fullName,e.matricule,c.date,db.shifts.find(x=>x.id===c.shiftId)?.name||'']);
  }
  [25,29,20,23,34].forEach((w,i)=>changes.getColumn(i+1).width=w);beautify(changes,5);
  await wb.xlsx.writeFile(res.filePath);return {saved:true,path:res.filePath};
}
async function exportManagerComparison(payload={}){
  if(currentUser?.role!=='MANAGER')throw new Error('هذه الوظيفة مخصصة لحساب المدير.');
  const rows=Array.isArray(payload.rows)?payload.rows:[];
  if(rows.length>100000)throw new Error('عدد السجلات كبير جدًا للتصدير.');
  const label=maybeFile(payload.label||'مراقبة-pointeuse');
  const res=await saveDialog(path.join(app.getPath('downloads'),`${label}.xlsx`),[{name:'Excel',extensions:['xlsx']}]);
  if(res.canceled||!res.filePath)return {saved:false};
  const wb=new ExcelJS.Workbook();wb.creator='حضور المجموعة';wb.created=new Date();
  const sheet=wb.addWorksheet('مراقبة pointeuse');
  const heads=['التاريخ','الموظف','الرقم التعريفي','الشركة','دخول Machine','خروج Machine','Calcul','حضور RH','حالة RH','H− تأخر','H− خروج مبكر','H− الإجمالي','النتيجة'];
  sheet.addRow(heads);
  for(const x of rows){
    const safe=x&&typeof x==='object'?x:{};
    sheet.addRow([excelText(safe.date),excelText(safe.name),excelText(safe.matricule),excelText(safe.company),excelText(safe.inTime),excelText(safe.outTime),(Number(safe.calculatedMinutes)||0)/1440,excelText(safe.rhValue),excelText(safe.rhStatus),(Number(safe.lateMinutes)||0)/1440,(Number(safe.earlyMinutes)||0)/1440,(Number(safe.deductionMinutes)||0)/1440,excelText(safe.result)]);
  }
  [15,30,20,24,18,18,14,15,16,16,20,16,28].forEach((w,i)=>sheet.getColumn(i+1).width=w);
  [7,10,11,12].forEach(n=>sheet.getColumn(n).numFmt='[h]:mm');beautify(sheet,heads.length);
  await wb.xlsx.writeFile(res.filePath);return {saved:true,path:res.filePath};
}
async function exportTemplate(){
  const res=await saveDialog(path.join(app.getPath('downloads'),'نموذج-استيراد-الموظفين.xlsx'),[{name:'Excel',extensions:['xlsx']}]);
  if(res.canceled||!res.filePath)return {saved:false};
  const wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet('الموظفون');
  sheet.addRow(['الشركة','الاسم الكامل','الرقم التعريفي','الوظيفة','تاريخ الالتحاق','الفترة الافتراضية','ملاحظات']);
  sheet.addRow(['اسم الشركة كما هو في التطبيق','أحمد بن صالح','1001','عامل','2026-01-01','08:00','']);
  [30,30,22,24,19,25,35].forEach((w,i)=>sheet.getColumn(i+1).width=w);beautify(sheet,7);
  await wb.xlsx.writeFile(res.filePath);return {saved:true,path:res.filePath};
}
function cellText(row,index){const cell=row.getCell(index),v=cell.value;if(v===null||v===undefined)return '';if(typeof v==='object')return String(v.text||v.result||'').trim();return String(v).trim();}
function punchTime(value){const m=/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(String(value||'').trim());if(!m)return null;const a=Number(m[1])*60+Number(m[2]),b=Number(m[3])*60+Number(m[4]);if(a>1439||b>1439)return null;return {inTime:`${String(Math.floor(a/60)).padStart(2,'0')}:${String(a%60).padStart(2,'0')}`,outTime:`${String(Math.floor(b/60)).padStart(2,'0')}:${String(b%60).padStart(2,'0')}`,minutes:(b-a+1440)%1440};}
function punchMonth(sheetName,fileName){const found=String(sheetName||'').match(/(20\d{2})(0[1-9]|1[0-2])\d{2}/)||String(fileName||'').match(/(20\d{2})(0[1-9]|1[0-2])\d{2}/);return found?`${found[1]}-${found[2]}`:'';}
async function importPunchFile(){
  if(currentUser?.role!=='MANAGER')throw new Error('هذه الوظيفة مخصصة لحساب المدير.');
  const res=await dialog.showOpenDialog(win,{title:'استيراد ملف pointeuse',properties:['openFile'],filters:[{name:'Excel',extensions:['xlsx']} ]});
  if(res.canceled||!res.filePaths?.length)return {canceled:true};
  const filePath=res.filePaths[0],stat=fs.statSync(filePath);if(stat.size>30*1024*1024)throw new Error('ملف pointeuse كبير جدًا (الحد 30MB).');
  const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(filePath);const records=new Map(),warnings=[];
  for(const ws of wb.worksheets){
    let headerRow=0;
    for(let r=1;r<=Math.min(ws.rowCount,10);r++)if(/^numéro d['’]employé$/i.test(cellText(ws.getRow(r),1))){headerRow=r;break;}
    const month=punchMonth(ws.name,path.basename(filePath));
    if(!headerRow||!month){warnings.push(`الورقة ${ws.name}: تعذّر تحديد رؤوس الأعمدة أو الشهر.`);continue;}
    const dayColumns=[];for(let c=4;c<=ws.columnCount;c++){const d=cellText(ws.getRow(headerRow),c);if(/^(?:0?[1-9]|[12]\d|3[01])$/.test(d))dayColumns.push({column:c,day:Number(d)});}
    const lastDay=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
    for(let r=headerRow+1;r<=ws.rowCount;r++){
      const row=ws.getRow(r),matricule=cellText(row,1);if(!matricule)continue;
      const fullName=cellText(row,2),department=cellText(row,3);
      for(const dc of dayColumns){if(dc.day>lastDay)continue;const time=punchTime(cellText(row,dc.column));if(!time)continue;const date=`${month}-${String(dc.day).padStart(2,'0')}`;records.set(`${matricule.toLowerCase()}|${date}`,{matricule,fullName,department,date,...time});}
    }
  }
  if(!records.size)throw new Error('لم يتم العثور على أوقات صالحة. استخدم ملف Pointage mensuel يحتوي رقم الموظف وأعمدة الأيام.');
  const item={id:`punch-${require('node:crypto').randomUUID()}`,fileName:path.basename(filePath),importedAt:new Date().toISOString(),records:[...records.values()]};
  const saved=await serverRequest('/punch/import',{method:'POST',data:{item}});dbCache=saved.data;
  return {canceled:false,import:{id:item.id,fileName:item.fileName,count:item.records.length},warnings:warnings.slice(0,10)};
}
async function punchList(){
  if(currentUser?.role!=='MANAGER')throw new Error('هذه الوظيفة مخصصة لحساب المدير.');
  return (await serverRequest('/punch/list')).items;
}
async function deletePunchImport(id){if(currentUser?.role!=='MANAGER')throw new Error('هذه الوظيفة مخصصة لحساب المدير.');const saved=await serverRequest('/punch/delete',{method:'POST',data:{id}});dbCache=saved.data;return true;}
async function importEmployees(){
  const res=await dialog.showOpenDialog(win,{title:'استيراد الموظفين من Excel',properties:['openFile'],filters:[{name:'Excel',extensions:['xlsx']}]});
  if(res.canceled||!res.filePaths?.length)return {canceled:true};
  const stat=fs.statSync(res.filePaths[0]);if(stat.size>10*1024*1024)throw new Error('الملف كبير جدًا (الحد 10MB).');
  const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(res.filePaths[0]);const sh=wb.worksheets[0];if(!sh)throw new Error('ملف Excel فارغ.');
  if(cellText(sh.getRow(1),1)!=='الشركة'||cellText(sh.getRow(1),2)!=='الاسم الكامل')throw new Error('استخدم النموذج الذي يُصدره التطبيق: أسماء الأعمدة غير مطابقة.');
  let db=readState(),added=0,errors=[];
  for(let r=2;r<=sh.rowCount;r++){
    const row=sh.getRow(r),companyName=cellText(row,1),fullName=cellText(row,2),matricule=cellText(row,3);
    if(!companyName&&!fullName&&!matricule)continue;
    try{
      const company=db.companies.find(x=>x.name.trim().toLowerCase()===companyName.toLowerCase());
      if(!company)throw new Error('الشركة غير موجودة: '+companyName);
      let joinDate=cellText(row,5)||'2026-01-01';
      if(typeof row.getCell(5).value==='object' && row.getCell(5).value instanceof Date)joinDate=row.getCell(5).value.toISOString().slice(0,10);
      const shiftText=cellText(row,6);
      let shift=db.shifts[0];
      if(shiftText){shift=db.shifts.find(s=>s.name===shiftText||s.start===shiftText||s.start.startsWith(shiftText.padStart(5,'0')));if(!shift)throw new Error('الفترة الافتراضية غير معروفة: '+shiftText);}
      db=core.mutate(db,'employee:save',{companyId:company.id,fullName,matricule,joinDate,defaultShiftId:shift.id,jobTitle:cellText(row,4),notes:cellText(row,7)}).state;added++;
    }catch(err){errors.push(`الصف ${r}: ${err.message}`);}
  }
  if(added){
    // Envoie chaque employé au serveur central afin que tous les PC le voient immédiatement.
    for(const employee of db.employees){
      if(!readState().employees.some(x=>x.id===employee.id)){
        const out=await serverRequest('/mutate',{method:'POST',data:{action:'employee:save',payload:employee}});dbCache=out.data;
      }
    }
  }
  return {added,errors:errors.slice(0,30),moreErrors:Math.max(0,errors.length-30)};
}
function installIpc(){
  handle('auth:login',async(username,password)=>{
    const login=await serverRequest('/auth/login',{method:'POST',data:{username,password},auth:false});
    sessionToken=login.token;currentUser=login.user;await refreshState();return currentUser;
  });
  handle('auth:logout',()=>{currentUser=null;sessionToken='';dbCache=null;return true;});
  handle('state:get',async()=>{const data=await refreshState();return {data,path:SERVER_URL};});
  handle('data:mutate',async(action,payload)=>{
    if(!['company:save','company:delete','shift:save','shift:delete','employee:save','employee:delete','shift:set','shift:clear','attendance:save','settings:save'].includes(action))throw new Error('طلب غير مسموح به.');
    const out=await serverRequest('/mutate',{method:'POST',data:{action,payload:payload||{}}});dbCache=out.data;return {result:out.result,data:out.data};
  });
  handle('report:export',exportReport);
  handle('manager:export',exportManagerComparison);
  handle('template:export',exportTemplate);
  handle('employees:import',importEmployees);
  handle('punch:import',importPunchFile);
  handle('punch:list',punchList);
  handle('punch:delete',deletePunchImport);
  handle('backup:save',async()=>{
    const state=readState();const res=await saveDialog(path.join(app.getPath('downloads'),`نسخة-الحضور-${new Date().toISOString().slice(0,10)}.json`),[{name:'نسخة احتياطية JSON',extensions:['json']}]);
    if(res.canceled||!res.filePath)return {saved:false};
    fs.writeFileSync(res.filePath,JSON.stringify(state,null,2),'utf8');return {saved:true,path:res.filePath};
  });
  handle('backup:restore',async()=>{
    const res=await dialog.showOpenDialog(win,{title:'استرجاع نسخة احتياطية',properties:['openFile'],filters:[{name:'ملفات JSON',extensions:['json']}]});
    if(res.canceled||!res.filePaths?.length)return {restored:false};
    const f=res.filePaths[0];if(fs.statSync(f).size>30*1024*1024)throw new Error('ملف النسخة الاحتياطية كبير جدًا.');
    const restored=core.validateState(JSON.parse(fs.readFileSync(f,'utf8')));
    const answer=await dialog.showMessageBox(win,{type:'warning',buttons:['إلغاء','تأكيد الاسترجاع'],defaultId:0,cancelId:0,title:'تأكيد استرجاع نسخة احتياطية',message:'سيتم استبدال البيانات الحالية بمحتويات الملف المحدد.',detail:'سيُحفظ ملف حماية من البيانات الحالية أولًا في مجلد التطبيق.'});
    if(answer.response!==1)return {restored:false};
    const current=mainFile();if(fs.existsSync(current))fs.copyFileSync(current,current+'.before-restore-'+Date.now()+'.json');
    const saved=await serverRequest('/backup/restore',{method:'POST',data:{data:restored}});dbCache=saved.data;return {restored:true,data:saved.data};
  });
  handle('app:openDataFolder',()=>{shell.showItemInFolder(mainFile());return true;});
  handle('app:version',()=>app.getVersion());
}
function createWindow(){
  win=new BrowserWindow({width:1470,height:900,minWidth:1000,minHeight:650,title:'حضور المجموعة | نظام الشركات والمناوبات',backgroundColor:'#f3f6fa',show:false,webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(e,url)=>{if(url!==win.webContents.getURL())e.preventDefault();});
  win.loadFile(path.join(__dirname,'index.html'));
  win.once('ready-to-show',()=>win.show());
}
function setupAutoUpdater(){
  // Development runs and the LAN server never check GitHub. Installed client apps do.
  if(!app.isPackaged)return;
  autoUpdater.autoDownload=true;
  autoUpdater.on('update-downloaded',async()=>{
    const answer=await dialog.showMessageBox(win,{type:'info',title:'تحديث جاهز',message:'تم تنزيل تحديث جديد للتطبيق.',detail:'أغلق التطبيق وثبّت التحديث الآن. لن تتغير بيانات الحضور الموجودة على الخادم.',buttons:['لاحقًا','تثبيت الآن وإعادة التشغيل'],defaultId:1,cancelId:0});
    if(answer.response===1)autoUpdater.quitAndInstall();
  });
  // A temporary GitHub/network issue must never prevent the attendance app from opening.
  autoUpdater.checkForUpdates().catch(error=>console.warn('Update check unavailable:',error.message));
}
app.whenReady().then(()=>{Menu.setApplicationMenu(null);installIpc();createWindow();setupAutoUpdater();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
