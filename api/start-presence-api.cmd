@echo off
cd /d C:\Apps\presence-api
"C:\Program Files\nodejs\node.exe" C:\Apps\presence-api\api\server.js >> C:\Apps\presence-api\logs\presence-api.log 2>&1
