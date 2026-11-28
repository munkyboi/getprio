import { EditorContent, useEditor } from "@tiptap/react";
import type { ChainedCommands } from "@tiptap/core";
import { IconArrowBackUp, IconArrowForwardUp, IconBlockquote, IconBold, IconClearFormatting, IconItalic, IconList, IconListNumbers, IconStrikethrough } from "@tabler/icons-react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo } from "react";
import { Button } from "../vendor/components/ui/button";

const DEFAULT_MAX_CHARACTERS = 1000;

type FormattingAction = {
  label: string;
  icon: typeof IconBold;
  mark?: string;
  run: (commands: ChainedCommands) => ChainedCommands;
};

const formatting: readonly FormattingAction[] = [
  { label: "Bold", icon: IconBold, mark: "bold", run: chain => chain.toggleBold() },
  { label: "Italic", icon: IconItalic, mark: "italic", run: chain => chain.toggleItalic() },
  { label: "Strikethrough", icon: IconStrikethrough, mark: "strike", run: chain => chain.toggleStrike() },
  { label: "Clear formatting", icon: IconClearFormatting, run: chain => chain.unsetAllMarks().clearNodes() },
  { label: "Bullet list", icon: IconList, mark: "bulletList", run: chain => chain.toggleBulletList() },
  { label: "Numbered list", icon: IconListNumbers, mark: "orderedList", run: chain => chain.toggleOrderedList() },
  { label: "Block quote", icon: IconBlockquote, mark: "blockquote", run: chain => chain.toggleBlockquote() },
  { label: "Undo", icon: IconArrowBackUp, run: chain => chain.undo() },
  { label: "Redo", icon: IconArrowForwardUp, run: chain => chain.redo() },
];

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toEditorHtml(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return "";
  }

  if (/<\/?[a-z][\s\S]*>/i.test(trimmedValue)) {
    return trimmedValue;
  }

  return trimmedValue
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function getPlainText(value: string) {
  if (typeof window === "undefined") {
    return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  return new DOMParser().parseFromString(value, "text/html").body.textContent?.replace(/\s+/g, " ").trim() || "";
}

type CampaignDescriptionEditorProps = {
  disabled?: boolean;
  maxCharacters?: number;
  onChange: (value: string) => void;
  value: string;
};

export default function CampaignDescriptionEditor({ disabled = false, maxCharacters = DEFAULT_MAX_CHARACTERS, onChange, value }: CampaignDescriptionEditorProps) {
  const editor = useEditor({
    content: toEditorHtml(value),
    editable: !disabled,
    extensions: [StarterKit],
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Business description",
        "aria-multiline": "true",
        class: "v:min-h-28 v:px-3 v:py-2 v:outline-none v:[&_ol]:list-decimal v:[&_ul]:list-disc v:[&_ol]:ps-6 v:[&_ul]:ps-6",
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const nextValue = updatedEditor.getHTML();
      if (getPlainText(nextValue).length > maxCharacters) {
        updatedEditor.commands.undo();
        return;
      }
      onChange(nextValue);
    }
  });
  const characterCount = useMemo(() => getPlainText(value).length, [value]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const nextValue = toEditorHtml(value);
    if (editor.getHTML() !== nextValue) {
      editor.commands.setContent(nextValue, { emitUpdate: false });
    }
  }, [editor, value]);

  return (
    <div className="v:grid v:gap-1">
      <div className="campaign-description-editor v:rounded-lg v:border v:border-input v:bg-background v:focus-within:ring-2 v:focus-within:ring-ring">
        <div role="group" aria-label="Text formatting" className="v:flex v:flex-wrap v:gap-1 v:border-b v:border-border v:p-1">
          {formatting.map(({ label, icon: Icon, mark, run }) => (
            <Button
              key={label}
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={label}
              title={label}
              aria-pressed={mark ? editor?.isActive(mark) : undefined}
              disabled={disabled || !editor || !run(editor.can().chain()).run()}
              onMouseDown={event => event.preventDefault()}
              onClick={() => editor && run(editor.chain().focus()).run()}
            >
              <Icon size={16} aria-hidden />
            </Button>
          ))}
        </div>
        <EditorContent editor={editor} />
      </div>
      <p className="v:text-right v:text-xs v:text-muted-foreground">{characterCount} / {maxCharacters}</p>
    </div>
  );
}
