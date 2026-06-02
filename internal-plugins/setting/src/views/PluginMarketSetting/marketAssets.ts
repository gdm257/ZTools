import developmentIcon from '../../assets/market/development.png'
import gameIcon from '../../assets/market/game.png'
import mediaIcon from '../../assets/market/media.png'
import networkIcon from '../../assets/market/network.png'
import otherIcon from '../../assets/market/other.png'
import productivityIcon from '../../assets/market/productivity.png'
import systemIcon from '../../assets/market/system.png'
import textIcon from '../../assets/market/text.png'
import bannerImage from '../../assets/market/ztools-banner.png'

export const marketBannerImage = bannerImage

const marketCategoryIcons: Record<string, string> = {
  productivity: productivityIcon,
  development: developmentIcon,
  media: mediaIcon,
  text: textIcon,
  game: gameIcon,
  network: networkIcon,
  system: systemIcon,
  other: otherIcon
}

export function getMarketCategoryIcon(key: string): string {
  return marketCategoryIcons[key] ?? otherIcon
}
