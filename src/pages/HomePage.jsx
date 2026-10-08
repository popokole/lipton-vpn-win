import Hero from '../components/Hero'
import BannerSlot from '../components/BannerSlot'
import Bento from '../components/Bento'

// Главная (макеты new-pc-home-on / new-pc-home-off): слот баннера сверху
// (баннеры из админки — следующая волна), слева карточка состояния, справа бенто.
export default function HomePage({ hero, bento, banners }) {
  return (
    <>
      <BannerSlot banners={banners} />
      <div className="home-grid">
        <Hero {...hero} />
        <Bento {...bento} />
      </div>
    </>
  )
}
