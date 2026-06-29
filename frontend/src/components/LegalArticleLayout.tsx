import type { ReactNode } from "react";
import { Anchor, Divider, Group, Paper, Stack, Text } from "@mantine/core";
import { IconArrowUp } from "@tabler/icons-react";

export type LegalTocItem = {
  id: string;
  label: string;
};

type LegalArticleLayoutProps = {
  children: ReactNode;
  lastUpdated: string;
  title: string;
  toc: LegalTocItem[];
};

export default function LegalArticleLayout({ children, lastUpdated, title, toc }: LegalArticleLayoutProps) {
  return (
    <div className="legal-layout">
      <div className="legal-page-header" id="top">
        <Text className="finazze-section-label">Legal</Text>
        <h1 className="legal-page-title">{title}</h1>
        <Text c="dimmed" mt="xs">
          Last updated: {lastUpdated}
        </Text>
      </div>

      <div className="legal-layout-body">
        <div className="legal-layout-main">{children}</div>

        <aside className="legal-layout-sidebar" aria-label="Table of contents">
          <Paper className="legal-toc-card" p="lg" radius="xl" withBorder={false}>
            <Stack gap="md">
              <Text className="legal-toc-title">Table of contents</Text>
              <Stack gap={8}>
                {toc.map((item, index) => (
                  <Anchor className="legal-toc-link" href={`#${item.id}`} key={item.id}>
                    <Group className="legal-toc-row" gap="sm" wrap="nowrap">
                      <span className="legal-toc-index">{index + 1}.</span>
                      <span>{item.label}</span>
                    </Group>
                  </Anchor>
                ))}
              </Stack>
              <Divider color="rgba(36, 30, 25, 0.12)" />
              <Anchor className="legal-back-to-top" href="#top">
                <Group className="legal-back-to-top-row" gap={8} wrap="nowrap">
                  <span>Back to top</span>
                  <IconArrowUp size={14} stroke={2} />
                </Group>
              </Anchor>
            </Stack>
          </Paper>
        </aside>
      </div>
    </div>
  );
}
