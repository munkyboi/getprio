import { IconBuildingStore, IconCalendar, IconClock, IconCreditCard, IconMessageCircle, IconShieldLock } from "@tabler/icons-react"

const iconByTopic = {
  queues: IconClock,
  bookings: IconCalendar,
  payments: IconCreditCard,
  account: IconShieldLock,
  vendors: IconBuildingStore,
  campaigns: IconCreditCard,
  support: IconMessageCircle,
}

export type HelpTopic = { id: string; title: string; description: string }
export type HelpArticle = {
  id: string
  topic: string
  title: string
  intro: string
  steps: string[]
  note: string
  link?: string | null
  linkLabel?: string | null
}
export type HelpFaq = { id: string; question: string; answer: string; relatedArticleId?: string | null }
export type PublicHelpCenterContent = { topics: HelpTopic[]; articles: HelpArticle[]; faqs: HelpFaq[] }

export const emptyHelpContent: PublicHelpCenterContent = { topics: [], articles: [], faqs: [] }

export function helpTopicIcon(id: string) {
  return iconByTopic[id as keyof typeof iconByTopic] || IconMessageCircle
}

export function searchHelpArticles(query: string, topic = "", articles: HelpArticle[] = [], topics: HelpTopic[] = []) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  return articles.filter((article) => {
    const topicName = topics.find((item) => item.id === article.topic)?.title || ""
    const text = [article.title, article.intro, ...article.steps, article.note, topicName].join(" ").toLocaleLowerCase()
    return (!topic || article.topic === topic) && words.every((word) => text.includes(word))
  })
}
