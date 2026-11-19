import { useRef, useState, type ComponentProps } from "react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@vendor/components/ui/input-group";

export default function PasswordField(props: ComponentProps<typeof InputGroupInput>) {
  const [visible, setVisible] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function toggle() {
    const element = input.current;
    const start = element?.selectionStart, end = element?.selectionEnd;
    setVisible(value => !value);
    requestAnimationFrame(() => { element?.focus({ preventScroll: true }); if (start != null && end != null) element?.setSelectionRange(start, end); });
  }
  return <InputGroup><InputGroupInput {...props} ref={input} type={visible ? "text" : "password"} /><InputGroupAddon align="inline-end"><InputGroupButton type="button" size="icon-sm" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onMouseDown={event => event.preventDefault()} onClick={toggle}>{visible ? <IconEyeOff aria-hidden="true" /> : <IconEye aria-hidden="true" />}</InputGroupButton></InputGroupAddon></InputGroup>;
}
