import { useState } from 'react'

const SINGBOX_TAG = 'v1.14.2'

// Сторонние компоненты, которые входят в установку приложения.
const COMPONENTS = [
  {
    name: 'sing-box',
    version: SINGBOX_TAG.slice(1),
    license: 'GPL-3.0-or-later',
    copyright: '© 2022 nekohasekai (SagerNet)',
    note: 'Ядро VPN. Поставляется без изменений отдельным файлом sing-box.exe. Исходный код этой версии доступен по ссылке ниже.',
    links: [
      { label: `Исходный код ${SINGBOX_TAG}`, url: `https://github.com/SagerNet/sing-box/tree/${SINGBOX_TAG}` },
      { label: 'Текст GPL-3.0', url: 'https://www.gnu.org/licenses/gpl-3.0.html' },
    ],
    noticeFile: 'sing-box',
  },
  {
    name: 'Правила обхода РФ (geosite-category-ru, geoip-ru)',
    license: 'GPL-3.0-or-later',
    copyright: '© 2022 nekohasekai (SagerNet)',
    note: 'Списки российских сайтов и адресов для «Обхода РФ».',
    links: [
      { label: 'sing-geosite', url: 'https://github.com/SagerNet/sing-geosite' },
      { label: 'sing-geoip', url: 'https://github.com/SagerNet/sing-geoip' },
    ],
  },
  {
    name: 'Wintun',
    version: '0.14.1',
    license: 'Prebuilt Binaries License',
    copyright: '© WireGuard LLC',
    note: 'Драйвер сетевого адаптера для режима «VPN для всего трафика». Готовый подписанный драйвер, без изменений.',
    links: [
      { label: 'wintun.net', url: 'https://www.wintun.net' },
      { label: 'Текст лицензии', url: 'https://git.zx2c4.com/wintun/tree/prebuilt-binaries-license.txt' },
    ],
  },
  {
    name: 'Xray-core',
    version: '26.3.27',
    license: 'MPL-2.0',
    copyright: '© XTLS (Project X)',
    note: 'Запасное ядро прежних версий приложения.',
    links: [
      { label: 'Исходный код', url: 'https://github.com/XTLS/Xray-core' },
      { label: 'Текст MPL-2.0', url: 'https://www.mozilla.org/MPL/2.0/' },
    ],
  },
  {
    name: 'tun2socks',
    version: '2.5.2',
    license: 'MIT',
    copyright: '© Jason Lyu',
    note: 'Используется только запасным ядром.',
    links: [
      { label: 'Исходный код', url: 'https://github.com/xjasonlyu/tun2socks' },
    ],
  },
  {
    name: 'Electron, React, flag-icons',
    license: 'MIT',
    note: 'Оболочка и интерфейс приложения. Лицензии Chromium — в файле LICENSES.chromium.html в папке программы.',
    links: [
      { label: 'Electron', url: 'https://github.com/electron/electron' },
      { label: 'React', url: 'https://github.com/facebook/react' },
    ],
  },
]

function LicenseCard({ item }) {
  const [notice, setNotice] = useState(null)

  async function toggleNotice() {
    if (notice !== null) { setNotice(null); return }
    const text = await window.api.getLicenseText(item.noticeFile)
    setNotice(text || 'Файл лицензии не найден рядом с программой. Текст — по ссылке выше.')
  }

  return (
    <div className="license-card">
      <div className="license-card-head">
        <span className="license-name">
          {item.name}{item.version ? <span className="license-version"> {item.version}</span> : null}
        </span>
        <span className="license-badge">{item.license}</span>
      </div>
      {item.copyright && <span className="license-copy">{item.copyright}</span>}
      {item.note && <span className="license-note">{item.note}</span>}
      <div className="license-links">
        {item.links.map(l => (
          <button key={l.url} className="license-link" onClick={() => window.api.openExternal(l.url)}>
            {l.label}
          </button>
        ))}
        {item.noticeFile && (
          <button className="license-link" onClick={toggleNotice}>
            {notice !== null ? 'Скрыть уведомление' : 'Уведомление об авторских правах'}
          </button>
        )}
      </div>
      {notice !== null && <pre className="license-text">{notice}</pre>}
    </div>
  )
}

export default function LicensesScreen({ onBack }) {
  const [closing, setClosing] = useState(false)

  function back() {
    setClosing(true)
    setTimeout(onBack, 260)
  }

  return (
    <div className={`bypass-screen licenses-screen${closing ? ' bypass-screen--closing' : ''}`}>
      <div className="bypass-header">
        <button className="bypass-back" onClick={back}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span className="bypass-title">Лицензии</span>
      </div>

      <p className="bypass-hint">
        Lipton VPN использует открытые компоненты. Они распространяются без изменений,
        на условиях своих лицензий.
      </p>

      <div className="licenses-list">
        {COMPONENTS.map(item => <LicenseCard key={item.name} item={item} />)}
      </div>
    </div>
  )
}
