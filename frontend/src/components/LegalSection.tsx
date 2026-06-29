import type { ReactNode } from "react";
import { Stack, Title } from "@mantine/core";

type LegalSectionProps = {
  id: string;
  title: string;
  children: ReactNode;
};

export default function LegalSection({ id, title, children }: LegalSectionProps) {
  return (
    <Stack gap="sm" id={id} className="legal-section">
      <Title order={2}>{title}</Title>
      {children}
    </Stack>
  );
}
