import { ActionIcon, Group, Tooltip } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";

type SignupFieldLabelProps = {
  label: string;
  required?: boolean;
  tooltip: string;
};

export default function SignupFieldLabel({ label, required = false, tooltip }: SignupFieldLabelProps) {
  return (
    <Group align="center" gap={4} wrap="nowrap">
      <span>
        {label}
        {required ? <span aria-hidden="true" className="signup-label-required"> *</span> : null}
      </span>
      <Tooltip label={tooltip} multiline w={240} withArrow>
        <ActionIcon aria-label={`${label} information`} color="gray" size="xs" variant="transparent">
          <IconInfoCircle size={14} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
