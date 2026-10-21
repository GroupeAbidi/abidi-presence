'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('attendanceAPI',Object.freeze({
  login:(username,password)=>ipcRenderer.invoke('auth:login',username,password),
  logout:()=>ipcRenderer.invoke('auth:logout'),
  getState:()=>ipcRenderer.invoke('state:get'),
  mutate:(action,payload)=>ipcRenderer.invoke('data:mutate',action,payload),
  exportReport:(payload)=>ipcRenderer.invoke('report:export',payload),
  exportTemplate:()=>ipcRenderer.invoke('template:export'),
  importEmployees:()=>ipcRenderer.invoke('employees:import'),
  importPunch:()=>ipcRenderer.invoke('punch:import'),
  listPunchImports:()=>ipcRenderer.invoke('punch:list'),
  deletePunchImport:(id)=>ipcRenderer.invoke('punch:delete',id),
  saveBackup:()=>ipcRenderer.invoke('backup:save'),
  restoreBackup:()=>ipcRenderer.invoke('backup:restore'),
  openDataFolder:()=>ipcRenderer.invoke('app:openDataFolder')
}));
