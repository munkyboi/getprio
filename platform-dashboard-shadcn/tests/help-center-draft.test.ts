import { test } from "node:test"
import assert from "node:assert/strict"
import { removeHelpCenterDraftItem } from "../src/lib/help-center-draft.ts"

test("removing a guide removes it from the draft and clears FAQs linked to it", () => {
  const content = {
    topics: [{ id: "queues", title: "Queues", description: "Queue help" }],
    articles: [
      { id: "empty-guide", topic: "queues", title: "", intro: "", steps: [""], note: "", link: null, linkLabel: null, review: { owner: "Support", timeZone: "Asia/Manila", cadenceDays: 90, appliesTo: ["web" as const], lastReviewedAt: null, reviewDueAt: null, sourceReferences: [] } },
      { id: "join", topic: "queues", title: "Join", intro: "Help", steps: ["Open the page"], note: "", link: null, linkLabel: null, review: { owner: "Support", timeZone: "Asia/Manila", cadenceDays: 90, appliesTo: ["web" as const], lastReviewedAt: "2026-09-29", reviewDueAt: "2026-12-28", sourceReferences: ["frontend/src/pages/HelpPage.tsx"] } },
    ],
    faqs: [
      { id: "related", question: "Question", answer: "Answer", relatedArticleId: "empty-guide", review: { owner: "Support", timeZone: "Asia/Manila", cadenceDays: 90, appliesTo: ["web" as const], lastReviewedAt: "2026-09-29", reviewDueAt: "2026-12-28", sourceReferences: ["frontend/src/pages/HelpPage.tsx"] } },
      { id: "other", question: "Other", answer: "Answer", relatedArticleId: "join", review: { owner: "Support", timeZone: "Asia/Manila", cadenceDays: 90, appliesTo: ["web" as const], lastReviewedAt: "2026-09-29", reviewDueAt: "2026-12-28", sourceReferences: ["frontend/src/pages/HelpPage.tsx"] } },
    ],
  }

  const next = removeHelpCenterDraftItem(content, { kind: "guide", id: "empty-guide" })

  assert.deepEqual(next.articles.map((item) => item.id), ["join"])
  assert.equal(next.faqs[0].relatedArticleId, null)
  assert.equal(next.faqs[1].relatedArticleId, "join")
  assert.equal(content.articles.length, 2, "removing from the editable draft must not mutate the original revision")
})
