import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, Button, Group, Paper, Select, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { IconMessageDots, IconShieldCheck } from "@tabler/icons-react";

export type ContactFormScope = "platform" | "vendor";

type ContactFormProps = {
  scope: ContactFormScope;
  recipientName: string;
  title?: string;
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

export default function ContactForm({ scope, recipientName, title, intro }: ContactFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
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

  const onSubmit = handleSubmit(async () => {
    setSubmitted(true);
  });

  return (
    <Paper className="contact-form-card" p="xl" radius="xl" withBorder={false}>
      <Stack gap="lg">
        <div>
          <Text className="contact-form-eyebrow">{scope === "platform" ? "GetPrio support" : recipientName}</Text>
          <Text className="contact-form-title">{title || "Send a message"}</Text>
          <Text c="dimmed" lh={1.75} mt="sm">
            {intro ||
              (scope === "platform"
                ? "Use this form for support requests, escalations, and account help. We will reply by email with a reference number."
                : "Use this form to contact the vendor about a public service or booking question. The vendor will reply directly by email.")}
          </Text>
        </div>

        <Alert color="teal" icon={<IconShieldCheck size={18} />} variant="light">
          Protected with Turnstile-style anti-abuse checks, rate limiting, and hidden honeypot fields.
        </Alert>

        <Stack component="form" gap="md" onSubmit={onSubmit}>
          <Group grow align="flex-start">
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
          </Group>
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
            minRows={6}
            label="Message"
            placeholder="Tell us what happened, including dates, booking reference numbers, or other helpful details."
            error={errors.message?.message}
            {...register("message")}
          />
          <TextInput className="contact-form-honeypot" tabIndex={-1} aria-hidden="true" {...register("honeypot")} />
          <Group justify="space-between" align="center" wrap="wrap">
            <Text c="dimmed" size="sm">
              {scope === "platform"
                ? "Platform support will assign a reference number after submission."
                : `Your message goes to ${recipientName} and is not sent to GetPrio support automatically.`}
            </Text>
            <Button leftSection={<IconMessageDots size={16} />} loading={isSubmitting} type="submit" color="dark">
              Send message
            </Button>
          </Group>
        </Stack>

        {submitted ? (
          <Alert color="orange" variant="light">
            This is a capstone draft form. Wire it to your support intake backend before using it in production.
          </Alert>
        ) : null}
      </Stack>
    </Paper>
  );
}
