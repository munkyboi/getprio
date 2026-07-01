import { Container, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import ContactForm from "../components/ContactForm";

export default function ContactPage() {
  return (
    <Container className="policy-page contact-page" size="xl">
      <Stack gap="xl">
        <div className="contact-page-header">
          <Text className="finazze-section-label">Support</Text>
          <Title className="legal-page-title" order={1}>
            Contact GetPrio
          </Title>
          <Text c="dimmed" maw={760} lh={1.8} mt="xs">
            Use this page for platform support, billing questions, disputes, refund escalations,
            payment evidence issues, fraud reports, access problems, policy questions, safety
            concerns, and broken workflows.
          </Text>
        </div>

        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
          <ContactForm
            scope="platform"
            recipientName="GetPrio Support"
            title="Platform support"
            intro="Reach the GetPrio team for account help, dispute review, refund escalations, policy interpretation, and technical issues."
          />

          <Stack gap="lg">
            <ContactForm
              scope="vendor"
              recipientName="Vendor contact"
              title="Contact a vendor"
              intro="Use the vendor button on a public profile when you need help with a specific business, service, or booking question."
            />

            <div className="contact-policy-note">
              <Text fw={900}>Vendor contact routing</Text>
              <Text c="dimmed" lh={1.75} mt={6}>
                Vendor messages go directly to the vendor team. GetPrio support does not receive
                those messages automatically. This keeps product support and vendor support
                separate.
              </Text>
            </div>
          </Stack>
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
