import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, Box, Button, FileInput, Group, ScrollArea, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconMessageDots, IconPaperclip, IconShieldCheck } from "@tabler/icons-react";
import { useAuth } from "../context/AuthContext";

export type ContactFormScope = "platform" | "vendor";

type ContactFormProps = {
  scope: ContactFormScope;
  recipientName: string;
  intro?: string;
};

const reasonOptions = [
  "Question about a booking",
  "Refund or cancellation concern",
  "Payment evidence issue",
  "Report a problem or bug",
  "Safety or policy concern",
  "Account or access help",
  "Dispute or complaint",
  "Other support request"
] as const;

const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter your name."),
  email: z.string().trim().email("Enter a valid email address."),
  reason: z.enum(reasonOptions, {
    message: "Choose a support topic."
  }),
  subject: z.string().trim().min(3, "Enter a subject."),
  message: z.string().trim().min(10, "Enter a longer message."),
  honeypot: z.string().trim().max(0, "Leave this field blank.")
});

type ContactFormValues = z.infer<typeof contactSchema>;

export default function ContactForm({ scope, recipientName, intro }: ContactFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const { user } = useAuth();
  const isMobile = useMediaQuery("(max-width: 48em)");
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { dirtyFields, errors, isSubmitting }
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      reason: reasonOptions[0],
      subject: "",
      message: "",
      honeypot: ""
    }
  });

  useEffect(() => {
    if (!user) {
      return;
    }

    if (!dirtyFields.name) {
      setValue("name", user.displayName || user.name, { shouldDirty: false });
    }
    if (!dirtyFields.email && user.email) {
      setValue("email", user.email, { shouldDirty: false });
    }
  }, [dirtyFields.email, dirtyFields.name, setValue, user]);

  const onSubmit = handleSubmit(async () => {
    setSubmitted(true);
  });

  return (
    <Stack className="contact-form-shell" gap="lg">
      <Text c="dimmed" lh={1.75}>
        {intro ||
          (scope === "platform"
            ? "Use this form for support requests, escalations, and account help. We will reply by email with a reference number."
            : "Use this form to contact the vendor about a public service or booking question. The vendor will reply directly by email.")}
      </Text>

      <Box component="form" className="contact-form-body" onSubmit={onSubmit}>
        <ScrollArea
          className="contact-form-main"
          scrollbarSize={8}
          styles={{
            root: { flex: 1, minHeight: 0 },
            viewport: { height: "100%" }
          }}
          type="hover"
        >
          <Stack gap="lg">
            <SimpleGrid cols={isMobile ? 1 : 2}>
              <TextInput
                label="Your name"
                placeholder="Maria Santos"
                error={errors.name?.message}
                {...register("name")}
              />
              <TextInput
                label="Email address"
                placeholder="maria@example.com"
                error={errors.email?.message}
                {...register("email")}
              />
            </SimpleGrid>
            <Controller
              control={control}
              name="reason"
              render={({ field }) => (
                <Select
                  label="What can we help you with?"
                  data={reasonOptions.map((reason) => ({ label: reason, value: reason }))}
                  error={errors.reason?.message}
                  placeholder="Choose a topic"
                  {...field}
                />
              )}
            />
            <TextInput
              label="Subject"
              placeholder={scope === "platform" ? "Help with a booking refund" : "Question about this vendor"}
              error={errors.subject?.message}
              {...register("subject")}
            />
            <Textarea
              autosize
              minRows={isMobile ? 5 : 6}
              label="Message"
              placeholder="Tell us what happened, including dates, booking reference numbers, or other helpful details."
              error={errors.message?.message}
              {...register("message")}
            />
            <FileInput
              accept="image/jpeg,image/png,image/webp"
              clearable
              description="Optional: attach a JPEG, PNG, or WebP image to help explain your message."
              label="Attachment"
              leftSection={<IconPaperclip size={16} />}
              onChange={setAttachment}
              placeholder="Choose an image"
              value={attachment}
            />
            <TextInput className="contact-form-honeypot" tabIndex={-1} aria-hidden="true" {...register("honeypot")} />

            {submitted ? (
              <Alert color="orange" variant="light">
                This is a capstone draft form. Wire it to your support intake backend before using it in production.
              </Alert>
            ) : null}
            <Alert color="teal" icon={<IconShieldCheck size={18} />} variant="light">
              Protected with Turnstile-style anti-abuse checks, rate limiting, and hidden honeypot fields.
            </Alert>
          </Stack>
        </ScrollArea>

        <Group justify="space-between" align="center" wrap="wrap" className="contact-form-footer">
          <Text c="dimmed" size="sm" className="contact-form-footer-copy">
            {scope === "platform"
              ? "Platform support will assign a reference number after submission."
              : `Your message goes to ${recipientName} and is not sent to GetPrio support automatically.`}
          </Text>
          <Button
            className="contact-form-submit-action"
            color="dark"
            leftSection={<IconMessageDots size={18} />}
            loading={isSubmitting}
            size="lg"
            type="submit"
          >
            Send message
          </Button>
        </Group>
      </Box>
    </Stack>
  );
}
