import { useCallback, useEffect, useRef, useState } from 'react'
import { RowButton } from '../components/ui/Pressables'
import { Button, ConfirmDialog, Glass, Icon } from '../components/ui'
import { deviceInfo, lastSeenLabel } from '../lib/settings.mjs'
import Screen, { Overline } from './Screen'

const LOAD_ERROR = 'Не удалось загрузить устройства'

export default function DevicesScreen({ onBack, onToast, onLogin }) {
  const [state, setState] = useState(null)
  const [loadId, setLoadId] = useState(0)
  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const removing = useRef(false)
  const alive = useRef(false)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    let live = true

    const load = async () => {
      try {
        const r = await window.api.accountDevices()
        if (!live) return
        if (r?.success && Array.isArray(r.devices)) {
          setState({
            devices: r.devices.filter(d => typeof d?.hwid === 'string' && d.hwid.trim()),
            limit: r.device_limit,
            hwid: r.hwid,
          })
          return
        }
        if (r?.httpStatus === 401) {
          const auth = await window.api.authState()
          if (!live) return
          if (auth?.authed === false) {
            setState({ error: 'Сессия истекла. Войдите в аккаунт снова.', needsLogin: true })
            return
          }
        }
      } catch {}
      if (live) setState({ error: LOAD_ERROR })
    }

    load()
    return () => { live = false }
  }, [loadId])

  const reload = () => {
    setState(null)
    setLoadId(id => id + 1)
  }

  const askToRemove = device => {
    setRemoveError('')
    setTarget(device)
  }

  const closeDialog = useCallback(() => {
    if (!removing.current) setTarget(null)
  }, [])

  const confirmRemoval = async () => {
    if (!target || removing.current) return
    removing.current = true
    setBusy(true)
    setRemoveError('')

    let r
    try {
      r = target.all
        ? await window.api.accountRevokeAllDevices()
        : await window.api.accountRevokeDevice(target.hwid)
    } catch {}
    removing.current = false
    if (!alive.current) return

    setBusy(false)
    if (r?.success) {
      setTarget(null)
      onToast?.(target.all ? 'Все устройства удалены из списка' : 'Устройство удалено из списка')
      reload()
    } else if (r?.httpStatus === 401) {
      setTarget(null)
      onToast?.('Не удалось удалить устройства. Проверяем вход в аккаунт.', 'error')
      reload()
    } else {
      setRemoveError(r?.httpStatus === 429 && r.error
        ? r.error
        : target.all ? 'Не удалось удалить устройства. Попробуйте ещё раз.' : 'Не удалось удалить устройство. Попробуйте ещё раз.')
    }
  }

  const devices = state?.devices
  const limit = state?.limit
  const count = Number.isInteger(limit) && limit >= 0 ? `${devices?.length} из ${limit}` : devices?.length

  return (
    <>
      <div inert={target ? '' : undefined}>
        <Screen title="Устройства" onBack={onBack} right={devices && (
          <Button size="sm" onClick={reload} icon={<Icon name="refresh" size={14} stroke={2} />}>Обновить</Button>
        )}>
          <p className="scr-lead">В списке только устройства, зарегистрированные в подписке этого аккаунта через приложения с HWID.</p>

          {!state && (
            <div className="set-row set-row--muted" role="status">
              <span className="ui-spinner ui-spinner--sm" aria-hidden="true" />Загружаем устройства…
            </div>
          )}

          {state?.error && (
            <div className="col">
              <div className="scr-error scr-error--block" role="alert">{state.error}</div>
              <div>
                {state.needsLogin
                  ? <Button variant="primary" onClick={onLogin}>Войти</Button>
                  : <Button onClick={reload}>Повторить</Button>}
              </div>
            </div>
          )}

          {devices && (
            <section className="set-section">
              <Overline meta={count}>Зарегистрированные устройства</Overline>
              <Glass className="set-card ui-rise" style={{ '--i': 1 }}>
                {!devices.length && (
                  <div className="scr-empty scr-empty--big" role="status">
                    <Icon name="desktop" size={26} stroke={1.6} />
                    <span>Зарегистрированных устройств пока нет.</span>
                  </div>
                )}
                {devices.map(device => {
                  const info = deviceInfo(device)
                  const current = device.hwid === state.hwid
                  const seen = lastSeenLabel(device.updated_at)
                  return (
                    <div key={device.hwid} className="set-row set-row--wrap">
                      <span className={`set-ico${current ? ' set-ico--accent' : ''}`} aria-hidden="true">
                        <Icon name={info.desktop ? 'desktop' : 'phone'} size={16} stroke={2} />
                      </span>
                      <span className="set-row-text">
                        <span className="set-row-title" title={info.title}>{info.title}</span>
                        <span className="set-row-sub">
                          {current ? <b className="set-mine">Это устройство</b> : info.platform}
                          {seen && ` · Подписка обновлена ${seen}`}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        aria-label={current ? 'Удалить это устройство' : `Удалить устройство «${info.title}»`}
                        onClick={() => askToRemove({ hwid: device.hwid, title: info.title, current })}
                      >
                        Удалить
                      </Button>
                    </div>
                  )
                })}
                {devices.length > 0 && (
                  <RowButton variant="dangerRow" onClick={() => askToRemove({ all: true })}>
                    <Icon name="unlink" size={16} stroke={1.8} />
                    Удалить все устройства
                  </RowButton>
                )}
              </Glass>
            </section>
          )}
        </Screen>
      </div>

      <ConfirmDialog
        open={!!target}
        icon="unlink"
        tone="danger"
        title={target?.all ? 'Удалить все устройства?' : target?.current ? 'Удалить это устройство?' : 'Удалить устройство?'}
        confirmLabel={target?.all ? 'Удалить все' : 'Удалить'}
        busy={busy}
        error={removeError}
        onConfirm={confirmRemoval}
        onCancel={closeDialog}
      >
        {target?.all
          ? 'Освободятся все места в подписке.'
          : `Устройство «${target?.title}» освободит место в подписке.`}
        {' '}Активные VPN-подключения могут продолжить работу.
        {target?.current
          ? ' Этот компьютер может зарегистрироваться снова при обновлении подписки.'
          : ' Удалённые устройства могут зарегистрироваться снова при обновлении подписки.'}
      </ConfirmDialog>
    </>
  )
}
