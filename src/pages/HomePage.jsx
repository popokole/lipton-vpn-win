import Hero from '../components/Hero'
import BannerSlot from '../components/BannerSlot'
import SubscriptionPanel from '../components/SubscriptionPanel'
import { Glass, Tile, Icon } from '../components/ui'

// Главная: слот баннера сверху, слева карточка состояния (hero), справа колонка.
//
// TODO(redesign): правая колонка по макету — бенто «Сайты видят вас», пинг,
// скорость, «Сегодня», «Защита», «Тариф», «За неделю» (пакет D4, данные — D3).
// Пока там прежняя карточка подписки и быстрые действия, чтобы ничего не пропало.

function QuickTile({ icon, title, sub, onClick, index }) {
  return (
    <Glass as="button" type="button" className="quick-tile ui-rise" style={{ '--i': index }} onClick={onClick}>
      <span className="quick-tile-ico" aria-hidden="true"><Icon name={icon} size={16} stroke={2} /></span>
      <span className="quick-tile-text">
        <span className="quick-tile-title">{title}</span>
        <span className="quick-tile-sub">{sub}</span>
      </span>
      <Icon name="chevronRight" size={16} stroke={2} className="quick-tile-chev" />
    </Glass>
  )
}

export default function HomePage({ hero, subscriptions, authed, banners, onRefreshSub, onBuy, onOpen }) {
  return (
    <>
      <BannerSlot banners={banners} />
      <div className="home-grid">
        <Hero {...hero} />
        <div className="home-col">
          <Tile index={1} icon={<Icon name="crown" size={14} stroke={2} />} title="Подписка" className="home-subs">
            <div className="legacy-inline legacy-subs">
              <SubscriptionPanel subscriptions={subscriptions} onRefresh={onRefreshSub} onBuy={onBuy} />
            </div>
          </Tile>
          <div className="home-quick">
            <QuickTile
              index={2}
              icon="shieldCheck"
              title="Проверка соединения"
              sub="Что видят сайты, IPv6 и DNS"
              onClick={() => onOpen('check')}
            />
            {authed ? (
              <QuickTile index={3} icon="chat" title="Поддержка" sub="Ответим в чате" onClick={() => onOpen('support')} />
            ) : (
              <QuickTile
                index={3}
                icon="telegram"
                title="Telegram-бот"
                sub="@liptonvpn_bot"
                onClick={() => window.api?.openExternal?.('https://t.me/liptonvpn_bot')}
              />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
