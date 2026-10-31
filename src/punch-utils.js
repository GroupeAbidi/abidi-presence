'use strict';
(function(root){
  const code=value=>String(value||'').trim().toLowerCase();
  const time=value=>{const m=/^(\d{2}):(\d{2})$/.exec(String(value||''));return m&&Number(m[1])<24&&Number(m[2])<60?Number(m[1])*60+Number(m[2]):null;};
  const nextDate=date=>{const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const duration=(inTime,outTime)=>{const start=time(inTime),end=time(outTime);return start===null||end===null?0:(end-start+1440)%1440;};
  const overnight=shift=>{const start=time(shift?.start),end=time(shift?.end);return start!==null&&end!==null&&end<=start;};
  function normalizePunchImports(imports,employeeByCode,getShift){
    const out=[];
    for(const item of imports||[]){
      const byKey=new Map((item.records||[]).map(x=>[`${code(x.matricule)}|${x.date}`,x]));
      for(const raw of item.records||[]){
        const employee=employeeByCode.get(code(raw.matricule)),shift=employee&&getShift(employee,raw.date);
        if(!employee||!overnight(shift)){out.push({...raw,minutes:duration(raw.inTime,raw.outTime)});continue;}
        const following=byKey.get(`${code(raw.matricule)}|${nextDate(raw.date)}`);
        // The first time is yesterday's exit; the second is today's entry.
        if(!following)continue;
        const inTime=raw.outTime,outTime=following.inTime;
        if(time(inTime)===null||time(outTime)===null)continue;
        out.push({...raw,inTime,outTime,minutes:duration(inTime,outTime),overnightPaired:true});
      }
    }
    return out;
  }
  const api={nextDate,duration,overnight,normalizePunchImports};
  if(typeof module!=='undefined')module.exports=api;
  root.PunchUtils=api;
})(typeof window!=='undefined'?window:globalThis);
