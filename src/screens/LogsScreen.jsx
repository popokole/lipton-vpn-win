import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, ConfirmDialog, Glass, Icon } from '../components/ui'
import Screen from './Screen'
import { logsCountLabel, parseLogLine } from '../lib/screens.mjs'

// Логи приложения (макет new-scr-logs): обновить, скопировать, отправить в
// поддержку (в тот же чат), открыть файл, очистить. Личных данных в логах нет:
// IP и страны проверка соединения туда не пишет.
export default function LogsScreen({ onBack, authed, onToast, botUrl = 'https://t.me/liptonvpn_bot' }) {
  const [lines, setLines] = useState(null)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const boxRef = useRef(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const load = useCallback(async () => {
    const l = await window.api?.getLogs?.().catch(() => null)
    if (!alive.current) return
    setLines(Array.isArray(l) ? l : [])
    requestAnimationFrame(() => { const el = boxRef.current; if (el) el.scrollTop = el.scrollHeight })
  }, [])
  useEffect(() => { load() }, [load])

  const copy = async () => {
    try {
      const fresh = await window.api?.getLogs?.()
      const list = Array.isArray(fresh) ? fresh : lines || []
      await navigator.clipboard.writeText(list.join('\n'))
      setCopied(true)
      setTimeout(() => alive.current && setCopied(false), 2000)
    } catch {
      onToast?.('Не удалось скопировать логи', 'error')
    }
  }

  const send = async () => {
    if (!authed) { window.api?.openExternal?.(botUrl); return }
    setSending(true)
    const r = await window.api?.sendAppLogs?.().catch(x => ({ success: false, error: x?.message }))
    if (!alive.current) return
    setSending(false)
    if (r?.success) onToast?.('Логи отправлены в чат поддержки')
    else onToast?.(r?.error || 'Не удалось отправить логи', 'error')
  }

  const clear = async () => {
    await window.api?.clearLogs?.().catch(() => {})
    setConfirm(false)
    load()
  }

  const parsed = (lines || []).map(parseLogLine)

  return (
    <Screen title="Логи приложения" onBack={onBack} fill>
      <Glass className="scr-card logs-intro ui-rise" style={{ '--i': 1 }}>
        <span className="set-ico" aria-hidden="true"><Icon name="shieldCheck" size={16} stroke={2} /></span>
        <span className="logs-intro-text">Пригодятся поддержке, если что-то не работает. <b>Личных данных в логах нет.</b></span>
      </Glass>

      <div className="logs-actions ui-rise" style={{ '--i': 2 }}>
        <Button icon={<Icon name="refresh" size={15} stroke={2} />} onClick={load}>Обновить</Button>
        <Button icon={<Icon name={copied ? 'check' : 'copy'} size={15} stroke={2} />} onClick={copy}>{copied ? 'Скопировано' : 'Копировать'}</Button>
        <Button className="logs-send" onClick={send} disabled={sending}
          icon={sending ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : <Icon name="send" size={15} stroke={2} />}>
          {authed ? 'Отправить в поддержку' : 'Поддержка в Telegram'}
        </Button>
      </div>

      <Glass className="logs-view ui-rise" style={{ '--i': 3 }}>
        <div className="logs-view-head">
          <span className="logs-file"><Icon name="file" size={13} stroke={2} />app.log</span>
          <span className="logs-count"><i aria-hidden="true" />сегодня · {logsCountLabel(parsed.length)}</span>
        </div>
        <div className="logs-box" ref={boxRef} aria-label="Строки логов">
          {lines === null && <div className="logs-empty">Загружаем…</div>}
          {lines !== null && !parsed.length && <div className="logs-empty">Логи пусты — подключитесь к VPN и обновите</div>}
          {parsed.map((l, i) => (
            <div key={i} className={`logs-line logs-line--${l.level}`}>
              {l.time && <span className="logs-time">[{l.time}]</span>}
              <span className="logs-level">[{l.level.toUpperCase()}]</span>
              {l.tag && <span className="logs-tag">[{l.tag}]</span>}
              <span className="logs-text">{l.text}</span>
            </div>
          ))}
        </div>
      </Glass>

      <div className="logs-foot">
        <button type="button" className="set-logs-file" onClick={() => window.api?.openLogFile?.()}><Icon name="file" size={12} stroke={2} /><span>Открыть файл</span></button>
        <button type="button" className="logs-clear" onClick={() => setConfirm(true)}><Icon name="trash" size={13} stroke={2} /><span>Очистить логи</span></button>
      </div>

      <ConfirmDialog
        open={confirm}
        icon="trash"
        tone="warn"
        title="Очистить логи?"
        confirmLabel="Очистить"
        onConfirm={clear}
        onCancel={() => setConfirm(false)}
      >
        Строки пропадут из окна. Файл app.log на диске останется — его можно открыть кнопкой «Открыть файл».
      </ConfirmDialog>
    </Screen>
  )
}
