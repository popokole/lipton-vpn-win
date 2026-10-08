import Hero from '../components/Hero'
import BannerSlot from '../components/BannerSlot'
import Bento from '../components/Bento'

// Главная (макеты new-pc-home-on / new-pc-home-off): сверху — полоса гостя
// («Создайте аккаунт») и баннеры из админки, слева карточка состояния, справа бенто.
export default function HomePage({ hero, bento, banners, top = null }) {
  return (
    <>
      {top}
      <BannerSlot banners={banners} />
      <div className="home-grid">
        <Hero {...hero} />
        <Bento {...bento} />
      </div>
    </>
  )
}
