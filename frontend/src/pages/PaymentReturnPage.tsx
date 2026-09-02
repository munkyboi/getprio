import { Button, Container, Loader, Stack, Text, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../api/client";
import { buildJoinPath, buildJoinedQueuePath } from "../queuePaths";

type PaymentReturnContext = {
  tenantSlug: string;
  locationSlug?: string | null;
};

function isSafeSlug(value: string | null): value is string {
  return Boolean(value && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value));
}

export default function PaymentReturnPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");
  const paymentId = searchParams.get("payment") || "";
  const paymentStatus = searchParams.get("payment_status") || "success";
  const queryTenantSlug = searchParams.get("tenantSlug");
  const queryLocationSlug = searchParams.get("locationSlug");

  useEffect(() => {
    let active = true;

    const redirectToQueue = ({ tenantSlug, locationSlug }: PaymentReturnContext) => {
      const candidateLocationSlug = locationSlug || null;
      const safeLocationSlug = isSafeSlug(candidateLocationSlug)
        ? candidateLocationSlug
        : undefined;
      const path = paymentStatus === "cancelled"
        ? buildJoinPath(tenantSlug, safeLocationSlug)
        : buildJoinedQueuePath(tenantSlug, safeLocationSlug);
      const params = new URLSearchParams({
        payment: paymentId,
        payment_status: paymentStatus
      });
      navigate(`${path}?${params.toString()}`, { replace: true });
    };

    if (!/^\d+$/.test(paymentId)) {
      setError("This payment return link is incomplete.");
      return () => {
        active = false;
      };
    }

    if (isSafeSlug(queryTenantSlug)) {
      redirectToQueue({
        tenantSlug: queryTenantSlug,
        locationSlug: queryLocationSlug
      });
      return () => {
        active = false;
      };
    }

    apiRequest<PaymentReturnContext>(`/public/payment-returns/${encodeURIComponent(paymentId)}`)
      .then((context) => {
        if (active && isSafeSlug(context.tenantSlug)) {
          redirectToQueue(context);
        } else if (active) {
          setError("We could not resolve this payment. Please start the queue payment again.");
        }
      })
      .catch(() => {
        if (active) {
          setError("We could not find this payment. Please start the queue payment again.");
        }
      });

    return () => {
      active = false;
    };
  }, [navigate, paymentId, paymentStatus, queryLocationSlug, queryTenantSlug]);

  return (
    <Container size="sm" py="xl">
      <Stack align="center" gap="md" ta="center">
        {error ? (
          <>
            <Title order={2}>Payment return unavailable</Title>
            <Text c="dimmed">{error}</Text>
            <Button component="a" href="/" color="orange">
              Back to home
            </Button>
          </>
        ) : (
          <>
            <Loader color="orange" />
            <Text>Returning to your queue…</Text>
          </>
        )}
      </Stack>
    </Container>
  );
}
