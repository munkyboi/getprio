import { RichTextEditor } from "@mantine/tiptap";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo } from "react";
import { Stack, Text } from "@mantine/core";

const MAX_CAMPAIGN_DESCRIPTION_CHARACTERS = 1000;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
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
  onChange: (value: string) => void;
  value: string;
};

export default function CampaignDescriptionEditor({ disabled = false, onChange, value }: CampaignDescriptionEditorProps) {
  const editor = useEditor({
    content: toEditorHtml(value),
    editable: !disabled,
    extensions: [StarterKit],
    onUpdate: ({ editor: updatedEditor }) => {
      const nextValue = updatedEditor.getHTML();
      if (getPlainText(nextValue).length > MAX_CAMPAIGN_DESCRIPTION_CHARACTERS) {
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
    <Stack gap={4}>
      <RichTextEditor className="campaign-description-editor" editor={editor} variant="subtle">
        <RichTextEditor.Toolbar>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Bold />
            <RichTextEditor.Italic />
            <RichTextEditor.Strikethrough />
            <RichTextEditor.ClearFormatting />
          </RichTextEditor.ControlsGroup>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.BulletList />
            <RichTextEditor.OrderedList />
            <RichTextEditor.Blockquote />
          </RichTextEditor.ControlsGroup>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Undo />
            <RichTextEditor.Redo />
          </RichTextEditor.ControlsGroup>
        </RichTextEditor.Toolbar>
        <RichTextEditor.Content />
      </RichTextEditor>
      <Text c="dimmed" size="xs" ta="right">
        {characterCount} / {MAX_CAMPAIGN_DESCRIPTION_CHARACTERS}
      </Text>
    </Stack>
  );
}
