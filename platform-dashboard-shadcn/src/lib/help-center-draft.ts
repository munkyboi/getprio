import type { PlatformHelpCenterContent } from "./platform-contracts"

export type HelpCenterDraftSelection = { kind: "topic" | "guide" | "faq"; id: string }

export function removeHelpCenterDraftItem(content: PlatformHelpCenterContent, selection: HelpCenterDraftSelection): PlatformHelpCenterContent {
  if (selection.kind === "guide") {
    return {
      ...content,
      articles: content.articles.filter((item) => item.id !== selection.id),
      faqs: content.faqs.map((faq) => faq.relatedArticleId === selection.id ? { ...faq, relatedArticleId: null } : faq),
    }
  }

  if (selection.kind === "faq") {
    return { ...content, faqs: content.faqs.filter((item) => item.id !== selection.id) }
  }

  if (content.articles.some((article) => article.topic === selection.id)) {
    throw new Error("Move or remove the topic’s guides before removing this topic from the draft.")
  }
  return { ...content, topics: content.topics.filter((item) => item.id !== selection.id) }
}
