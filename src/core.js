'use strict';

const STATUS_NAMES = Object.freeze({WORK:'حضور', C:'عطلة', M:'مرض', R:'راحة', MIS:'مهمة', A:'غياب'});
const DEFAULT_SHIFTS = [
  {id:'shift-8-16', name:'الصباحية', start:'08:00', end:'16:00', breakMinutes:0},
  {id:'shift-16-00', name:'المسائية', start:'16:00', end:'00:00', breakMinutes:0},
  {id:'shift-00-08', name:'الليلية', start:'00:00', end:'08:00', breakMinutes:0}
];
const clone = v => JSON.parse(JSON.stringify(v));
const err = msg => { throw new Error(msg); };
const trim = (v, max=160) => String(v??'').trim().slice(0,max);
const passwordHash = value => require('node:crypto').createHash('sha256').update(String(value)).digest('hex');
const DEFAULT_USERS = Object.freeze([
  {id:'user-rh',username:'rh',displayName:'الموارد البشرية',role:'RH',passwordHash:passwordHash('rh1234')},
  {id:'user-manager',username:'manager',displayName:'المدير',role:'MANAGER',passwordHash:passwordHash('manager1234')}
]);
const DEFAULT_PUNCH_RULES = Object.freeze({lateGraceMinutes:15,earlyGraceMinutes:10,deductionBlockMinutes:15});
function punchRules(value={}){
  const number=(key,fallback)=>{const n=Number(value[key]);return Number.isInteger(n)&&n>=0&&n<=240?n:fallback;};
  return {lateGraceMinutes:number('lateGraceMinutes',DEFAULT_PUNCH_RULES.lateGraceMinutes),earlyGraceMinutes:number('earlyGraceMinutes',DEFAULT_PUNCH_RULES.earlyGraceMinutes),deductionBlockMinutes:Math.max(1,number('deductionBlockMinutes',DEFAULT_PUNCH_RULES.deductionBlockMinutes))};
}
const arabicToLatin = s => String(s).replace(/[٠-٩]/g, n => String(n.charCodeAt(0)-0x660)).replace(/[۰-۹]/g, n => String(n.charCodeAt(0)-0x6F0));

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const [y,m,d] = value.split('-').map(Number);
  const dt=new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear()===y && dt.getUTCMonth()===m-1 && dt.getUTCDate()===d && y>=2000 && y<=2100;
}
function validDate(value,required=true) {
  if (!value && !required) return '';
  if (!isDate(value)) err('التاريخ غير صحيح.');
  return String(value);
}
function isMonth(v) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(v||''); }
function monthDays(month) { if(!isMonth(month)) err('الشهر غير صحيح.'); const [y,m]=month.split('-').map(Number); return new Date(y,m,0).getDate(); }
function dayList(month) { return Array.from({length:monthDays(month)},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`); }
function timeMinutes(t) { if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t||'')) err('صيغة الوقت يجب أن تكون HH:MM بين 00:00 و23:59.'); return (+t.slice(0,2))*60+(+t.slice(3)); }
function shiftDuration(s) { const a=timeMinutes(s.start), b=timeMinutes(s.end); if(a===b) err('بداية ونهاية الفترة لا يمكن أن تكونا متساويتين.'); const total=(b-a+1440)%1440; const pause=Number(s.breakMinutes)||0; if(!Number.isInteger(pause)||pause<0||pause>=total) err('مدة الاستراحة غير صحيحة.'); return total-pause; }
function durationText(min) { const a=Math.max(0,Number(min)||0); return `${Math.floor(a/60)}س ${String(a%60).padStart(2,'0')}د`; }

function parseDuration(input, fieldName='الساعات') {
  const raw=arabicToLatin(trim(input,40)).replace(/،/g,',').toUpperCase();
  if(!raw) return null;
  const clean=raw.replace(',','.');
  const m=/^(\d{1,2})(?:[.:](\d{1,2}))?$/.exec(clean);
  if(!m) err(`اكتب ${fieldName} مثل 4 أو 4:30.`);
  const h=Number(m[1]), min=Number(m[2]||0);
  if(h>24||min>=60||(h===24&&min>0)) err(`عدد ${fieldName} أو الدقائق غير صحيح.`);
  return {value: min?`${h}.${String(min).padStart(2,'0')}`:String(h),minutes:h*60+min};
}
function parseAttendance(input) {
  const raw=arabicToLatin(trim(input,40)).replace(/،/g,',').toUpperCase();
  if(!raw) return null;
  if(['C','M','R','MIS','A'].includes(raw)) return {value:raw,status:raw,minutes:0};
  return {...parseDuration(raw,'ساعات الحضور أو رمزًا: C / M / R / MIS / A'),status:'WORK'};
}
function parseOvertime(input) {
  const raw=arabicToLatin(trim(input,40)).toUpperCase();
  if(!raw) return null;
  // تقبل: 4، 4:30، 4 س، H+4 و4+H.
  return parseDuration(raw.replace(/\s+/g,'').replace(/س(?:اعة|اعات)?/g,'').replace(/H/g,'').replace(/\+/g,''),'الساعات الإضافية');
}
function newState() {
  return {version:1,companies:[],employees:[],shifts:clone(DEFAULT_SHIFTS),shiftChanges:[],attendance:[],punchImports:[],users:clone(DEFAULT_USERS),settings:{groupName:'المجموعة',createdAt:new Date().toISOString(),punchRules:clone(DEFAULT_PUNCH_RULES)}};
}
function validateState(d) {
  if(!d||d.version!==1) err('ملف النسخة الاحتياطية غير متوافق مع هذا الإصدار.');
  if(!Array.isArray(d.users)) d.users=clone(DEFAULT_USERS);
  if(!Array.isArray(d.punchImports)) d.punchImports=[];
  for(const k of ['companies','employees','shifts','shiftChanges','attendance']) if(!Array.isArray(d[k])||d[k].length>200000) err(`البيانات غير صالحة (${k}).`);
  if(d.users.length<2||d.users.length>50||d.users.some(u=>!u||!['RH','MANAGER'].includes(u.role)||!trim(u.username,60)||!trim(u.displayName,120)||!/^[a-f0-9]{64}$/.test(u.passwordHash||''))) err('حسابات المستخدمين غير صالحة.');
  if(d.punchImports.length>50||d.punchImports.some(x=>!x||typeof x.id!=='string'||!Array.isArray(x.records)||x.records.length>100000)) err('ملفات pointeuse غير صالحة.');
  if(!d.settings||typeof d.settings!=='object') err('إعدادات النسخة الاحتياطية غير صالحة.');
  d.settings.punchRules=punchRules(d.settings.punchRules);
  const unique=(list,name) => { const all=new Set(); for(const x of list){ if(!x||typeof x.id!=='string'||!x.id||all.has(x.id)) err(`معرّفات غير صحيحة في ${name}.`); all.add(x.id);} };
  for(const k of ['companies','employees','shifts','shiftChanges','attendance']) unique(d[k],k);
  for(const s of d.shifts) shiftDuration(s);
  for(const e of d.employees) if(!d.companies.some(c=>c.id===e.companyId)||!d.shifts.some(s=>s.id===e.defaultShiftId)) err('موظف مرتبط بشركة أو فترة غير موجودة.');
  for(const c of d.shiftChanges) if(!isDate(c.date)||!d.employees.some(e=>e.id===c.employeeId)||!d.shifts.some(s=>s.id===c.shiftId)) err('سجل تغيير فترة غير صالح.');
  for(const a of d.attendance) {
    const parsed=parseAttendance(a.value);
    if(!isDate(a.date)||!d.employees.some(e=>e.id===a.employeeId)||parsed?.status!==a.status) err('سجل حضور غير صالح.');
    if(a.overtimeMinutes!==undefined&&(!Number.isInteger(a.overtimeMinutes)||a.overtimeMinutes<0||a.overtimeMinutes>1440)) err('ساعات إضافية غير صالحة.');
  }
  return d;
}
function employeeOnDate(emp,date) {return emp.joinDate<=date && (!emp.endDate||date<=emp.endDate);}
function employeeInMonth(emp,month) {const ds=dayList(month); return emp.joinDate<=ds.at(-1)&&(!emp.endDate||emp.endDate>=ds[0]);}
function effectiveShiftId(db, emp, date) {
  const changes=db.shiftChanges.filter(s=>s.employeeId===emp.id&&s.date<=date).sort((a,b)=>b.date.localeCompare(a.date));
  return changes[0]?.shiftId || emp.defaultShiftId;
}
function getShift(db,emp,date) {return db.shifts.find(s=>s.id===effectiveShiftId(db,emp,date))||db.shifts[0]||null;}
function getRecord(db,empId,date) {return db.attendance.find(a=>a.employeeId===empId&&a.date===date)||null;}
function monthlySummary(db,employee,month) {
  const out={employee,workMinutes:0,overtimeMinutes:0,workDays:0,C:0,M:0,R:0,MIS:0,A:0,empty:0,plannedMinutes:0,recorded:0};
  for(const date of dayList(month)) {
    if(!employeeOnDate(employee,date)) continue;
    const rec=getRecord(db,employee.id,date);
    if(!rec) {out.empty++;continue;}
    out.recorded++;
    if(rec.status==='WORK') {out.workMinutes+=rec.minutes;out.overtimeMinutes+=rec.overtimeMinutes||0;out.workDays++;}
    else if(Object.hasOwn(out,rec.status)) out[rec.status]++;
    const shift=getShift(db,employee,date);
    if(shift) out.plannedMinutes+=shiftDuration(shift);
  }
  return out;
}
function nextId(prefix) {return `${prefix}-${require('node:crypto').randomUUID()}`;}
function needId(db,key,id) {const item=db[key].find(x=>x.id===id);if(!item)err('العنصر المطلوب غير موجود.'); return item;}
function saveCompany(db,p){
  const name=trim(p.name,120); if(!name)err('أدخل اسم الشركة.');
  if(db.companies.some(c=>c.name.toLowerCase()===name.toLowerCase()&&c.id!==p.id))err('هذه الشركة موجودة مسبقًا.');
  const old=p.id?needId(db,'companies',p.id):null;
  const c={id:old?.id||nextId('co'),name,code:trim(p.code,30),notes:trim(p.notes,300)};
  if(old)Object.assign(old,c);else db.companies.push(c);return c;
}
function deleteCompany(db,id){needId(db,'companies',id);if(db.employees.some(e=>e.companyId===id))err('لا يمكن حذف شركة لها موظفون. انقل الموظفين أو احذفهم أولًا.');db.companies=db.companies.filter(c=>c.id!==id);}
function saveShift(db,p){
  const name=trim(p.name,100), start=trim(p.start,5),end=trim(p.end,5),breakMinutes=Number(p.breakMinutes??0);
  if(!name)err('أدخل اسم الفترة.');
  const s={id:p.id?needId(db,'shifts',p.id).id:nextId('sh'),name,start,end,breakMinutes};shiftDuration(s);
  const old=db.shifts.find(x=>x.id===s.id);if(old)Object.assign(old,s);else db.shifts.push(s);return s;
}
function deleteShift(db,id){needId(db,'shifts',id);if(db.shifts.length<=1)err('يجب الإبقاء على فترة واحدة على الأقل.');if(db.employees.some(e=>e.defaultShiftId===id)||db.shiftChanges.some(s=>s.shiftId===id))err('الفترة مستخدمة في سجلات الموظفين أو تغيير الفترات.');db.shifts=db.shifts.filter(s=>s.id!==id);}
function saveEmployee(db,p){
  const fullName=trim(p.fullName,120),matricule=trim(p.matricule,60),companyId=trim(p.companyId,120),defaultShiftId=trim(p.defaultShiftId,120),jobTitle=trim(p.jobTitle,100),notes=trim(p.notes,300);
  if(!fullName||!matricule)err('الاسم الكامل والرقم التعريفي إلزاميان.');
  needId(db,'companies',companyId);needId(db,'shifts',defaultShiftId);
  const joinDate=validDate(p.joinDate),endDate=validDate(p.endDate,false);
  if(endDate&&endDate<joinDate)err('تاريخ نهاية العمل أقدم من تاريخ البداية.');
  if(db.employees.some(e=>e.companyId===companyId&&e.matricule.toLowerCase()===matricule.toLowerCase()&&e.id!==p.id))err('هذا الرقم التعريفي مستخدم في هذه الشركة.');
  const e={id:p.id?needId(db,'employees',p.id).id:nextId('emp'),fullName,matricule,companyId,defaultShiftId,joinDate,endDate,jobTitle,notes};
  const old=db.employees.find(x=>x.id===e.id);if(old)Object.assign(old,e);else db.employees.push(e);return e;
}
function deleteEmployee(db,id){needId(db,'employees',id);db.employees=db.employees.filter(e=>e.id!==id);db.attendance=db.attendance.filter(a=>a.employeeId!==id);db.shiftChanges=db.shiftChanges.filter(a=>a.employeeId!==id);}
function setShift(db,p){
  const employee=needId(db,'employees',p.employeeId),date=validDate(p.date);needId(db,'shifts',p.shiftId);
  if(date<employee.joinDate||(employee.endDate&&date>employee.endDate))err('التاريخ خارج فترة عمل الموظف.');
  const existing=db.shiftChanges.find(x=>x.employeeId===p.employeeId&&x.date===date);
  if(existing)existing.shiftId=p.shiftId;
  else db.shiftChanges.push({id:nextId('change'),employeeId:p.employeeId,date,shiftId:p.shiftId});
}
function clearShift(db,p){validDate(p.date);needId(db,'employees',p.employeeId);db.shiftChanges=db.shiftChanges.filter(x=>!(x.employeeId===p.employeeId&&x.date===p.date));}
function saveAttendance(db,p){
  const employee=needId(db,'employees',p.employeeId),date=validDate(p.date);
  if(!employeeOnDate(employee,date))err('التاريخ خارج فترة عمل الموظف.');
  const parsed=parseAttendance(p.value),overtime=parseOvertime(p.overtime),note=trim(p.note,300);
  const idx=db.attendance.findIndex(a=>a.employeeId===p.employeeId&&a.date===date);
  if(!parsed&&!overtime&&!note) {if(idx>=0)db.attendance.splice(idx,1);return null;}
  if(!parsed)err('أدخل قيمة الحضور قبل إضافة الساعات الإضافية أو الملاحظة.');
  if(parsed.status!=='WORK'&&overtime)err('لا يمكن إضافة ساعات إضافية مع حالة غير الحضور.');
  const rec={id:idx>=0?db.attendance[idx].id:nextId('att'),employeeId:p.employeeId,date,...parsed,overtimeMinutes:overtime?.minutes||0,overtimeValue:overtime?.value||'',note};
  if(idx>=0) db.attendance[idx]=rec;else db.attendance.push(rec);return rec;
}
function mutate(original,action,payload={}) {
  const db=clone(original);validateState(db);let result=null;
  switch(action){
    case 'company:save':result=saveCompany(db,payload);break;
    case 'company:delete':result=deleteCompany(db,payload.id);break;
    case 'shift:save':result=saveShift(db,payload);break;
    case 'shift:delete':result=deleteShift(db,payload.id);break;
    case 'employee:save':result=saveEmployee(db,payload);break;
    case 'employee:delete':result=deleteEmployee(db,payload.id);break;
    case 'shift:set':result=setShift(db,payload);break;
    case 'shift:clear':result=clearShift(db,payload);break;
    case 'attendance:save':result=saveAttendance(db,payload);break;
    case 'settings:save':if(payload.groupName!==undefined)db.settings.groupName=trim(payload.groupName,100)||'المجموعة';if(payload.punchRules!==undefined)db.settings.punchRules=punchRules(payload.punchRules);break;
    default:err('طلب غير معروف.');
  }
  return {state:db,result};
}
module.exports={STATUS_NAMES,DEFAULT_SHIFTS,DEFAULT_USERS,DEFAULT_PUNCH_RULES,punchRules,clone,trim,passwordHash,arabicToLatin,isDate,validDate,isMonth,dayList,monthDays,shiftDuration,durationText,parseAttendance,parseOvertime,newState,validateState,employeeOnDate,employeeInMonth,effectiveShiftId,getShift,getRecord,monthlySummary,mutate};
