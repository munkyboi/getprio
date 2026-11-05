import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { $getRoot, $setSelection, CLEAR_HISTORY_COMMAND, FORMAT_TEXT_COMMAND, REDO_COMMAND, UNDO_COMMAND, type LexicalCommand } from "lexical";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from "@lexical/list";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import type { EditorState, LexicalEditor } from "lexical";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Stack, Text } from "@mantine/core";
import { IconArrowBackUp, IconArrowForwardUp, IconBold, IconItalic, IconList, IconListNumbers, IconUnderline } from "@tabler/icons-react";

const DEFAULT_MAX_CHARACTERS = 1000;

function escapeHtml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function toEditorHtml(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return "<p></p>";
  if (/<\/?[a-z][\s\S]*>/i.test(trimmedValue)) return trimmedValue;
  return trimmedValue.split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
}
function getPlainText(value: string) {
  if (typeof window === "undefined") return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return new DOMParser().parseFromString(value, "text/html").body.textContent?.replace(/\s+/g, " ").trim() || "";
}
function ToolbarButton({ label, icon, onClick, disabled }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="campaign-description-toolbar-button" aria-label={label} title={label} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onClick}>{icon}</button>;
}
function EditorToolbar({ editor, disabled }: { editor: LexicalEditor; disabled: boolean }) {
  const command = <T,>(type: LexicalCommand<T>, payload: T) => editor.dispatchCommand(type, payload);
  return <div className="campaign-description-toolbar" role="toolbar" aria-label="Formatting options">
    <div className="campaign-description-toolbar-group"><ToolbarButton label="Bold" icon={<IconBold size={18} />} disabled={disabled} onClick={() => command(FORMAT_TEXT_COMMAND, "bold")} /><ToolbarButton label="Italic" icon={<IconItalic size={18} />} disabled={disabled} onClick={() => command(FORMAT_TEXT_COMMAND, "italic")} /><ToolbarButton label="Underline" icon={<IconUnderline size={18} />} disabled={disabled} onClick={() => command(FORMAT_TEXT_COMMAND, "underline")} /></div>
    <div className="campaign-description-toolbar-group"><ToolbarButton label="Bulleted list" icon={<IconList size={18} />} disabled={disabled} onClick={() => command(INSERT_UNORDERED_LIST_COMMAND, undefined)} /><ToolbarButton label="Numbered list" icon={<IconListNumbers size={18} />} disabled={disabled} onClick={() => command(INSERT_ORDERED_LIST_COMMAND, undefined)} /></div>
    <div className="campaign-description-toolbar-group"><ToolbarButton label="Undo" icon={<IconArrowBackUp size={18} />} disabled={disabled} onClick={() => command(UNDO_COMMAND, undefined)} /><ToolbarButton label="Redo" icon={<IconArrowForwardUp size={18} />} disabled={disabled} onClick={() => command(REDO_COMMAND, undefined)} /></div>
  </div>;
}

type CampaignDescriptionEditorProps = { disabled?: boolean; maxCharacters?: number; onChange: (value: string) => void; value: string; label?: string };
export default function CampaignDescriptionEditor({ disabled = false, maxCharacters = DEFAULT_MAX_CHARACTERS, onChange, value, label = "Description" }: CampaignDescriptionEditorProps) {
  const [initialConfig] = useState(() => ({ namespace: "CampaignDescriptionEditor", editable: !disabled, theme: { paragraph: "campaign-description-paragraph", quote: "campaign-description-quote", text: { bold: "campaign-description-bold", italic: "campaign-description-italic", underline: "campaign-description-underline" } }, nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode], editorState: (editor: LexicalEditor) => editor.update(() => { const dom = new DOMParser().parseFromString(toEditorHtml(value), "text/html"); $getRoot().clear().append(...$generateNodesFromDOM(editor, dom)); }), onError: (error: Error) => { throw error; } }));
  const characterCount = useMemo(() => getPlainText(value).length, [value]);
  return <Stack gap={4}><LexicalComposer initialConfig={{ ...initialConfig, editable: !disabled }}><DescriptionEditorInner value={value} disabled={disabled} label={label} maxCharacters={maxCharacters} onChange={onChange} /></LexicalComposer><Text c="dimmed" size="xs" ta="right">{characterCount} / {maxCharacters}</Text></Stack>;
}
function DescriptionEditorInner({ value, disabled = false, label = "Description", maxCharacters = DEFAULT_MAX_CHARACTERS, onChange }: CampaignDescriptionEditorProps) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => { editor.setEditable(!disabled); }, [disabled, editor]);
  return <div className="campaign-description-editor"><EditorToolbar editor={editor} disabled={disabled} /><RichTextPlugin contentEditable={<ContentEditable className="campaign-description-content" aria-label={label} />} placeholder={<div className="campaign-description-placeholder">Write a description…</div>} ErrorBoundary={({ children }) => <>{children}</>} /><HistoryPlugin /><ListPlugin /><DescriptionValueSync value={value} /><OnChangePlugin ignoreSelectionChange onChange={(editorState: EditorState, currentEditor: LexicalEditor, tags: Set<string>) => { if (tags.has(DESCRIPTION_EXTERNAL_VALUE_TAG)) return; const html = editorState.read(() => $generateHtmlFromNodes(currentEditor)); if (getPlainText(html).length <= maxCharacters) onChange(html); }} /></div>;
}

export const DESCRIPTION_EXTERNAL_VALUE_TAG = "description-external-value";

/** Parent echoes leave selection/history intact; genuine external values replace the document. */
export function DescriptionValueSync({ value }: { value: string }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const html = toEditorHtml(value);
    if (editor.getEditorState().read(() => $generateHtmlFromNodes(editor)) === html) return;
    editor.update(() => {
      const dom = new DOMParser().parseFromString(html, "text/html");
      $getRoot().clear().append(...$generateNodesFromDOM(editor, dom));
      $setSelection(null);
    }, {
      tag: DESCRIPTION_EXTERNAL_VALUE_TAG,
      discrete: true,
      // Undo must not restore a document loaded for a different business.
      onUpdate: () => { editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined); },
    });
  }, [editor, value]);
  return null;
}
