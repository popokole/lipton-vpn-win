import { Button, Glass, Icon } from '../components/ui'
import Screen, { Overline } from './Screen'

// Политика конфиденциальности (макет new-scr-privacy): коротко и по делу,
// полный текст — на сайте. Внизу, мелко, — лицензии сторонних компонентов
// (раньше были отдельным пунктом в «О приложении»).

const SITE_PRIVACY = 'https://liptonone.online/legal?doc=privacy'

const SHORT = [
  'Не храним историю посещённых сайтов',
  'Не продаём данные',
  'Платежи — через ЮKassa, карту мы не видим',
  'Можно отменить подписку и выйти в любой момент',
]

const COLLECT = [
  ['Почта или Telegram-ID', 'для входа в аккаунт'],
  ['Устройства', 'чтобы соблюдать лимит в 5'],
  ['IP-адрес и сессии', 'для работы сервиса и безопасности'],
  ['Платежи', 'история и последние 4 цифры карты'],
]

export default function PrivacyScreen({ onBack, onLicenses, botName = '@liptonvpn_bot' }) {
  return (
    <Screen title="Политика конфиденциальности" onBack={onBack}>
      <section className="set-section">
        <Overline>Коротко</Overline>
        <div className="priv-short">
          {SHORT.map((t, i) => (
            <Glass key={t} className="priv-tile ui-rise" style={{ '--i': i + 1 }}>
              <span className="priv-tile-ico" aria-hidden="true"><Icon name="check" size={13} stroke={2.8} /></span>
              <b>{t}</b>
            </Glass>
          ))}
        </div>
      </section>

      <div className="cols-2 scr-cols priv-cols">
        <Glass className="scr-card priv-card ui-rise" style={{ '--i': 5 }}>
          <h2 className="priv-h">Какие данные мы собираем</h2>
          <p className="priv-p">Только то, без чего сервис не работает:</p>
          <ul className="priv-list">
            {COLLECT.map(([k, v]) => <li key={k}><b>{k}</b> — {v}</li>)}
          </ul>
          <p className="priv-p priv-p--muted">Журналы посещаемых сайтов и содержимое трафика не ведём. Логи приложения уходят в поддержку только по вашей кнопке.</p>
        </Glass>
        <div className="col">
          <Glass className="scr-card priv-card ui-rise" style={{ '--i': 6 }}>
            <h2 className="priv-h">Зачем и где хранятся</h2>
            <p className="priv-p">Чтобы вы входили в аккаунт с любого устройства, а мы проверяли подписку и лимит устройств. Для рекламы данные не используем.</p>
            <p className="priv-p">Платёжные данные обрабатывает ЮKassa — номер карты к нам не попадает. Коды входа и уведомления приходят через сервис доставки почты.</p>
          </Glass>
          <Glass className="scr-card priv-card ui-rise" style={{ '--i': 7 }}>
            <h2 className="priv-h">Ваши права</h2>
            <p className="priv-p">Можно узнать, какие данные о вас хранятся, исправить их или удалить аккаунт целиком — напишите в поддержку или боту {botName}.</p>
          </Glass>
        </div>
      </div>

      <div className="priv-foot">
        <Button icon={<Icon name="external" size={14} stroke={2} />} onClick={() => window.api?.openExternal?.(SITE_PRIVACY)}>Полная версия на liptonone.online</Button>
        {onLicenses && (
          <button type="button" className="priv-licenses" onClick={onLicenses}>
            <Icon name="layers" size={12} stroke={2} />Лицензии третьих сторон — sing-box, Wintun, шрифты
          </button>
        )}
      </div>
    </Screen>
  )
}
