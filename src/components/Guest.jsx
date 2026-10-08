import { Aurora, Button, Glass, Icon, Progress } from './ui'
import { fmtMinSec, rub } from '../lib/plan.mjs'
import { retryLabel } from '../lib/guest.mjs'
import { ClockArt } from '../onboarding/art'

// Гостевой режим внутри приложения (макеты new-guest-*): капсула-таймер в
// заголовке окна, полоса «Создайте аккаунт» над главной и экран «15 минут прошли».

// Капсула «12:34» в заголовке окна (обратный отсчёт пробного доступа).
export function TimerCapsule({ msLeft = 0, title = 'Пробный доступ' }) {
  const ended = msLeft <= 0
  return (
    <span className={`timer-capsule${ended ? ' timer-capsule--ended' : ''}`} title={`${title}: осталось ${fmtMinSec(msLeft)}`}>
      <Icon name="clock" size={12} stroke={2.4} />
      <span className="num">{fmtMinSec(msLeft)}</span>
    </span>
  )
}

// Полоса над главной: «Пробный доступ · осталось 12:34 из 15:00 — Создайте
// аккаунт, чтобы не потерять доступ» + «Создать аккаунт» / «Войти».
export function GuestStrip({ msLeft, totalMs, progress, onCreate, onLogin }) {
  return (
    <Glass edge className="guest-strip ui-rise" style={{ '--i': 0 }}>
      <div className="guest-strip-main">
        <div className="guest-strip-head">
          <span className="guest-strip-time">
            <Icon name="clock" size={13} stroke={2.2} />
            <span>Пробный доступ · осталось <b className="num">{fmtMinSec(msLeft)}</b></span>
          </span>
          <span className="guest-strip-total num">из {fmtMinSec(totalMs)}</span>
        </div>
        <Progress value={progress} label={`Осталось ${fmtMinSec(msLeft)}`} />
        <div className="guest-strip-title">Создайте аккаунт, чтобы не потерять доступ</div>
      </div>
      <div className="guest-strip-actions">
        <Button variant="primary" size="sm" icon={<Icon name="userPlus" size={14} stroke={2} />} onClick={onCreate}>Создать аккаунт</Button>
        <Button size="sm" onClick={onLogin}>Войти</Button>
      </div>
    </Glass>
  )
}

// «15 минут прошли»: вместо главной — кольцо 0:00, создать аккаунт или войти,
// тарифы и время следующей бесплатной попытки.
export function GuestEnded({ minutes = 15, retryAt, cheapest, onCreate, onLogin, onTariffs, onRetry, retrying = false }) {
  const next = retryLabel(retryAt)
  return (
    <section className="guest-ended ui-rise" aria-label="Пробный доступ закончился" style={{ '--i': 0 }}>
      <Aurora variant="hero" palette="off" />
      <div className="guest-ended-fade" aria-hidden="true" />
      <div className="guest-ended-body">
        <ClockArt label="0:00" caption={`из ${minutes}:00`} progress={0} tone="warm" />
        <div className="guest-ended-copy">
          <div className="guest-ended-status"><i aria-hidden="true" />Пробный доступ закончился</div>
          <h1 className="guest-ended-title">{minutes} минут прошли</h1>
          <p className="guest-ended-text">Создайте аккаунт или войдите — и выберите тариф. Бесплатные минуты дают раз в день.</p>
          <div className="guest-ended-actions">
            <Button variant="primary" size="lg" onClick={onCreate}>
              Создать аккаунт <Icon name="arrowRight" size={16} stroke={2.2} className="onb-inline-ico" />
            </Button>
            <Button size="lg" icon={<Icon name="login" size={18} stroke={2} />} onClick={onLogin}>Войти</Button>
          </div>
          <button type="button" className="guest-ended-tariffs ui-glass" onClick={onTariffs}>
            <span className="guest-ended-tariffs-ico" aria-hidden="true"><Icon name="tag" size={16} stroke={2} /></span>
            <span className="guest-ended-tariffs-text"><b>Тарифы</b><span>до 5 устройств</span></span>
            {cheapest ? <span className="guest-ended-price">от <b className="num">{rub(cheapest)}</b> / мес</span> : null}
            <Icon name="chevronRight" size={16} stroke={2} className="set-row-chev" />
          </button>
          {next ? (
            <div className="guest-ended-next"><Icon name="clock" size={13} stroke={2} />Следующая бесплатная попытка — {next}</div>
          ) : onRetry ? (
            <button type="button" className="onb-resend guest-ended-retry" onClick={onRetry} disabled={retrying}>
              <Icon name="refresh" size={13} stroke={2.2} /><span>{retrying ? 'Включаем…' : `Ещё ${minutes} минут бесплатно — новый день`}</span>
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
