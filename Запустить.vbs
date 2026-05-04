Set ws = WScript.CreateObject("WScript.Shell")
dir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)
ws.CurrentDirectory = dir
ws.Run "cmd /c npm run build >nul 2>&1 && node scripts\run-prod.js", 0, False
