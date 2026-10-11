@echo off
cd /d "%~dp0"
start "" http://localhost:5757
node server.mjs
