// Системный прокси Windows (WinINet, HKCU). Общий для старого и нового ядра.

const { execSync, spawn } = require('child_process')

const REG = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'

function notifyWininet() {
  try {
    spawn('powershell', [
      '-WindowStyle', 'Hidden', '-Command',
      `$t=Add-Type -PassThru -TypeDefinition 'using System;using System.Runtime.InteropServices;public class W{[DllImport(\\"wininet.dll\\")]public static extern bool InternetSetOption(IntPtr a,int b,IntPtr c,int d);}';$t::InternetSetOption([IntPtr]::Zero,39,[IntPtr]::Zero,0);$t::InternetSetOption([IntPtr]::Zero,37,[IntPtr]::Zero,0)`,
    ], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  } catch { /* non-critical */ }
}

function setProxy(host, port) {
  try {
    execSync(`reg add "${REG}" /v ProxyEnable /t REG_DWORD /d 1 /f`, { stdio: 'ignore', windowsHide: true })
    execSync(`reg add "${REG}" /v ProxyServer /t REG_SZ /d "${host}:${port}" /f`, { stdio: 'ignore', windowsHide: true })
    execSync(
      `reg add "${REG}" /v ProxyOverride /t REG_SZ /d "localhost;127.*;10.*;172.16.*;192.168.*;*.ru;*.рф" /f`,
      { stdio: 'ignore', windowsHide: true }
    )
    notifyWininet()
    console.log(`[VPN] Прокси установлен: ${host}:${port}`)
  } catch (e) {
    console.error('[VPN] Ошибка установки прокси:', e.message)
  }
}

function clearProxy() {
  try {
    execSync(`reg add "${REG}" /v ProxyEnable /t REG_DWORD /d 0 /f`, { stdio: 'ignore', windowsHide: true })
    execSync(`reg delete "${REG}" /v ProxyServer /f`, { stdio: 'ignore', windowsHide: true })
    notifyWininet()
    console.log('[VPN] Прокси очищен')
  } catch {
    // ключа могло не быть
  }
}

// Текущий ProxyServer (или '' если не задан / прокси выключен).
function getProxyServer() {
  try {
    const en = execSync(`reg query "${REG}" /v ProxyEnable`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
    if (!/0x1\b/.test(en)) return ''
    const out = execSync(`reg query "${REG}" /v ProxyServer`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
    const m = out.match(/ProxyServer\s+REG_SZ\s+(\S+)/)
    return m ? m[1] : ''
  } catch {
    return ''
  }
}

module.exports = { setProxy, clearProxy, getProxyServer, notifyWininet }
