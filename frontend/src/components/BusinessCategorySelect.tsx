import SignupFieldLabel from "./SignupFieldLabel";
import { useEffect, useState } from "react";
import { Button, Select, Stack } from "@mantine/core";
import { apiRequest } from "../api/client";

type Category = { id: string; name: string };
export function BusinessCategorySelect({ value, currentLabel, onChange, disabled, error, required = false }: {
  value: string | null; currentLabel?: string; onChange: (id: string, name: string) => void; disabled?: boolean; error?: string; required?: boolean;
}) {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setLoadError("");
    apiRequest<{ items: Category[] }>("/public/business-categories", { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setItems(data.items); }).catch((failure) => { if (!controller.signal.aborted) setLoadError(failure instanceof Error ? failure.message : "Unable to load categories."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  const options = items.map((item) => ({ value: item.id, label: item.name, disabled: false }));
  if (value && !items.some((item) => item.id === value) && currentLabel) options.push({ value, label: `${currentLabel} (inactive)`, disabled: true });
  return <Stack gap="xs"><Select aria-label="Business category" label={required ? <SignupFieldLabel label="Business category" required tooltip="Choose from the categories maintained by GetPrio." /> : "Business category"} withAsterisk={false} required={required} searchable={false} allowDeselect={false}
    description="Choose from the categories maintained by GetPrio."
    placeholder={loading ? "Loading categories…" : "Choose a business category"}
    data={options} value={value} disabled={disabled || loading || !!loadError} error={loadError || error || (!loading && !items.length ? "No active categories are available. Contact GetPrio support." : undefined)}
    onChange={(id) => { const item = items.find((entry) => entry.id === id); if (item) onChange(item.id, item.name); }} />
    {loadError && <Button variant="subtle" onClick={() => setRetry((count) => count + 1)}>Retry categories</Button>}
  </Stack>;
}
