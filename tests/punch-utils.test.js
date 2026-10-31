'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const punch=require('../src/punch-utils');
const employee={id:'e1',matricule:'G0279'};
const night={start:'16:00',end:'00:00'};
test('keeps daytime machine pointage in its original order',()=>{
  const result=punch.normalizePunchImports([{records:[{matricule:'G0279',date:'2026-10-02',inTime:'08:00',outTime:'16:00'}]}],new Map([['g0279',employee]]),()=>({start:'08:00',end:'16:00'}));
  assert.deepEqual(result[0].inTime,'08:00');assert.deepEqual(result[0].outTime,'16:00');assert.equal(result[0].minutes,480);
});
test('pairs overnight entry with the following day exit',()=>{
  const result=punch.normalizePunchImports([{records:[{matricule:'G0279',date:'2026-10-02',inTime:'00:04',outTime:'15:51'},{matricule:'G0279',date:'2026-10-03',inTime:'00:02',outTime:'15:50'}]}],new Map([['g0279',employee]]),()=>night);
  assert.equal(result.length,1);assert.deepEqual({in:result[0].inTime,out:result[0].outTime,minutes:result[0].minutes},{in:'15:51',out:'00:02',minutes:491});
});
test('ignores an incomplete overnight shift at the end of a file',()=>{
  const result=punch.normalizePunchImports([{records:[{matricule:'G0279',date:'2026-10-02',inTime:'00:04',outTime:'15:51'}]}],new Map([['g0279',employee]]),()=>night);
  assert.equal(result.length,0);
});
