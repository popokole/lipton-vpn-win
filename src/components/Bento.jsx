import { Glass, Icon, Flag, Button, Progress, Sparkline, SparkDot, Bars, Signal, TrendRing } from './ui'
import { daysWord, fmtMinSec, rub } from '../lib/plan.mjs'
import { cleanRemark, flagCode, signalLevel, pingTone } from '../lib/servers.mjs'
import {
  fmtBytes, fmtBytesText, fmtMbps, pingStability, lastN, weekLabels, weekRange, vsAverage, weekAverage,
} from '../lib/stats.mjs'

// Правая колонка главной (макеты new-pc-home-on / new-pc-home-off): бенто 2×4.
//   «Сайты видят вас» — страна и IP из «Проверки соединения» (через VPN) или
//     настоящий IP без VPN; «Пинг» и «Скорость» — из ядра sing-box (clash_api);
//   «Сегодня» и «За неделю» — счётчик на этом компьютере (итоги по дням в настройках);
//   «Защита» — IPv6 и DNS из проверки; «Тариф» — из /me/subscription и /config.
// TODO(redesign): трафик со всех устройств аккаунта — когда бэкенд отдаст /me/traffic.

function TileHead({ icon, title, meta, children }) {
  return (
    <div className="bt-head">
      <span className="bt-title"><Icon name={icon} size={14} stroke={2} /><span>{title}</span></span>
      {meta != null && <span className="bt-meta">{meta}</span>}
      {children}
    </div>
  )
}

function Big({ value, unit, idle = false }) {
  return (
    <span className="bt-big-wrap">
      <span className={`bt-big display${idle ? ' bt-big--idle' : ''}`}>{value}</span>
      {unit && <span className="bt-unit">{unit}</span>}
    </span>
  )
}

// ─── Сайты видят вас ────────────────────────────────────────────────────────
function SitesTile({ on, status, exposure, server, ping, onCheck, index }) {
  const blocked = status === 'kill-switch'
  const code = !blocked && exposure.country ? exposure.country.toLowerCase() : ''
  const serverCode = server ? flagCode(server.remark) : null
  let title
  if (blocked) title = 'Интернет заблокирован'
  else if (exposure.state === 'checking') title = 'Проверяем…'
  else if (!code) title = on ? 'Страна не определена' : 'Ваш провайдер'
  else if (on && serverCode === code) title = cleanRemark(server.remark)
  else title = exposure.countryName || exposure.country
  const exposed = !blocked && (!on || exposure.exposed)

  return (
    <Glass
      as="button"
      type="button"
      edge
      className="bt bt-sites ui-rise"
      style={{ '--i': index }}
      onClick={onCheck}
      aria-label="Проверка соединения: что видят сайты"
    >
      <Flag code={code} size={40} glow className="bt-sites-flag" />
      <span className="bt-sites-text">
        <span className="bt-title"><Icon name="eye" size={14} stroke={2} /><span>Сайты видят вас</span></span>
        <span className="bt-sites-name">{title}</span>
        {blocked ? (
          <span className="bt-sites-ip">Трафик мимо VPN не пройдёт</span>
        ) : (
          <span className="bt-sites-ip num">
            <b>IP</b>{exposure.ip || (exposure.state === 'checking' ? '…' : '—')}
          </span>
        )}
      </span>
      {blocked ? (
        <span className="bt-badge bt-badge--warn"><Icon name="lock" size={12} stroke={2.4} /><span>Kill Switch</span></span>
      ) : exposed ? (
        <span className="bt-badge bt-badge--warn"><Icon name="lockOpen" size={12} stroke={2.4} /><span>IP открыт</span></span>
      ) : (
        <span className="bt-sites-ping">
          <Signal level={signalLevel(ping)} tone={pingTone(ping) === 'none' ? 'ok' : pingTone(ping)} />
          <span className="num">{ping != null ? `${ping} мс` : '—'}</span>
        </span>
      )}
    </Glass>
  )
}

// ─── Пинг за час ────────────────────────────────────────────────────────────
function PingTile({ on, stats, index }) {
  const hist = (stats?.pingHistory || []).map(p => p.ms)
  const live = on && stats?.live
  const ping = live ? stats.ping : null
  const stab = live ? pingStability(stats?.pingHistory) : null
  let right
  if (!on) right = <span className="bt-note">нет подключения</span>
  else if (!live) right = <span className="bt-note">нет данных</span>
  else if (ping == null) right = <span className="bt-note">замеряем</span>
  else if (stab) right = <span className={`bt-note bt-note--${stab.tone}`}>{stab.label}</span>
  else right = null

  return (
    <Glass className="bt bt-ping ui-rise" style={{ '--i': index }}>
      <TileHead icon="timer" title="Пинг" meta="за час" />
      <div className="bt-row">
        {ping != null ? <Big value={ping} unit="мс" /> : <Big value="—" idle />}
        {right}
      </div>
      <div className="bt-fill" />
      <div className="bt-spark">
        <Sparkline values={hist} idle={!live || hist.filter(v => v != null).length < 2} />
        {live && <SparkDot values={hist} />}
      </div>
    </Glass>
  )
}

// ─── Скорость ───────────────────────────────────────────────────────────────
function SpeedTile({ on, stats, index }) {
  const live = on && stats?.live
  const hist = live ? lastN((stats.speedHistory || []).map(s => s.down), 12) : []
  return (
    <Glass className="bt bt-speed ui-rise" style={{ '--i': index }}>
      <TileHead
        icon="gauge"
        title="Скорость"
        meta={live
          ? <span className="bt-meta-up num"><Icon name="arrowUp" size={12} stroke={2.4} /><span>{fmtMbps(stats.speed?.up)}</span></span>
          : <span className="bt-meta-ring" />}
      />
      <div className="bt-row">
        {live ? (
          <span className="bt-big-wrap">
            <span className="bt-big display">{fmtMbps(stats.speed?.down)}</span>
            <span className="bt-unit bt-unit--sm">Мбит/с</span>
            <Icon name="arrowDown" size={12} stroke={2.4} className="bt-down-ico" />
          </span>
        ) : (
          <>
            <span className="bt-big-wrap"><span className="bt-big bt-big--idle display">—</span><span className="bt-unit bt-unit--sm">Мбит/с</span></span>
            <span className="bt-note">нет данных</span>
          </>
        )}
      </div>
      <div className="bt-fill" />
      <Bars values={live ? hist : new Array(12).fill(0)} idle={!live} />
    </Glass>
  )
}

// ─── Сегодня ────────────────────────────────────────────────────────────────
function TodayTile({ stats, index }) {
  const today = stats?.today || { up: 0, down: 0 }
  const total = fmtBytes(today.up + today.down)
  const delta = vsAverage(stats?.week)
  return (
    <Glass className="bt bt-today ui-rise" style={{ '--i': index }} title="Считается на этом компьютере">
      <TileHead icon="updown" title="Сегодня" />
      <TrendRing up={delta == null || delta >= 0} />
      <div className="bt-row bt-row--start"><Big value={total.value} unit={total.unit} /></div>
      <div className="bt-sub num">
        {delta != null
          ? <><b className="bt-accent">{delta > 0 ? '+' : ''}{delta}%</b> к среднему</>
          : 'на этом устройстве'}
      </div>
      <div className="bt-fill" />
      <div className="bt-pair">
        <span className="bt-pair-item"><span className="bt-pair-ico bt-pair-ico--down"><Icon name="arrowDown" size={10} stroke={3} /></span><span className="num">{fmtBytesText(today.down)}</span></span>
        <span className="bt-pair-item"><span className="bt-pair-ico bt-pair-ico--up"><Icon name="arrowUp" size={10} stroke={3} /></span><span className="num">{fmtBytesText(today.up)}</span></span>
      </div>
    </Glass>
  )
}

// ─── Защита ─────────────────────────────────────────────────────────────────
function ProtectionTile({ on, status, exposure, onCheck, index }) {
  let title
  let note
  let noteTone = ''
  let items = exposure.items
  if (status === 'kill-switch') {
    title = 'Kill Switch'
    note = 'включён'
    noteTone = 'warn'
    items = [{ ok: true, label: 'Утечек нет' }, { ok: false, label: 'Нет интернета' }]
  } else if (on && exposure.state === 'checking') {
    title = 'Проверяем…'
    note = ''
    items = [{ ok: null, label: 'IPv6' }, { ok: null, label: 'DNS' }]
  } else if (on && exposure.state === 'unknown') {
    title = 'Активна'
    note = 'не проверено'
  } else if (on && exposure.leaks === 0) {
    title = 'Активна'
    note = 'утечек нет'
  } else if (on) {
    title = 'Активна'
    note = `${exposure.leaks} ${exposure.leaks === 1 ? 'утечка' : exposure.leaks < 5 ? 'утечки' : 'утечек'}`
    noteTone = 'warn'
  } else {
    title = 'Не активна'
    items = items.length ? items : [{ ok: false, label: 'IP открыт' }, { ok: false, label: 'DNS провайдера' }]
    const n = items.filter(i => !i.ok).length
    note = `${n} ${n === 1 ? 'утечка' : n < 5 ? 'утечки' : 'утечек'}`
    noteTone = 'warn'
  }
  const good = on && exposure.state === 'ok' && exposure.leaks === 0

  return (
    <Glass as="button" type="button" className="bt bt-protect ui-rise" style={{ '--i': index }} onClick={onCheck} aria-label="Защита: открыть проверку соединения">
      <TileHead icon={on ? 'shieldCheck' : 'shieldSlash'} title="Защита">
        <span className={`bt-state-dot${good ? '' : ' bt-state-dot--warn'}`} aria-hidden="true" />
      </TileHead>
      <div className="bt-protect-row">
        <span className="bt-protect-title">{title}</span>
        {note && <span className={`bt-note${noteTone ? ` bt-note--${noteTone}` : ''}`}>{note}</span>}
      </div>
      <div className="bt-fill" />
      <div className="bt-checks">
        {items.slice(0, 2).map((it, i) => (
          <span key={i} className={`bt-check bt-check--${it.ok == null ? 'wait' : it.ok ? 'ok' : 'bad'}${i === 1 ? ' bt-check--alt' : ''}`}>
            <span className="bt-check-ico" aria-hidden="true">
              {it.ok == null ? <span className="ui-spinner ui-spinner--xs" /> : it.ok ? <Icon name="check" size={11} stroke={3} /> : <b>!</b>}
            </span>
            <span>{it.label}</span>
          </span>
        ))}
      </div>
    </Glass>
  )
}

// ─── Тариф ──────────────────────────────────────────────────────────────────
function PlanTile({ plan, cheapest, onRenew, onChangeTariff, onLogin, index }) {
  let meta = null
  let title = plan?.title || 'Подписка'
  let sub = ''
  let progress = null
  let action
  const days = plan ? `${plan.daysLeft} ${daysWord(plan.daysLeft)}` : ''

  switch (plan?.kind) {
    case 'active': {
      const period = plan.periodDays || 30
      meta = (
        <>
          <span className="bt-long">{Math.min(plan.daysLeft, period)} из {period} {daysWord(period)}</span>
          <span className="bt-short">{Math.min(plan.daysLeft, period)}/{period}</span>
        </>
      )
      sub = [plan.untilLabel, plan.priceKopeks ? rub(plan.priceKopeks) : ''].filter(Boolean).join(' · ')
      progress = plan.progress
      action = <Button size="sm" block onClick={onChangeTariff}>Сменить тариф</Button>
      break
    }
    case 'trial':
      meta = 'пробный период'
      sub = plan.untilLabel || `осталось ${days}`
      progress = plan.progress
      action = <Button size="sm" block onClick={onRenew}>Оформить подписку</Button>
      break
    case 'expired':
      meta = 'истекла'
      sub = plan.untilLabel ? plan.untilLabel.replace(/^до /, 'закончилась ') : 'подписка закончилась'
      progress = 0
      action = <Button size="sm" variant="primary" block onClick={onRenew}>Продлить</Button>
      break
    case 'guest':
      title = 'Пробный доступ'
      meta = <span className="num">{fmtMinSec(plan.msLeft)} из {fmtMinSec(plan.totalMs || 15 * 60000)}</span>
      sub = 'тариф и статистика — после входа'
      progress = plan.progress
      action = <Button size="sm" variant="primary" block onClick={onLogin}>Создать аккаунт</Button>
      break
    case 'daily':
      title = '15 минут'
      meta = <span className="num">{fmtMinSec(plan.msLeft)} из {fmtMinSec(plan.totalMs || 15 * 60000)}</span>
      sub = cheapest ? `дальше — от ${rub(cheapest)} в месяц` : 'раз в день'
      progress = plan.progress
      action = <Button size="sm" variant="primary" block onClick={onRenew}>Оформить подписку</Button>
      break
    default:
      title = 'Нет подписки'
      sub = cheapest ? `от ${rub(cheapest)} в месяц` : 'до 5 устройств'
      action = <Button size="sm" variant="primary" block onClick={onRenew}>Оформить подписку</Button>
  }

  return (
    <Glass className="bt bt-plan ui-rise" style={{ '--i': index }}>
      <TileHead icon="battery" title="Тариф" meta={meta} />
      <div className="bt-plan-title">{title}</div>
      <div className="bt-plan-sub num">{sub}</div>
      {progress != null && <Progress value={progress} thick className="bt-plan-progress" label={days ? `Осталось ${days}` : undefined} />}
      <div className="bt-fill" />
      {action}
    </Glass>
  )
}

// ─── За неделю ──────────────────────────────────────────────────────────────
function WeekTile({ stats, index }) {
  const week = stats?.week || []
  const totals = week.map(d => d.total)
  const sum = totals.reduce((a, b) => a + b, 0)
  const total = fmtBytes(sum)
  const avg = weekAverage(week)
  const avgF = fmtBytes(avg)
  const max = Math.max(0, ...totals)
  const BAR_MAX = 32
  const labels = weekLabels(week)
  const todayF = fmtBytes(totals[totals.length - 1] || 0)

  return (
    <Glass className="bt bt-week ui-rise" style={{ '--i': index }} title="Считается на этом компьютере">
      <TileHead
        icon="chart"
        title="За неделю"
        meta={<><span className="bt-long">{weekRange(week)}</span><span className="bt-short">{weekRange(week, true)}</span></>}
      />
      <div className="bt-row">
        <Big value={total.value} unit={total.unit} />
        {avg > 0 && (
          <span className="bt-avg num"><i aria-hidden="true" />ср. {avgF.value}{avgF.unit !== total.unit ? ` ${avgF.unit}` : ''}</span>
        )}
      </div>
      <div className="bt-week-chart">
        {avg > 0 && max > 0 && <span className="bt-week-avg" style={{ bottom: Math.round((avg / max) * BAR_MAX) }} aria-hidden="true" />}
        <div className="bt-week-bars">
          {week.map((d, i) => {
            const last = i === week.length - 1
            const h = d.total > 0 && max > 0 ? Math.max(4, Math.round((d.total / max) * BAR_MAX)) : 3
            return (
              <div key={d.key} className="bt-week-col">
                {last && d.total > 0 && <span className="bt-week-val num">{todayF.value}{todayF.unit !== total.unit ? ` ${todayF.unit}` : ''}</span>}
                <i className={last ? 'is-today' : ''} style={{ height: h }} />
              </div>
            )
          })}
        </div>
      </div>
      <div className="bt-week-days">
        {labels.map((l, i) => <span key={i} className={i === labels.length - 1 ? 'is-today' : ''}>{l}</span>)}
      </div>
    </Glass>
  )
}

export default function Bento({
  on, status, stats, exposure, server, plan, cheapest, onCheck, onRenew, onChangeTariff, onLogin,
}) {
  const ping = on && stats?.live ? stats.ping : null
  return (
    <div className="bento" aria-label="Статистика">
      <SitesTile on={on} status={status} exposure={exposure} server={server} ping={ping} onCheck={onCheck} index={1} />
      <PingTile on={on} stats={stats} index={2} />
      <SpeedTile on={on} stats={stats} index={3} />
      <TodayTile stats={stats} index={4} />
      <ProtectionTile on={on} status={status} exposure={exposure} onCheck={onCheck} index={5} />
      <PlanTile plan={plan} cheapest={cheapest} onRenew={onRenew} onChangeTariff={onChangeTariff} onLogin={onLogin} index={6} />
      <WeekTile stats={stats} index={7} />
    </div>
  )
}
