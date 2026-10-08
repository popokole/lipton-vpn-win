import NewsPanel from '../components/NewsPanel'

// Новости: пока прежняя лента (news:get) внутри новой страницы.
//
// TODO(redesign): анонсы /announcements, полоса статуса серверов и счётчик
// непрочитанных в боковом меню — пакет D4 (макет new-pc-news).
export default function NewsPage({ onClose }) {
  return (
    <>
      <div className="page-head">
        <h1 className="ui-h1">Новости</h1>
        <span className="ui-h1-sub">Обновления и анонсы Lipton VPN</span>
      </div>
      <div className="legacy-inline legacy-news ui-rise" style={{ '--i': 1 }}>
        <NewsPanel onClose={onClose} />
      </div>
    </>
  )
}
