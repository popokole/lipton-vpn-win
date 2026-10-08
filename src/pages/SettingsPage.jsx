import SettingsPanel from '../components/SettingsPanel'
import { Glass, Segmented, Button, Icon } from '../components/ui'

// Настройки (в них же профиль): слева аккаунт, оформление и помощь, справа —
// прежняя панель параметров VPN и приложения (режим, обход РФ, домены,
// Kill Switch, автоподключение, автозапуск, обновления, логи, лицензии, выход).
//
// TODO(redesign): полная раскладка по макету new-pc-settings — подписка,
// устройства, способ оплаты, уведомления, «Обновить ссылку» — пакет D4.

const THEME_OPTIONS = [
  { value: 'dark', label: 'Тёмная', icon: <Icon name="moon" size={14} /> },
  { value: 'light', label: 'Светлая', icon: <Icon name="sun" size={14} /> },
  { value: 'system', label: 'Системная', icon: <Icon name="monitor" size={14} /> },
]

function Row({ icon, title, sub, onClick, action }) {
  const body = (
    <>
      <span className="set-ico" aria-hidden="true"><Icon name={icon} size={16} stroke={2} /></span>
      <span className="set-row-text">
        <span className="set-row-title">{title}</span>
        {sub && <span className="set-row-sub">{sub}</span>}
      </span>
      {action || (onClick && <Icon name="chevronRight" size={16} stroke={2} className="set-row-chev" />)}
    </>
  )
  if (onClick && !action) {
    return <button type="button" className="set-row set-row--link" onClick={onClick}>{body}</button>
  }
  return <div className="set-row">{body}</div>
}

export default function SettingsPage({ authed, theme, onTheme, onOpen, onLogin, onLogout, vpnStatus }) {
  return (
    <>
      <div className="page-head">
        <h1 className="ui-h1">Настройки</h1>
        <span className="ui-h1-sub">Аккаунт, подписка и параметры VPN</span>
      </div>

      <div className="cols-2">
        <div className="col">
          <div className="ui-overline set-overline">Аккаунт</div>
          <Glass className="set-card ui-rise" style={{ '--i': 1 }}>
            {authed ? (
              <>
                <Row icon="user" title="Личный кабинет" sub="Почта, подписка, способ оплаты" onClick={() => onOpen('account')} />
                <Row icon="crown" title="Оплата и тариф" sub="Продлить или сменить тариф" onClick={() => onOpen('billing')} />
                <Row icon="receipt" title="История платежей" sub="Оплаты и списания" onClick={() => onOpen('history')} />
              </>
            ) : (
              <Row
                icon="user"
                title="Вы не вошли"
                sub="Пробный доступ без аккаунта"
                action={<Button size="sm" variant="primary" onClick={onLogin}>Войти</Button>}
              />
            )}
          </Glass>

          <div className="ui-overline set-overline">Приложение</div>
          <Glass className="set-card ui-rise" style={{ '--i': 2 }}>
            <div className="set-row set-row--stack">
              <div className="set-row-line">
                <span className="set-ico" aria-hidden="true"><Icon name="palette" size={16} stroke={2} /></span>
                <span className="set-row-text"><span className="set-row-title">Тема</span></span>
              </div>
              <Segmented label="Тема" value={theme} onChange={onTheme} options={THEME_OPTIONS} />
            </div>
          </Glass>

          <div className="ui-overline set-overline">Помощь</div>
          <Glass className="set-card ui-rise" style={{ '--i': 3 }}>
            <Row icon="shieldCheck" title="Проверка соединения" sub="Что видят сайты, утечки IPv6 и DNS" onClick={() => onOpen('check')} />
            {authed && <Row icon="chat" title="Поддержка" sub="Чат с поддержкой" onClick={() => onOpen('support')} />}
            <Row
              icon="telegram"
              title="Telegram-бот"
              sub="@liptonvpn_bot"
              onClick={() => window.api?.openExternal?.('https://t.me/liptonvpn_bot')}
            />
          </Glass>
        </div>

        <div className="col">
          <div className="ui-overline set-overline">VPN и приложение</div>
          <div className="legacy-inline legacy-settings ui-rise" style={{ '--i': 2 }}>
            <SettingsPanel
              onClose={() => {}}
              onLogout={onLogout}
              vpnStatus={vpnStatus}
              onCheckConnection={() => onOpen('check')}
            />
          </div>
        </div>
      </div>
    </>
  )
}
