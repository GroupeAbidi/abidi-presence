'use strict';
const api=window.attendanceAPI;
const el=id=>document.getElementById(id);
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const currentDay=today();
const state={data:null,path:'',user:null,page:'dashboard',day:currentDay,month:currentDay.slice(0,7),view:'daily',attCompany:'',reportCompany:'',employeeCompany:'',search:'',reportMonth:currentDay.slice(0,7),employeeSearch:'',companySearch:'',managerFilter:'issues',managerImportId:'all',selected:new Set(),saving:false};
const sections={dashboard:['نظرة عامة','لوحة التحكم','متابعة مؤشرات الحضور والشركات من مكان واحد.'],attendance:['المتابعة اليومية','تسجيل الحضور','سجّل الساعات وحالات الغياب، وغيّر الفترة عند الحاجة.'],reports:['متابعة الأداء','التقارير والتحليل','مراجعة الحضور والساعات لكل شركة ولكل موظف.'],manager:['مراجعة الإدارة','مراقبة pointeuse','استيراد ملف البصمة ومقارنته بسجل حضور الموارد البشرية.'],companies:['إدارة المجموعة','الشركات','أضف شركات المجموعة ونظّم الموظفين حسب الشركة.'],employees:['الموارد البشرية','الموظفون','ملفات الموظفين والأرقام التعريفية وفترات العمل الأساسية.'],shifts:['تنظيم العمل','فترات العمل','عرّف المناوبات النهارية والليلية وغيرها.'],settings:['الإدارة المحلية','الإعدادات والنسخ الاحتياطي','التحكم باسم المجموعة وحماية البيانات.'],help:['المساعدة','دليل الاستخدام','شرح مبسّط لتسجيل الحضور وتغيير الفترات.']};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byId=(key,id)=>state.data[key].find(x=>x.id===id);
const companyOf=emp=>byId('companies',emp.companyId)?.name||'شركة محذوفة';
const dateAR=d=>{if(!d)return '';try{return new Intl.DateTimeFormat('ar-DZ',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(d+'T12:00:00'));}catch{return d;}};
const dayTitle=d=>new Intl.DateTimeFormat('ar-DZ',{weekday:'short'}).format(new Date(d+'T12:00:00'));
const formatMinutes=x=>`${Math.floor((x||0)/60)}س ${String((x||0)%60).padStart(2,'0')}د`;
const dateList=month=>{const [y,m]=month.split('-').map(Number),days=new Date(y,m,0).getDate();return Array.from({length:days},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`)};
const activeOn=(e,d)=>e.joinDate<=d&&(!e.endDate||e.endDate>=d);
const inMonth=(e,m)=>e.joinDate<=dateList(m).at(-1)&&(!e.endDate||e.endDate>=m+'-01');
const records=()=>state.data.attendance;
const record=(id,d)=>records().find(x=>x.employeeId===id&&x.date===d);
function effectiveShift(e,d){const ev=state.data.shiftChanges.filter(x=>x.employeeId===e.id&&x.date<=d).sort((a,b)=>b.date.localeCompare(a.date));return byId('shifts',ev[0]?.shiftId||e.defaultShiftId)||state.data.shifts[0];}
const changeOn=(id,d)=>state.data.shiftChanges.find(x=>x.employeeId===id&&x.date===d);
function shiftMinutes(s){if(!s)return 0;const t=v=>Number(v.slice(0,2))*60+Number(v.slice(3));return (t(s.end)-t(s.start)+1440)%1440-(s.breakMinutes||0);}
function summary(e,month){const x={e,workMinutes:0,overtimeMinutes:0,workDays:0,C:0,M:0,R:0,MIS:0,A:0,empty:0,recorded:0};for(const d of dateList(month)){if(!activeOn(e,d))continue;const a=record(e.id,d);if(!a){x.empty++;continue;}x.recorded++;if(a.status==='WORK'){x.workMinutes+=a.minutes;x.overtimeMinutes+=a.overtimeMinutes||0;x.workDays++;}else if(Object.hasOwn(x,a.status))x[a.status]++;}return x;}
const names={WORK:'حضور',C:'عطلة',M:'مرض',R:'راحة',MIS:'مهمة',A:'غياب'};
const cssStatus=s=>s?`code-${s.toLowerCase()}`:'';
const opt=(items,value,label)=>items.map(x=>`<option value="${esc(x.id)}" ${x.id===value?'selected':''}>${esc(label?label(x):x.name)}</option>`).join('');
const companyOptions=(value,allText='كل الشركات')=>`<option value="">${allText}</option>`+opt(state.data.companies,value);
const periodLabel=s=>`${s.name} (\u2066${s.start} — ${s.end}\u2069)`;
const avatar=e=>`<span class="mini-avatar">${esc((e.fullName||'?').slice(0,1))}</span>`;
function empty(title,text,button='',action=''){return `<div class="empty"><div class="empty-symbol">▤</div><strong>${esc(title)}</strong><p>${esc(text)}</p>${button?`<button class="btn primary" data-action="${action}">＋ ${esc(button)}</button>`:''}</div>`;}
function heading(extra=''){const [ey,title,description]=sections[state.page];return `<div class="page-heading"><div><div class="eyebrow">${ey}</div><h1>${title}</h1><p>${description}</p></div><div class="actions">${extra}</div></div>`;}
function kpi(label,value,sub,icon='◷',variant=''){return `<div class="kpi ${variant}"><span class="kpi-icon">${icon}</span><label>${esc(label)}</label><strong>${esc(value)}</strong><p>${esc(sub)}</p></div>`;}
function panel(title,body,extra='',subtitle=''){return `<div class="panel"><div class="panel-head"><div><h2>${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${extra}</div>${body}</div>`;}
function table(headers,rows){return `<div class="table-wrap"><table class="table"><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;}
function pageDashboard(){
  const db=state.data,d=state.day,active=db.employees.filter(e=>activeOn(e,d));
  const present=active.filter(e=>record(e.id,d)?.status==='WORK'),totalMinutes=present.reduce((s,e)=>s+(record(e.id,d)?.minutes||0),0);
  const statuses=active.map(e=>record(e.id,d));const recorded=statuses.filter(Boolean).length;
  const month=state.month,monthAll=db.employees.filter(e=>inMonth(e,month)).map(e=>summary(e,month));
  const companyCounts=db.companies.map(c=>({name:c.name,count:db.employees.filter(e=>e.companyId===c.id&&activeOn(e,d)).length})).sort((a,b)=>b.count-a.count);
  const max=Math.max(...companyCounts.map(x=>x.count),1);
  const companyBar=companyCounts.length?`<div class="panel-body stat-list">${companyCounts.slice(0,7).map(c=>`<div class="stat-line"><span title="${esc(c.name)}">${esc(c.name.length>18?c.name.slice(0,17)+'…':c.name)}</span><div class="progress"><i style="width:${Math.round(c.count/max*100)}%"></i></div><strong>${c.count}</strong></div>`).join('')}</div>`:empty('لا توجد شركات','ابدأ بإضافة أول شركة للمجموعة.','إضافة شركة','add-company');
  const recent=[...db.employees].sort((a,b)=>b.id.localeCompare(a.id)).slice(0,6);
  const recentHtml=recent.length?`<div class="compact-list">${recent.map(e=>`<div class="activity"><div class="avatar">${esc(e.fullName.slice(0,1))}</div><div class="info"><strong>${esc(e.fullName)}</strong><small>${esc(companyOf(e))} · ${esc(e.matricule)}</small></div><span class="badge ${activeOn(e,d)?'ok':'warn'}">${activeOn(e,d)?'نشط':'خارج الفترة'}</span></div>`).join('')}</div>`:empty('لا يوجد موظفون','أضف شركة ثم موظفيها لبدء تسجيل الحضور.','إضافة موظف','add-employee');
  const monthMinutes=monthAll.reduce((s,x)=>s+x.workMinutes,0);
  return heading(`<button class="btn" data-action="go-reports">عرض التقارير</button><button class="btn primary" data-action="go-attendance">＋ تسجيل الحضور</button>`)+
  `<div class="kpi-grid">${kpi('الشركات المسجلة',db.companies.length,'عدد شركات المجموعة','▥')}${kpi('الموظفون اليوم',active.length,'الموظفون ضمن فترة عملهم','♙','blue')}${kpi('الحضور المسجل اليوم',`${present.length} / ${active.length}`,`${recorded} سجلًا من كل الحالات`,'✓')}${kpi('ساعات العمل هذا الشهر',formatMinutes(monthMinutes),'إجمالي الساعات المُدخلة','◷','gold')}</div>`+
  `<div class="two-cols">${panel('توزيع الموظفين حسب الشركة',companyBar,'','أعداد الموظفين الفعّالين اليوم')}${panel('أحدث الموظفين المضافين',recentHtml,'','لمحة سريعة عن ملفات الموارد البشرية')}</div>`+
  `<div class="info-note">تاريخ المتابعة: <b>${esc(dateAR(d))}</b> · الساعات المسجّلة اليوم: <b>${esc(formatMinutes(totalMinutes))}</b> · <b>${Math.max(0,active.length-recorded)}</b> موظف لم يُسجَّل له حضور بعد. انتقل إلى «تسجيل الحضور» لإكمال البيانات.</div>`;
}
function pageCompanies(){
  const q=state.companySearch.trim().toLowerCase();const list=state.data.companies.filter(c=>!q||c.name.toLowerCase().includes(q)||c.code.toLowerCase().includes(q));
  const rows=list.map(c=>{const es=state.data.employees.filter(e=>e.companyId===c.id);return `<tr><td class="strong">${esc(c.name)}<span class="sub">${esc(c.notes||'—')}</span></td><td class="ltr">${esc(c.code||'—')}</td><td><span class="badge blue">${es.length} موظف</span></td><td><div class="cell-actions"><button class="btn sm" data-action="edit-company" data-id="${esc(c.id)}">تعديل</button><button class="btn sm danger" data-action="delete-company" data-id="${esc(c.id)}">حذف</button></div></td></tr>`}).join('');
  return heading(`<button class="btn primary" data-action="add-company">＋ إضافة شركة</button>`)+`<div class="toolbar"><div class="field grow"><label>البحث عن شركة</label><input data-filter="companySearch" placeholder="اسم الشركة أو رمزها..." value="${esc(state.companySearch)}" /></div></div>`+panel(`قائمة الشركات (${list.length})`,list.length?table(['الشركة','الرمز','الموظفون','الإجراءات'],rows):empty('لا توجد شركات مطابقة','أضف أول شركة، أو غيّر عبارة البحث.','إضافة شركة','add-company'));
}
function pageEmployees(){
  const q=state.employeeSearch.trim().toLowerCase();let arr=state.data.employees.filter(e=>(!state.employeeCompany||e.companyId===state.employeeCompany)&&(!q||[e.fullName,e.matricule,e.jobTitle,companyOf(e)].some(s=>String(s).toLowerCase().includes(q))));arr.sort((a,b)=>a.fullName.localeCompare(b.fullName,'ar'));
  const rows=arr.map(e=>`<tr><td><div class="row-employee">${avatar(e)}<div class="strong">${esc(e.fullName)}<span class="sub">${esc(e.jobTitle||'بدون وظيفة محددة')}</span></div></div></td><td class="ltr">${esc(e.matricule)}</td><td>${esc(companyOf(e))}</td><td>${esc(byId('shifts',e.defaultShiftId)?periodLabel(byId('shifts',e.defaultShiftId)):'—')}</td><td><span class="badge ${activeOn(e,currentDay)?'ok':'warn'}">${activeOn(e,currentDay)?'نشط':'خارج الخدمة اليوم'}</span></td><td><div class="cell-actions"><button class="btn sm" data-action="edit-employee" data-id="${esc(e.id)}">تعديل</button><button class="btn sm danger" data-action="delete-employee" data-id="${esc(e.id)}">حذف</button></div></td></tr>`).join('');
  return heading(`<button class="btn" data-action="export-template">تنزيل نموذج Excel</button><button class="btn" data-action="import-employees">استيراد موظفين</button><button class="btn primary" data-action="add-employee">＋ إضافة موظف</button>`)+
  `<div class="toolbar"><div class="field grow"><label>البحث بالاسم أو الرقم التعريفي</label><input placeholder="ابحث عن موظف..." data-filter="employeeSearch" value="${esc(state.employeeSearch)}" /></div><div class="field"><label>الشركة</label><select data-filter="employeeCompany">${companyOptions(state.employeeCompany)}</select></div></div>`+
  panel(`قائمة الموظفين (${arr.length})`,arr.length?table(['الموظف','الرقم التعريفي','الشركة','الفترة الافتراضية','الحالة','الإجراءات'],rows):empty('لا يوجد موظفون','أضف شركة أولًا، ثم أضف الموظفين يدويًا أو عن طريق ملف Excel.','إضافة موظف','add-employee'));
}
function pageShifts(){
  const rows=state.data.shifts.map(s=>{const used=state.data.employees.filter(e=>e.defaultShiftId===s.id).length;return `<tr><td class="strong">${esc(s.name)}</td><td class="ltr">${esc(s.start)} → ${esc(s.end)}</td><td>${esc(formatMinutes(shiftMinutes(s)))}</td><td>${s.breakMinutes||0} دقيقة</td><td><span class="badge blue">${used} موظف افتراضيًا</span></td><td><div class="cell-actions"><button class="btn sm" data-action="edit-shift" data-id="${esc(s.id)}">تعديل</button><button class="btn sm danger" data-action="delete-shift" data-id="${esc(s.id)}">حذف</button></div></td></tr>`}).join('');
  return heading(`<button class="btn primary" data-action="add-shift">＋ فترة عمل جديدة</button>`)+`<div class="info-note">يمكنك إضافة فترات غير محدودة. الفترة التي تبدأ <b>16:00</b> وتنتهي <b>00:00</b> محسوبة تلقائيًا كـ <b>8 ساعات</b>، وكذلك الفترات العابرة لمنتصف الليل. فترات العمل للتخطيط ولا تولّد حضورًا تلقائيًا.</div>`+panel('الفترات المتاحة',table(['الفترة','من → إلى','المدة الصافية','الاستراحة','الاستخدام','إجراءات'],rows));
}
function employeesForAttendance(){let a=state.data.employees.filter(e=>(!state.attCompany||e.companyId===state.attCompany)&&(state.view==='daily'?activeOn(e,state.day):inMonth(e,state.month)));const q=state.search.trim().toLowerCase();if(q)a=a.filter(e=>[e.fullName,e.matricule,companyOf(e)].some(v=>v.toLowerCase().includes(q)));return a.sort((x,y)=>companyOf(x).localeCompare(companyOf(y),'ar')||x.fullName.localeCompare(y.fullName,'ar'));}
function dailyContent(a){
  const rows=a.map(e=>{
    const rec=record(e.id,state.day),s=effectiveShift(e,state.day),changed=changeOn(e.id,state.day),id=esc(e.id);
    return `<tr><td><input type="checkbox" class="row-select" data-select-id="${id}" ${state.selected.has(e.id)?'checked':''} aria-label="اختيار ${esc(e.fullName)}" /></td><td><div class="row-employee">${avatar(e)}<div><strong class="strong">${esc(e.fullName)}</strong><span class="sub">${esc(e.matricule)}</span></div></div></td><td>${esc(companyOf(e))}</td><td class="period-cell"><select class="period-select" data-shift-emp="${id}">${opt(state.data.shifts,s?.id,periodLabel)}</select><span class="mini-state">${changed?`<span class="badge ok">تغيير في هذا اليوم</span> <button class="btn sm icon-only" title="إلغاء تغيير هذا اليوم" data-action="clear-shift" data-id="${id}">↶</button>`:'موروثة من الفترة السابقة'}</span></td><td><input class="entry-input ${cssStatus(rec?.status)}" maxlength="6" data-record-emp="${id}" data-record-day="${esc(state.day)}" value="${esc(rec?.value||'')}" placeholder="8 / C" aria-label="حضور ${esc(e.fullName)}" /></td><td><input class="overtime-input" maxlength="6" data-overtime-emp="${id}" data-overtime-day="${esc(state.day)}" value="${esc(rec?.overtimeValue||'')}" placeholder="4 س" aria-label="ساعات إضافية لـ ${esc(e.fullName)}" /></td><td><span class="badge ${rec?.status==='WORK'?'ok':rec?.status==='A'?'danger':rec?'blue':''}" data-badge-emp="${id}">${esc(rec?names[rec.status]:'غير مسجل')}</span></td><td><input class="note-input" data-note-emp="${id}" data-note-day="${esc(state.day)}" value="${esc(rec?.note||'')}" placeholder="ملاحظة اختيارية" /></td></tr>`;
  }).join('');
  return `<div class="bulkbar"><div class="selected-count">المحدد: <b id="selectedCount">${state.selected.size}</b></div><div class="field"><label>الحضور لجميع المحددين</label><input id="bulkValue" class="ltr" placeholder="8 أو 7.45 أو C / M / R / MIS" /></div><div class="field"><label>تغيير الفترة لجميع المحددين</label><select id="bulkShift"><option value="">لا تغيير</option>${state.data.shifts.map(s=>`<option value="${esc(s.id)}">${esc(periodLabel(s))}</option>`).join('')}</select></div><button class="btn primary" data-action="bulk-apply">تطبيق على المحددين</button></div>`+
  panel(`سجل ${dateAR(state.day)} · ${a.length} موظف`,a.length?table([`<input type="checkbox" id="selectAll" aria-label="تحديد الكل" />`,'الموظف','الشركة','الفترة المطبقة','البيان','ساعات إضافية H+','الحالة','الملاحظة'],rows):empty('لا يوجد موظفون لهذا اليوم','تحقق من تاريخ العمل والشركة، أو أضف موظفين جدد.','إضافة موظف','add-employee'));
}
function monthlyContent(a){
  const days=dateList(state.month),head=days.map(d=>`<th class="${new Date(d+'T12:00:00').getDay()===5?'day-off':''}"><span class="day-num">${Number(d.slice(-2))}</span><span class="day-sub">${esc(dayTitle(d))}</span></th>`).join('');
  const rows=a.map(e=>`<tr><td class="fixed-col"><strong>${esc(e.fullName)}</strong><span class="sub">${esc(e.matricule)}</span></td>${days.map(d=>{
    if(!activeOn(e,d))return `<td class="day-off muted">—</td>`;
    const rec=record(e.id,d),shift=effectiveShift(e,d);return `<td><span class="period-tag" title="${esc(shift?.name||'')}">${esc(shift?.start||'—')}</span><input class="month-input ${cssStatus(rec?.status)}" data-record-emp="${esc(e.id)}" data-record-day="${d}" value="${esc(rec?.value||'')}" placeholder="—" title="${esc(e.fullName+' '+d)}" maxlength="6" /></td>`;
  }).join('')}</tr>`).join('');
  return `<div class="info-note">الجدول الشهري يسمح بإدخال قيم الحضور مباشرة لكل يوم. <b>لتعديل المناوبة في يوم محدد، انتقل إلى العرض اليومي واختر التاريخ.</b> ستستمر الفترة الجديدة تلقائيًا في الأيام التالية.</div>`+panel(`الشهر ${esc(state.month)} · ${a.length} موظف`,a.length?`<div class="month-grid"><table class="month-table"><thead><tr><th class="fixed-col">الموظف / التاريخ</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`:empty('لا يوجد موظفون','اختر شركة أخرى أو أضف موظفين.'));
}
function pageAttendance(){
  const a=employeesForAttendance(),date=state.day,registered=a.filter(e=>record(e.id,date)),present=registered.filter(e=>record(e.id,date).status==='WORK'),h=present.reduce((s,e)=>s+record(e.id,date).minutes,0),overtime=present.reduce((s,e)=>s+(record(e.id,date).overtimeMinutes||0),0);
  const toolbar=`<div class="toolbar"><div class="field"><label>الشركة</label><select data-filter="attCompany">${companyOptions(state.attCompany)}</select></div><div class="field"><label>اليوم</label><input type="date" data-filter="day" value="${esc(date)}" /></div><div class="field"><label>الشهر</label><input type="month" data-filter="month" value="${esc(state.month)}" /></div><div class="field grow"><label>البحث عن موظف</label><input data-filter="search" value="${esc(state.search)}" placeholder="الاسم أو الرقم التعريفي..." /></div><div class="view-toggle push-left"><button data-action="daily-view" class="${state.view==='daily'?'active':''}">يومي</button><button data-action="monthly-view" class="${state.view==='monthly'?'active':''}">شهري</button></div></div>`;
  return heading(`<button class="btn" data-action="prev-day">← اليوم السابق</button><button class="btn" data-action="next-day">اليوم التالي →</button><button class="btn secondary" data-action="day-today">اليوم</button>`)+toolbar+
  `<div class="metric-strip"><span class="metric-pill">عدد الموظفين <strong>${a.length}</strong></span><span class="metric-pill">سجلات اليوم <strong>${registered.length}</strong></span><span class="metric-pill">الحاضرون <strong>${present.length}</strong></span><span class="metric-pill">مجموع الساعات <strong>${esc(formatMinutes(h))}</strong></span><span class="metric-pill">إجمالي H+ <strong>${esc(formatMinutes(overtime))}</strong></span></div>`+
  `<div class="status-key"><span>طريقة التسجيل:</span><span><b>8</b> = 8 ساعات</span><span><b>H+ 4</b> أو <b>4 س</b> = 4 ساعات إضافية</span><span><b>7.45</b> = 7س و45د</span><span><b>C</b> عطلة</span><span><b>M</b> مرض</span><span><b>R</b> راحة</span><span><b>MIS</b> مهمة</span><span><b>A</b> غياب</span><span>فارغ = غير مسجل</span></div>`+(state.view==='daily'?dailyContent(a):monthlyContent(a));
}
function reportItems(){return state.data.employees.filter(e=>(!state.reportCompany||e.companyId===state.reportCompany)&&inMonth(e,state.reportMonth)).sort((a,b)=>companyOf(a).localeCompare(companyOf(b),'ar')||a.fullName.localeCompare(b.fullName,'ar')).map(e=>({...summary(e,state.reportMonth),company:companyOf(e)}));}
function pageReports(){
  const rows=reportItems(),tot=rows.reduce((acc,x)=>{for(const k of ['workMinutes','workDays','C','M','R','MIS','A','empty'])acc[k]+=x[k];return acc;},{workMinutes:0,workDays:0,C:0,M:0,R:0,MIS:0,A:0,empty:0});
  const html=rows.map(x=>`<tr><td class="strong">${esc(x.e.fullName)}<span class="sub">${esc(x.e.matricule)}</span></td><td>${esc(x.company)}</td><td>${x.workDays}</td><td class="strong">${formatMinutes(x.workMinutes)}</td><td>${x.C}</td><td>${x.M}</td><td>${x.R}</td><td>${x.MIS}</td><td>${x.A}</td><td>${x.empty}</td></tr>`).join('');
  return heading(`<button class="btn primary" data-action="export-report">↓ تصدير تقرير Excel</button>`)+
  `<div class="toolbar"><div class="field"><label>الشهر المطلوب</label><input type="month" data-filter="reportMonth" value="${esc(state.reportMonth)}" /></div><div class="field"><label>الشركة</label><select data-filter="reportCompany">${companyOptions(state.reportCompany)}</select></div></div>`+
  `<div class="kpi-grid">${kpi('الموظفون في التقرير',rows.length,'جميع سجلات الفترة','♙')}${kpi('مجموع ساعات العمل',formatMinutes(tot.workMinutes),'ساعات فعلية مسجلة','◷','gold')}${kpi('أيام الحضور',tot.workDays,'مجموع أيام الحضور لكل الموظفين','✓')}${kpi('الحالات الخاصة',tot.C+tot.M+tot.R+tot.MIS+tot.A,'عطل، مرض، راحة، مهام وغيابات','▦','violet')}</div>`+
  `<div class="info-note">الساعات في الجدول هي الساعات المدخلة فعليًا. لن يحوّل التطبيق <b>7.45</b> إلى عدد عشري في التقرير؛ بل يحفظها <b>465 دقيقة</b> ثم يعرضها بشكل ساعات ودقائق. ملف Excel يتضمن ورقة للملخص، وأخرى لتفاصيل كل يوم، وثالثة لتغييرات المناوبات. عمود «دون تسجيل» يشمل الأيام غير المسجلة في الشهر المختار.</div>`+
  panel('ملخص الحضور الشهري',rows.length?table(['الموظف','الشركة','أيام الحضور','ساعات العمل','عطلة C','مرض M','راحة R','مهمة MIS','غياب A','دون تسجيل'],html):empty('لا توجد بيانات للتقرير','أضف موظفين وحدد الفترة المطلوبة لإنشاء التقرير.'));
}
function managerComparison(){
  const imports=state.managerImportId==='all'?(state.data.punchImports||[]):(state.data.punchImports||[]).filter(x=>x.id===state.managerImportId);
  const punchMap=new Map();for(const item of imports)for(const x of item.records||[])punchMap.set(`${String(x.matricule).trim().toLowerCase()}|${x.date}`,x);
  const employeeByCode=new Map(state.data.employees.map(e=>[String(e.matricule).trim().toLowerCase(),e]));const rows=[],seen=new Set(),importedDates=new Set([...punchMap.values()].map(x=>x.date));
  for(const [key,p] of punchMap){const emp=employeeByCode.get(String(p.matricule).trim().toLowerCase()),rh=emp?record(emp.id,p.date):null;let result='مطابق',kind='match',difference=null;
    if(!emp){result='رقم غير مربوط بموظف RH';kind='unlinked';}else if(!rh){result='موجود في pointeuse فقط';kind='punch-only';}else if(rh.status!=='WORK'){result=`حالة RH: ${names[rh.status]}`;kind='status';}else {difference=p.minutes-rh.minutes;if(Math.abs(difference)>15){result='فرق في الساعات';kind='difference';}}
    rows.push({key,date:p.date,employeeId:emp?.id||'',matricule:p.matricule,name:emp?.fullName||p.fullName||'—',company:emp?companyOf(emp):p.department||'—',punch:p,rh,result,kind,difference});seen.add(key);
  }
  for(const a of state.data.attendance){const emp=byId('employees',a.employeeId);if(!emp||!importedDates.has(a.date))continue;const key=`${String(emp.matricule).trim().toLowerCase()}|${a.date}`;if(seen.has(key))continue;rows.push({key,date:a.date,employeeId:emp.id,matricule:emp.matricule,name:emp.fullName,company:companyOf(emp),punch:null,rh:a,result:'موجود في RH فقط',kind:'rh-only',difference:null});}
  return rows.sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name,'ar'));
}
function signedMinutes(n){if(n===null||n===undefined)return '—';return `${n>0?'+':''}${formatMinutes(Math.abs(n))}`;}
function pageManager(){
  const availableImports=state.data.punchImports||[];
  if(state.managerImportId!=='all'&&!availableImports.some(x=>x.id===state.managerImportId))state.managerImportId='all';
  const all=managerComparison(),counts={match:all.filter(x=>x.kind==='match').length,issues:all.filter(x=>x.kind!=='match').length};const rows=state.managerFilter==='issues'?all.filter(x=>x.kind!=='match'):state.managerFilter==='match'?all.filter(x=>x.kind==='match'):state.managerFilter==='punch-only'?all.filter(x=>x.kind==='punch-only'):state.managerFilter==='rh-only'?all.filter(x=>x.kind==='rh-only'):all;
  const html=rows.map(x=>`<tr><td>${esc(x.date)}</td><td class="strong">${esc(x.name)}<span class="sub ltr">${esc(x.matricule)}</span></td><td>${esc(x.company)}</td><td class="ltr">${x.punch?`${esc(x.punch.inTime)} → ${esc(x.punch.outTime)}<span class="sub">${esc(formatMinutes(x.punch.minutes))}</span>`:'—'}</td><td>${x.rh?`${esc(x.rh.value)}<span class="sub">${esc(names[x.rh.status])}${x.rh.status==='WORK'?` · ${esc(formatMinutes(x.rh.minutes))}`:''}</span>`:'—'}</td><td class="ltr">${esc(signedMinutes(x.difference))}</td><td><span class="badge ${x.kind==='match'?'ok':x.kind==='unlinked'?'danger':'warn'}">${esc(x.result)}</span></td><td>${x.employeeId?`<button class="btn sm" data-action="punch-detail" data-id="${esc(x.employeeId)}">مراقبة</button>`:'—'}</td></tr>`).join('');
  const imports=availableImports.slice().reverse().map(x=>`<div class="activity"><div class="avatar">▦</div><div class="info"><strong>${esc(x.fileName)}</strong><small>${x.records.length} سجل بصمة · ${esc(new Date(x.importedAt).toLocaleString('ar-DZ'))}</small></div>${state.managerImportId===x.id?'<span class="badge ok">المستخدم الآن</span>':''}<button class="btn sm" data-action="use-punch" data-id="${esc(x.id)}">استخدام</button><button class="btn sm danger" data-action="delete-punch" data-id="${esc(x.id)}">حذف</button></div>`).join('');
  const importOptions=`<option value="all" ${state.managerImportId==='all'?'selected':''}>كل الملفات المستوردة</option>`+availableImports.slice().reverse().map(x=>`<option value="${esc(x.id)}" ${state.managerImportId===x.id?'selected':''}>${esc(x.fileName)} · ${x.records.length} سجل</option>`).join('');
  return heading(`<button class="btn primary" data-action="import-punch">↑ استيراد ملف pointeuse</button>`)+`<div class="info-note">اختر ملف pointeuse محددًا للمقارنة عند وجود أكثر من نسخة. اختيار «كل الملفات» يدمجها، وقد تعتمد النتيجة على آخر ملف مستورد عند تكرار نفس الموظف والتاريخ. المقارنة لا تغيّر حضور RH تلقائيًا.</div>`+`<div class="kpi-grid">${kpi('سجلات pointeuse',all.filter(x=>x.punch).length,'حسب الملف المختار','▦')}${kpi('مطابق',counts.match,'فرق حتى 15 دقيقة','✓','blue')}${kpi('يحتاج مراجعة',counts.issues,'فروقات أو سجلات ناقصة','!','gold')}${kpi('ملفات مستوردة',availableImports.length,'ملفات محفوظة للمقارنة','↥','violet')}</div>`+`<div class="toolbar"><div class="field"><label>ملف pointeuse المستخدم</label><select data-filter="managerImportId">${importOptions}</select></div><div class="field"><label>عرض المقارنة</label><select data-filter="managerFilter"><option value="issues" ${state.managerFilter==='issues'?'selected':''}>يحتاج مراجعة فقط</option><option value="all" ${state.managerFilter==='all'?'selected':''}>كل السجلات</option><option value="match" ${state.managerFilter==='match'?'selected':''}>المطابق فقط</option><option value="punch-only" ${state.managerFilter==='punch-only'?'selected':''}>pointeuse فقط</option><option value="rh-only" ${state.managerFilter==='rh-only'?'selected':''}>RH فقط</option></select></div></div>`+panel(`نتائج المراقبة (${rows.length})`,rows.length?table(['التاريخ','الموظف','الشركة','pointeuse','حضور RH','فرق pointeuse − RH','النتيجة','تفاصيل'],html):empty('لا توجد نتائج','استورد ملف pointeuse ثم راجع الفروقات.'))+panel(`ملفات pointeuse المستوردة (${availableImports.length})`,imports?`<div class="compact-list">${imports}</div>`:empty('لا توجد ملفات','استورد ملف Excel صادر من جهاز pointeuse.'));
}
function pageSettings(){
  return heading()+`<div class="settings-card"><h3>اسم المجموعة</h3><p>يظهر هذا الاسم في أعلى التطبيق وفي التعريف العام.</p><form id="settingsForm" class="actions"><input name="groupName" style="max-width:350px" value="${esc(state.data.settings.groupName||'المجموعة')}" required maxlength="100" /><button type="submit" class="btn primary">حفظ الاسم</button></form></div>`+
  `<div class="settings-card"><h3>النسخ الاحتياطي والاسترجاع</h3><p>بيانات الشركات والموظفين والسجلات محفوظة على هذا الحاسوب. أنشئ نسخة احتياطية بانتظام واحفظها في مكان آخر. استرجاع النسخة يستبدل البيانات الحالية بعد تأكيد إضافي.</p><div class="actions"><button class="btn primary" data-action="save-backup">↓ حفظ نسخة احتياطية</button><button class="btn" data-action="restore-backup">↶ استرجاع نسخة محفوظة</button></div></div>`+
  `<div class="settings-card"><h3>موقع قاعدة البيانات المحلية</h3><p>التطبيق لا يتصل بخادم خارجي ولا يرسل بيانات الموظفين إلى الإنترنت. جميع التغييرات تُحفظ تلقائيًا في ملف محلي، وتوجد نسخة تعافٍ سابقة بجانبه.</p><div class="path">${esc(state.path)}</div><button class="btn" data-action="open-data-folder">فتح مجلد البيانات</button></div>`+
  `<div class="settings-card"><h3>معلومات التشغيل</h3><p>الإصدار 1.0.0 · Electron · نظام مستقل يعمل دون اتصال بعد التثبيت · جهاز واحد في الوقت نفسه. لإتاحة التحرير المشترك بين عدة حواسيب ستلزم نسخة مزوّدة بخادم وقاعدة بيانات مشتركة.</p></div>`;
}
function pageHelp(){
 const items=[
  ['أنشئ الشركات أولًا','افتح قسم «الشركات»، ثم اضغط «إضافة شركة». تستطيع إضافة عدد غير محدود من الشركات.'],
  ['أضف الموظفين','أضف الاسم الكامل، الرقم التعريفي، الشركة، تاريخ بداية العمل، والفترة الافتراضية. يجب أن يكون الرقم التعريفي فريدًا داخل نفس الشركة.'],
  ['عرّف فترات العمل','الفترات الأولية هي 08:00–16:00 و16:00–00:00 و00:00–08:00. أضف أي فترة أخرى مع الاستراحة بالدقائق.'],
  ['غيّر المناوبة وسط الشهر','في التسجيل اليومي، اختر اليوم والموظف، ثم الفترة الجديدة. ستصبح هذه الفترة سارية من ذلك التاريخ إلى حين تسجيل تغيير آخر. لتراجع عن تغيير ذلك اليوم، اضغط ↶ قرب الفترة.'],
  ['أدخل الحضور بالدقائق','اكتب 8 لثماني ساعات، أو 7.45 لسبع ساعات وخمس وأربعين دقيقة، أو 7:45. الجزء بعد النقطة يعني دقائق، لا كسور الساعة.'],
  ['استخدم رموز الحالات','C = عطلة، M = مرض، R = راحة، MIS = مهمة، A = غياب. إفراغ الخانة يعني «غير مسجل» وليس غيابًا. ويمكن كتابة 0 لحضور بصفر ساعة.'],
  ['أدخل عدة أيام بسرعة','في شاشة الحضور اختر «شهري» لتعديل أيام الشهر داخل جدول واحد. يمكن أيضًا تحديد موظفين متعددين في العرض اليومي وتطبيق نفس الحالة أو الفترة عليهم.'],
  ['استيراد الموظفين','أنشئ الشركات أولًا، ثم نزّل نموذج Excel من شاشة الموظفين. اكتب نفس اسم الشركة كما في النظام واحذف السطر التجريبي قبل الاستيراد.'],
  ['التقارير والنسخ','اختر الشهر والشركة، ثم صدّر تقرير Excel. احفظ نسخًا احتياطية من الإعدادات، خصوصًا قبل حذف موظف أو استرجاع نسخة قديمة.'],
  ['ماذا تعني مناوبة تبدأ 16:00 وتنتهي 00:00؟','تُحسب مناوبة مدتها 8 ساعات، وتُنسَب لليوم الذي بدأت فيه. يمكن تسجيل الحضور الفعلي بقيمة مختلفة من دون تعديل المناوبة الأساسية.']
 ];
 return heading(`<button class="btn primary" data-action="go-attendance">ابدأ تسجيل الحضور ←</button>`)+`<div class="panel"><div class="panel-body notice-list">${items.map((it,i)=>`<div class="notice"><span class="number">${i+1}</span><div><strong>${esc(it[0])}</strong><p>${esc(it[1])}</p></div></div>`).join('')}</div></div>`;
}
const pages={dashboard:pageDashboard,companies:pageCompanies,employees:pageEmployees,shifts:pageShifts,attendance:pageAttendance,reports:pageReports,manager:pageManager,settings:pageSettings,help:pageHelp};
function render(){
  if(!state.data)return;
  el('content').innerHTML=pages[state.page]();
  el('crumbCurrent').textContent=sections[state.page][1];el('groupTitle').textContent=state.data.settings.groupName||'المجموعة';
  el('userLabel').textContent=state.user?.displayName||'';el('userInitial').textContent=(state.user?.displayName||'?').slice(0,1);
  el('managerNav').hidden=state.user?.role!=='MANAGER';
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===state.page));
  const all=el('selectAll');if(all){const matches=employeesForAttendance();all.checked=matches.length>0&&matches.every(e=>state.selected.has(e.id));}
}
function toast(message,error=false){const div=document.createElement('div');div.className='toast'+(error?' error':'');div.textContent=message;el('toastHost').append(div);setTimeout(()=>div.remove(),4400);}
function showLogin(){
  document.querySelector('.shell').hidden=true;
  document.getElementById('loginScreen')?.remove();
  document.body.insertAdjacentHTML('afterbegin',`<main id="loginScreen" class="login-screen"><section class="login-card"><div class="login-mark">ح</div><h1>تسجيل الدخول</h1><p>نظام حضور المجموعة</p><form id="loginForm"><label>اسم المستخدم<input name="username" autocomplete="username" required autofocus placeholder="rh أو manager" /></label><label>كلمة المرور<input type="password" name="password" autocomplete="current-password" required /></label><button class="btn primary" type="submit">دخول</button></form><small>الحسابات الأولية: RH و Manager.</small></section></main>`);
}
async function startSession(user){
  state.user=user;const result=await api.getState();state.data=result.data;state.path=result.path;
  document.getElementById('loginScreen')?.remove();document.querySelector('.shell').hidden=false;
  el('topDate').textContent=dateAR(today());render();
}
function showError(error){console.error(error);toast(error?.message||String(error),true);}
async function refreshSilently(){
  // Do not replace the interface while RH is typing or filling a form.
  const active=document.activeElement;
  if(!state.user||document.querySelector('.modal-backdrop')||active?.matches('input, textarea, select,[contenteditable="true"]'))return;
  const scroll=document.querySelector('.main-scroll');
  const top=scroll?.scrollTop||0,left=scroll?.scrollLeft||0;
  try{
    const latest=await api.getState();state.data=latest.data;render();
    // Keep the employee currently visible (for example employee 20), not employee 1.
    requestAnimationFrame(()=>{if(scroll){scroll.scrollTop=top;scroll.scrollLeft=left;}});
  }catch{/* The next refresh retries quietly without interrupting the user. */}
}
async function mutate(action,payload,rerender=true){
  try{const result=await api.mutate(action,payload);state.data=result.data;if(rerender)render();return result.result===undefined?true:result.result;}catch(e){showError(e);return undefined;}
}
function setPage(page){if(page==='manager'&&state.user?.role!=='MANAGER'){toast('هذه الشاشة مخصصة لحساب المدير.',true);return;}state.page=page;state.selected.clear();render();document.querySelector('.main-scroll').scrollTop=0;}
function monthForDay(d){return d.slice(0,7);}
function moveDay(offset){const dt=new Date(state.day+'T12:00:00');dt.setDate(dt.getDate()+offset);state.day=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;state.month=monthForDay(state.day);state.selected.clear();render();}
function optionShift(id){return `<option value="">اختر الفترة...</option>`+opt(state.data.shifts,id,periodLabel);}
function companySelect(id){return `<option value="">اختر الشركة...</option>`+opt(state.data.companies,id);}
function inputField(name,label,value='',extra='',type='text'){return `<div class="field ${extra.includes('wide')?'wide':''}"><label for="f-${esc(name)}">${label}</label><input id="f-${esc(name)}" name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra.replace('wide','')} /></div>`;}
function selectField(name,label,options){return `<div class="field"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}" required>${options}</select></div>`;}
function showModal(type,id=''){
  if(type==='employee'&&!state.data.companies.length){toast('أضف شركة أولًا قبل إضافة الموظف.',true);setPage('companies');return;}
  const key={company:'companies',employee:'employees',shift:'shifts'}[type],item=id?byId(key,id):null;
  if(id&&!item){toast('العنصر غير موجود.',true);return;}
  const title={company:'شركة',employee:'موظف',shift:'فترة عمل'}[type];let fields='';
  if(type==='company')fields=`${inputField('name','اسم الشركة *',item?.name||'','wide required maxlength="120"')}${inputField('code','رمز الشركة (اختياري)',item?.code||'','maxlength="30"')}<div class="field wide"><label>ملاحظات</label><textarea name="notes" maxlength="300">${esc(item?.notes||'')}</textarea></div>`;
  else if(type==='employee')fields=`${inputField('fullName','الاسم الكامل *',item?.fullName||'','wide required maxlength="120"')}${inputField('matricule','الرقم التعريفي / Matricule *',item?.matricule||'','required maxlength="60"')}${selectField('companyId','الشركة *',companySelect(item?.companyId||state.employeeCompany||state.attCompany))}${inputField('jobTitle','الوظيفة (اختياري)',item?.jobTitle||'','maxlength="100"')}${selectField('defaultShiftId','الفترة الافتراضية *',optionShift(item?.defaultShiftId||state.data.shifts[0]?.id))}${inputField('joinDate','تاريخ بداية التسجيل *',item?.joinDate||`${currentDay.slice(0,4)}-01-01`,'required','date')}${inputField('endDate','تاريخ انتهاء العمل (اختياري)',item?.endDate||'','','date')}<div class="field wide"><label>ملاحظات</label><textarea name="notes" maxlength="300">${esc(item?.notes||'')}</textarea></div>`;
  else fields=`${inputField('name','اسم الفترة *',item?.name||'','wide required maxlength="100"')}${inputField('start','ساعة البداية *',item?.start||'08:00','required','time')}${inputField('end','ساعة النهاية *',item?.end||'16:00','required','time')}${inputField('breakMinutes','الاستراحة بالدقائق',item?.breakMinutes??0,'min="0" max="1439" required','number')}<div class="form-note">يمكن أن تكون النهاية بعد منتصف الليل مثل 16:00 ← 00:00. يُخصم وقت الاستراحة من مدة الفترة.</div>`;
  el('modalHost').innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal-head"><h2 id="modalTitle">${id?'تعديل':'إضافة'} ${title}</h2><button type="button" class="close" data-action="close-modal" aria-label="إغلاق">×</button></div><form id="entityForm" data-type="${type}" data-id="${esc(id)}"><div class="modal-content form-grid">${fields}</div><div class="modal-foot"><button type="button" class="btn" data-action="close-modal">إلغاء</button><button type="submit" class="btn primary">${id?'حفظ التعديلات':'إضافة الآن'}</button></div></form></section></div>`;
  el('entityForm').querySelector('input')?.focus();
}
function closeModal(){el('modalHost').innerHTML='';}
function showPunchDetail(employeeId){
  if(state.user?.role!=='MANAGER')return;const emp=byId('employees',employeeId);if(!emp){toast('الموظف غير موجود.',true);return;}
  const code=String(emp.matricule).trim().toLowerCase(),punchMap=new Map(),imports=state.managerImportId==='all'?(state.data.punchImports||[]):(state.data.punchImports||[]).filter(x=>x.id===state.managerImportId);for(const item of imports)for(const x of item.records||[])if(String(x.matricule).trim().toLowerCase()===code)punchMap.set(x.date,x);
  const dates=new Set([...punchMap.keys()]);for(const a of state.data.attendance)if(a.employeeId===emp.id&&dates.size&&(imports.some(i=>i.records?.some(x=>x.date===a.date))))dates.add(a.date);
  const days=[...dates].sort((a,b)=>a.localeCompare(b));let machineMinutes=0,rhMinutes=0,plus=0,minus=0;
  const cards=days.map(date=>{const punch=punchMap.get(date),rh=record(emp.id,date),shift=effectiveShift(emp,date),planned=shift?shiftMinutes(shift):0;let kind='neutral',label='دون تسجيل',difference=null;
    if(punch&&rh?.status==='WORK'){difference=punch.minutes-rh.minutes;machineMinutes+=punch.minutes;rhMinutes+=rh.minutes;if(Math.abs(difference)<=15){kind='ok';label='مطابق';}else{kind='warn';label='ساعات مختلفة';}if(difference>0)plus+=difference;else minus+=Math.abs(difference);}
    else if(punch){machineMinutes+=punch.minutes;kind='warn';label=rh?`RH: ${names[rh.status]}`:'في pointeuse فقط';}
    else if(rh?.status==='WORK'){rhMinutes+=rh.minutes;kind='warn';label='في RH فقط';}
    else if(rh){kind='neutral';label=names[rh.status];}
    const dateText=dateAR(date).replace(/،/g,'');return `<article class="control-card ${kind}"><div class="control-date"><strong>${esc(dateText)}</strong><span>${esc(label)}</span></div><dl><div><dt>Machine</dt><dd class="ltr">${punch?`${esc(punch.inTime)}–${esc(punch.outTime)}`:'—'}</dd></div><div><dt>الفترة</dt><dd class="ltr">${shift?`${esc(shift.start)}–${esc(shift.end)}`:'—'}</dd></div><div><dt>Calcul</dt><dd>${punch?esc(formatMinutes(punch.minutes)):'—'}</dd></div><div><dt>RH</dt><dd>${rh?esc(rh.status==='WORK'?formatMinutes(rh.minutes):names[rh.status]):'—'}</dd></div>${difference!==null?`<div><dt>الفرق</dt><dd class="ltr">${esc(signedMinutes(difference))}</dd></div>`:''}</dl></article>`;
  }).join('');
  el('modalHost').innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><section class="modal control-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal-head"><div><span class="eyebrow ltr">${esc(emp.matricule)} · ${esc(emp.jobTitle||'—')}</span><h2 id="modalTitle">${esc(emp.fullName)}</h2></div><button type="button" class="close" data-action="close-modal" aria-label="إغلاق">×</button></div><div class="modal-content"><div class="control-summary"><div><span>ساعات Machine</span><strong>${esc(formatMinutes(machineMinutes))}</strong></div><div><span>ساعات RH</span><strong>${esc(formatMinutes(rhMinutes))}</strong></div><div class="minus"><span>H−</span><strong>${esc(formatMinutes(minus))}</strong></div><div class="plus"><span>H+</span><strong>${esc(formatMinutes(plus))}</strong></div></div><div class="control-heading"><div><span class="eyebrow">مراقبة يومية</span><h3>Machine مقابل حضور RH</h3></div><small>فرق ±15 دقيقة يعتبر مطابقًا</small></div>${cards?`<div class="control-grid">${cards}</div>`:empty('لا توجد بصمات لهذا الموظف','استورد ملف pointeuse يحتوي على هذا الرقم التعريفي أولًا.')}</div></section></div>`;
}
async function confirmDelete(key,id){
  const noun={company:'الشركة',employee:'الموظف',shift:'الفترة'}[key];
  if(!confirm(`هل أنت متأكد من حذف ${noun}؟\nحذف الموظف يمسح جميع سجلات حضوره وتغيير فتراته نهائيًا. احفظ نسخة احتياطية أولًا.`))return;
  const r=await mutate(`${key}:delete`,{id});if(r!==undefined)toast('تم الحذف بنجاح.');
}
async function saveRecord(target){
  const emp=target.dataset.recordEmp||target.dataset.overtimeEmp||target.dataset.noteEmp,date=target.dataset.recordDay||target.dataset.overtimeDay||target.dataset.noteDay;
  const old=record(emp,date);const value=target.dataset.recordEmp!==undefined?target.value:(old?.value||'');
  const overtime=target.dataset.overtimeEmp!==undefined?target.value:(old?.overtimeValue||'');
  const note=target.dataset.noteEmp!==undefined?target.value:(old?.note||'');
  const original=old?.value||'',originalOvertime=old?.overtimeValue||'',originalNote=old?.note||'';
  if(value===original&&overtime===originalOvertime&&note===originalNote)return;
  const result=await mutate('attendance:save',{employeeId:emp,date,value,overtime,note},false);
  if(result!==undefined){
    const rec=record(emp,date);
    if(target.dataset.recordEmp!==undefined){target.value=rec?.value||'';target.className=target.className.replace(/code-\w+/g,'').trim()+' '+cssStatus(rec?.status);}
    if(target.dataset.overtimeEmp!==undefined)target.value=rec?.overtimeValue||'';
    if(target.dataset.noteEmp!==undefined)target.value=rec?.note||'';
    const badge=document.querySelector(`[data-badge-emp="${CSS.escape(emp)}"]`);
    if(badge){badge.textContent=rec?names[rec.status]:'غير مسجل';badge.className='badge '+(rec?.status==='WORK'?'ok':rec?.status==='A'?'danger':rec?'blue':'');}
  }else{target.value=target.dataset.recordEmp!==undefined?original:target.dataset.overtimeEmp!==undefined?originalOvertime:originalNote;}
}
function updateSelected(){const n=el('selectedCount');if(n)n.textContent=state.selected.size;const all=el('selectAll');if(all){const arr=employeesForAttendance();all.checked=arr.length>0&&arr.every(e=>state.selected.has(e.id));}}
async function applyBulk(){
  const ids=[...state.selected],value=el('bulkValue')?.value.trim()||'',shiftId=el('bulkShift')?.value||'';
  if(!ids.length){toast('حدد موظفًا واحدًا على الأقل.',true);return;}
  if(!value&&!shiftId){toast('أدخل قيمة حضور أو فترة للتطبيق.',true);return;}
  if(!confirm(`سيتم تطبيق ${[value?'قيمة الحضور':'',shiftId?'الفترة الجديدة':''].filter(Boolean).join(' و')} على ${ids.length} موظف في ${state.day}. هل تريد المتابعة؟`))return;
  let ok=0,errors=0;
  for(const employeeId of ids){
    try{
      if(shiftId){const r=await api.mutate('shift:set',{employeeId,date:state.day,shiftId});state.data=r.data;}
      if(value){const old=record(employeeId,state.day),r=await api.mutate('attendance:save',{employeeId,date:state.day,value,overtime:old?.overtimeValue||'',note:old?.note||''});state.data=r.data;}
      ok++;
    }catch(e){errors++;console.error(e);}
  }
  state.selected.clear();render();toast(`تم التحديث لـ ${ok} موظف${errors?`، وتعذّر تحديث ${errors}`:''}.`,Boolean(errors));
}
async function action(cmd,id){
  switch(cmd){
    case 'add-company':return showModal('company');case 'edit-company':return showModal('company',id);case 'delete-company':return confirmDelete('company',id);
    case 'add-employee':return showModal('employee');case 'edit-employee':return showModal('employee',id);case 'delete-employee':return confirmDelete('employee',id);
    case 'add-shift':return showModal('shift');case 'edit-shift':return showModal('shift',id);case 'delete-shift':return confirmDelete('shift',id);
    case 'close-modal':return closeModal();
    case 'import-punch':try{const r=await api.importPunch();if(!r.canceled){const latest=await api.getState();state.data=latest.data;render();toast(`تم استيراد ${r.import.count} سجل بصمة بنجاح.`);if(r.warnings?.length)alert(r.warnings.join('\n'));}}catch(e){showError(e);}return;
    case 'use-punch':state.managerImportId=id;render();toast('تم اختيار ملف pointeuse للمقارنة.');return;
    case 'delete-punch':if(!confirm('سيتم حذف ملف pointeuse المستورد من المقارنة. لن تتغير سجلات RH.'))return;try{await api.deletePunchImport(id);if(state.managerImportId===id)state.managerImportId='all';const latest=await api.getState();state.data=latest.data;render();toast('تم حذف ملف pointeuse.');}catch(e){showError(e);}return;
    case 'punch-detail':return showPunchDetail(id);
    case 'logout':await api.logout();state.data=null;state.user=null;return showLogin();
    case 'go-attendance':return setPage('attendance');case 'go-reports':return setPage('reports');
    case 'daily-view':state.view='daily';return render();case 'monthly-view':state.view='monthly';state.selected.clear();return render();
    case 'prev-day':return moveDay(-1);case 'next-day':return moveDay(1);case 'day-today':state.day=today();state.month=monthForDay(state.day);return render();
    case 'clear-shift':{const r=await mutate('shift:clear',{employeeId:id,date:state.day});if(r!==undefined)toast('أُلغي تغيير المناوبة لهذا اليوم.');return;}
    case 'bulk-apply':return applyBulk();
    case 'export-report':try{const r=await api.exportReport({month:state.reportMonth,companyId:state.reportCompany});if(r.saved)toast('تم حفظ تقرير Excel بنجاح.');}catch(e){showError(e);}return;
    case 'export-template':try{const r=await api.exportTemplate();if(r.saved)toast('تم تنزيل نموذج Excel.');}catch(e){showError(e);}return;
    case 'import-employees':try{const r=await api.importEmployees();if(!r.canceled){const got=await api.getState();state.data=got.data;render();if(r.errors.length)alert(`تم استيراد ${r.added} موظف.\n\nالأخطاء:\n${r.errors.join('\n')}${r.moreErrors?'\n... وأخطاء إضافية: '+r.moreErrors:''}`);else toast(`تم استيراد ${r.added} موظف بنجاح.`);}}catch(e){showError(e);}return;
    case 'save-backup':try{const r=await api.saveBackup();if(r.saved)toast('تم إنشاء النسخة الاحتياطية بنجاح.');}catch(e){showError(e);}return;
    case 'restore-backup':try{const r=await api.restoreBackup();if(r.restored){state.data=r.data;state.selected.clear();render();toast('تم استرجاع النسخة الاحتياطية بنجاح.');}}catch(e){showError(e);}return;
    case 'open-data-folder':try{await api.openDataFolder();}catch(e){showError(e);}return;
  }
}
function boundEvents(){
  document.addEventListener('click',e=>{
    const nav=e.target.closest('button[data-page]');if(nav)return setPage(nav.dataset.page);
    const button=e.target.closest('button[data-action]');if(button)return action(button.dataset.action,button.dataset.id||'');
    if(e.target?.id==='modalBackdrop')closeModal();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if(e.key==='Enter'&&e.target.matches('[data-record-emp]')){e.preventDefault();e.target.blur();}});
  document.addEventListener('change',async e=>{
    const x=e.target;
    if(x.dataset.filter){const k=x.dataset.filter;state[k]=x.value;if(k==='day'){if(!/^\d{4}-\d{2}-\d{2}$/.test(x.value))return;state.month=monthForDay(x.value);}if(k==='month'){state.day=x.value+'-01';}state.selected.clear();render();return;}
    if(x.dataset.shiftEmp){const employeeId=x.dataset.shiftEmp,result=await mutate('shift:set',{employeeId,date:state.day,shiftId:x.value});if(result!==undefined)toast('تم تغيير فترة الموظف ابتداءً من هذا اليوم.');return;}
    if(x.dataset.recordEmp!==undefined||x.dataset.overtimeEmp!==undefined||x.dataset.noteEmp!==undefined){await saveRecord(x);return;}
    if(x.dataset.selectId){if(x.checked)state.selected.add(x.dataset.selectId);else state.selected.delete(x.dataset.selectId);updateSelected();return;}
    if(x.id==='selectAll'){const items=employeesForAttendance();items.forEach(emp=>{if(x.checked)state.selected.add(emp.id);else state.selected.delete(emp.id);});document.querySelectorAll('.row-select').forEach(t=>t.checked=x.checked);updateSelected();return;}
  });
  document.addEventListener('submit',async e=>{
    if(e.target.id==='loginForm'){e.preventDefault();const form=new FormData(e.target);try{const user=await api.login(form.get('username'),form.get('password'));await startSession(user);}catch(error){alert(error.message||'تعذر تسجيل الدخول.');}return;}
    if(e.target.id==='settingsForm'){e.preventDefault();const form=e.target,r=await mutate('settings:save',{groupName:new FormData(form).get('groupName')});if(r!==undefined)toast('تم تحديث اسم المجموعة.');return;}
    if(e.target.id!=='entityForm')return;
    e.preventDefault();const form=e.target,type=form.dataset.type,id=form.dataset.id;const data=Object.fromEntries(new FormData(form).entries());if(id)data.id=id;
    const submit=form.querySelector('button[type=submit]');submit.disabled=true;
    const r=await mutate(type+':save',data);
    submit.disabled=false;
    if(r!==undefined){closeModal();toast('تم حفظ البيانات بنجاح.');}
  });
}
async function init(){
  boundEvents();
  showLogin();
  // Les modifications enregistrées par RH ou Manager apparaissent aussi sans fermer l'application.
  setInterval(refreshSilently,30000);
}
init();
