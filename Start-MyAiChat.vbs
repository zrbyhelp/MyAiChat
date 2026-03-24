Set shell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
command = "powershell -NoExit -ExecutionPolicy Bypass -Command ""Set-Location -LiteralPath '" & scriptDir & "\tools\launcher'; node .\launcher.mjs"""
shell.Run command, 1, False
