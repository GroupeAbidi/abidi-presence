'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const c=require('../src/core');
let db;
function addCompany(name='شركة الحبوب'){const r=c.mutate(db,'company:save',{name});db=r.state;return r.result;}
function addEmployee(companyId,matricule='0001'){
  const r=c.mutate(db,'employee:save',{companyId,fullName:'أحمد بن صالح',matricule,defaultShiftId:'shift-8-16',joinDate:'2026-01-01'});
  db=r.state;return r.result;
}
function doMutate(action,payload){const r=c.mutate(db,action,payload);db=r.state;return r.result;}
test.beforeEach(()=>{db=c.newState();});
test('new data includes RH and manager accounts with password hashes',()=>{
  assert.deepEqual(db.users.map(u=>u.role).sort(),['MANAGER','RH']);
  assert.equal(db.users.find(u=>u.username==='rh').passwordHash,c.passwordHash('rh1234'));
  assert.doesNotThrow(()=>c.validateState(db));
});
test('7.45 means 7 h 45 min, not a decimal hour',()=>{
  assert.deepEqual(c.parseAttendance('7.45'),{value:'7.45',status:'WORK',minutes:465});
  assert.equal(c.parseAttendance('٧:٤٥').minutes,465);
  assert.equal(c.parseAttendance('8').minutes,480);
  assert.equal(c.parseAttendance('0').minutes,0);
  assert.equal(c.parseAttendance('24').minutes,1440);
  assert.equal(c.parseAttendance('7.5').minutes,425);
  assert.throws(()=>c.parseAttendance('7.75'),/الدقائق/);
  assert.throws(()=>c.parseAttendance('24.01'),/الدقائق/);
  assert.equal(c.parseAttendance(''),null);
});
test('overtime accepts Arabic and H+ notation and remains separate from normal hours',()=>{
  assert.deepEqual(c.parseOvertime('4 س'),{value:'4',minutes:240});
  assert.deepEqual(c.parseOvertime('H+4:30'),{value:'4.30',minutes:270});
  const e=addEmployee(addCompany().id);
  doMutate('attendance:save',{employeeId:e.id,date:'2026-10-14',value:'8',overtime:'4 + H'});
  const rec=c.getRecord(db,e.id,'2026-10-14');
  assert.equal(rec.minutes,480);assert.equal(rec.overtimeMinutes,240);assert.equal(rec.overtimeValue,'4');
  assert.equal(c.monthlySummary(db,e,'2026-10').overtimeMinutes,240);
  assert.throws(()=>doMutate('attendance:save',{employeeId:e.id,date:'2026-10-15',value:'C',overtime:'4'}),/لا يمكن/);
});
test('leave/sickness/rest/mission/absence codes are accepted',()=>{
  for(const status of ['C','M','R','MIS','A'])assert.deepEqual(c.parseAttendance(status),{value:status,status,minutes:0});
  assert.equal(c.parseAttendance('mis').status,'MIS');
  assert.throws(()=>c.parseAttendance('XX'),/رمز/);
});
test('night and afternoon shifts correctly pass midnight',()=>{
  assert.equal(c.shiftDuration(db.shifts[0]),480);
  assert.equal(c.shiftDuration(db.shifts[1]),480);
  assert.equal(c.shiftDuration(db.shifts[2]),480);
  assert.equal(c.shiftDuration({start:'22:30',end:'06:15',breakMinutes:45}),420);
  assert.throws(()=>c.shiftDuration({start:'08:00',end:'08:00',breakMinutes:0}),/متساويتين/);
});
test('a shift change persists from the chosen date and later changes supersede it',()=>{
  const e=addEmployee(addCompany().id);
  assert.equal(c.getShift(db,e,'2026-10-13').id,'shift-8-16');
  doMutate('shift:set',{employeeId:e.id,date:'2026-10-15',shiftId:'shift-00-08'});
  assert.equal(c.getShift(db,e,'2026-10-14').id,'shift-8-16');
  assert.equal(c.getShift(db,e,'2026-10-15').id,'shift-00-08');
  assert.equal(c.getShift(db,e,'2026-10-19').id,'shift-00-08');
  doMutate('shift:set',{employeeId:e.id,date:'2026-10-21',shiftId:'shift-16-00'});
  assert.equal(c.getShift(db,e,'2026-10-20').id,'shift-00-08');
  assert.equal(c.getShift(db,e,'2026-10-21').id,'shift-16-00');
  assert.equal(c.getShift(db,e,'2026-11-01').id,'shift-16-00');
  doMutate('shift:clear',{employeeId:e.id,date:'2026-10-21'});
  assert.equal(c.getShift(db,e,'2026-11-01').id,'shift-00-08');
});
test('monthly report accumulates minute-accurate totals and statuses',()=>{
  const e=addEmployee(addCompany().id);
  doMutate('attendance:save',{employeeId:e.id,date:'2026-02-01',value:'7.45'});
  doMutate('attendance:save',{employeeId:e.id,date:'2026-02-02',value:'8'});
  for(const [date,value] of [['2026-02-03','C'],['2026-02-04','M'],['2026-02-05','R'],['2026-02-06','MIS'],['2026-02-07','A']])doMutate('attendance:save',{employeeId:e.id,date,value});
  const sum=c.monthlySummary(db,e,'2026-02');
  assert.equal(sum.workMinutes,945);
  assert.equal(sum.workDays,2);
  assert.equal(sum.C,1);assert.equal(sum.M,1);assert.equal(sum.R,1);assert.equal(sum.MIS,1);assert.equal(sum.A,1);
  assert.equal(sum.recorded,7);
  assert.equal(sum.empty,21);
});
test('blank attendance removes an old record but does not change employee shift',()=>{
  const e=addEmployee(addCompany().id);
  doMutate('attendance:save',{employeeId:e.id,date:'2026-10-10',value:'8',note:'ساعات نهارية'});
  doMutate('attendance:save',{employeeId:e.id,date:'2026-10-10',value:'',note:''});
  assert.equal(c.getRecord(db,e.id,'2026-10-10'),null);
  assert.equal(c.getShift(db,e,'2026-10-10').id,'shift-8-16');
});
test('company and matricule duplicate prevention, cross-company reuse allowed',()=>{
  const a=addCompany(),b=addCompany('شركة المطحنة');
  addEmployee(a.id,'12');
  assert.throws(()=>addEmployee(a.id,'12'),/مستخدم/);
  assert.doesNotThrow(()=>addEmployee(b.id,'12'));
  assert.throws(()=>addCompany(),/موجودة/);
  assert.throws(()=>doMutate('company:delete',{id:a.id}),/لا يمكن/);
});
test('employee start and end dates limit attendance without losing past data',()=>{
  const e=addEmployee(addCompany().id);
  doMutate('employee:save',{...e,endDate:'2026-10-31'});
  assert.throws(()=>doMutate('attendance:save',{employeeId:e.id,date:'2026-11-01',value:'8'}),/خارج/);
  assert.equal(c.employeeInMonth(db.employees[0],'2026-10'),true);
  assert.equal(c.employeeInMonth(db.employees[0],'2026-11'),false);
});
test('state stays consistent and does not mutate on a rejected operation',()=>{
  const e=addEmployee(addCompany().id);const serialized=JSON.stringify(db);
  assert.throws(()=>doMutate('attendance:save',{employeeId:e.id,date:'2026-02-30',value:'7.45'}),/التاريخ/);
  assert.equal(JSON.stringify(db),serialized);
  c.validateState(db);
});
