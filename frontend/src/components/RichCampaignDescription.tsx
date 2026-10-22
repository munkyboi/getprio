import DOMPurify from "dompurify";
import { useMemo } from "react";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toRenderableHtml(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return "";
  }

  if (/<\/?[a-z][\s\S]*>/i.test(trimmedValue)) {
    return trimmedValue;
  }

  return trimmedValue
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

type RichCampaignDescriptionProps = {
  className?: string;
  content: string;
};

export default function RichCampaignDescription({ className, content }: RichCampaignDescriptionProps) {
  const safeHtml = useMemo(
    () => DOMPurify.sanitize(toRenderableHtml(content), {
      ALLOWED_ATTR: [],
      ALLOWED_TAGS: ["p", "br", "strong", "em", "s", "ul", "ol", "li", "blockquote"]
    }),
    [content]
  );

  return <div className={className} dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}
