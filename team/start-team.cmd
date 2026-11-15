@echo off
rem Fallback for team setup: opens missing role chats one by one via deep link.
rem Normally the user creates empty chats and sends each the prompt from team\TEAM-BEITRETEN.txt.
cd /d "%~dp0.."
node team\bootstrap.mjs deeplink %*
echo.
pause
