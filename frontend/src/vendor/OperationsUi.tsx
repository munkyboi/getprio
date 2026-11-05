import { orderedDateRange, boundedPage } from "./operationsState";
import {
  createContext,
  useContext,
  useId,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Button } from "./components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./components/ui/card";
import { Field, FieldLabel } from "./components/ui/field";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Checkbox } from "./components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "./components/ui/select";
import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert";
import { QueueEmptyState } from "./LiveQueueWidgets";

const OperationBusyContext = createContext(false);
export function OperationScope({
  busy = false,
  children,
}: {
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <OperationBusyContext.Provider value={busy}>
      <section className="vendor-operations">{children}</section>
    </OperationBusyContext.Provider>
  );
}

export function OperationPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="ops-panel-content">{children}</CardContent>
    </Card>
  );
}
export function OperationMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="ops-metric-value">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="ops-muted">{detail}</p>
      </CardContent>
    </Card>
  );
}
export function OperationInput({
  label,
  ...props
}: ComponentProps<typeof Input> & { label: string }) {
  const id = useId();
  const busy=useContext(OperationBusyContext);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} {...props} disabled={props.disabled || busy} />
    </Field>
  );
}
export function OperationTextarea({
  label,
  ...props
}: ComponentProps<typeof Textarea> & { label: string }) {
  const id = useId();
  const busy=useContext(OperationBusyContext);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea id={id} rows={3} {...props} disabled={props.disabled || busy} />
    </Field>
  );
}
export function OperationSelect({
  label,
  data,
  value,
  onChange,
  icon,
  disabled = false,
  placeholder,
  required = false,
}: {
  label: string;
  data: Array<{ value: string; label: string; disabled?: boolean }>;
  value: string | null;
  onChange: (value: string | null) => void;
  icon?: ReactNode;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
}) {
  const id = useId();
  const busy=useContext(OperationBusyContext);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={data}
        value={value || null}
        onValueChange={onChange}
        disabled={disabled || busy}
        required={required}
      >
        <SelectTrigger id={id}>
          {icon}
          <SelectValue
            placeholder={placeholder || `Select ${label.toLowerCase()}`}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {data.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                disabled={item.disabled}
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
export function OperationCheckbox({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  const busy=useContext(OperationBusyContext);
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} checked={checked} disabled={busy} onCheckedChange={onCheckedChange} />
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
    </Field>
  );
}
export function OperationDateRange({
  value,
  onChange,
}: {
  value: [Date | null, Date | null];
  onChange: (value: [Date | null, Date | null]) => void;
}) {
  function format(date: Date | null) {
    return date
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      : "";
  }
  return (
    <div className="ops-date-range">
      <OperationInput
        type="date"
        label="From date"
        value={format(value[0])}
        onChange={(event) =>
          onChange(orderedDateRange(
            event.target.value
              ? new Date(`${event.target.value}T00:00:00`)
              : null,
            value[1],
          ))
        }
      />
      <OperationInput
        type="date"
        label="To date"
        min={format(value[0]) || undefined}
        value={format(value[1])}
        onChange={(event) =>
          onChange(orderedDateRange(
            value[0],
            event.target.value
              ? new Date(`${event.target.value}T00:00:00`)
              : null,
          ))
        }
      />
    </div>
  );
}
export function OperationDate({
  value,
  onChange,
  label,
  required,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
  required?: boolean;
}) {
  return (
    <OperationInput
      type="date"
      label={label}
      required={required}
      value={value || ""}
      onChange={(event) => onChange(event.target.value || null)}
    />
  );
}
export function OperationButton({
  loading = false,
  leftSection,
  children,
  ...props
}: ComponentProps<typeof Button> & {
  loading?: boolean;
  leftSection?: ReactNode;
}) {
  const busy = useContext(OperationBusyContext);
  return (
    <Button
      {...props}
      disabled={props.disabled || loading || busy}
      aria-busy={loading || undefined}
    >
      {leftSection}
      {loading ? "Working…" : children}
    </Button>
  );
}
export function OperationAction({
  label,
  color,
  loading,
  children,
  size: _size,
  ...props
}: Omit<ComponentProps<typeof Button>, "size" | "color"> & {
  label: string;
  color?: string;
  loading?: boolean;
  size?: number;
  children: ReactNode;
}) {
  return (
    <OperationButton
      {...props}
      loading={loading}
      variant={color === "red" ? "destructive" : "outline"}
      aria-label={label}
    >
      {children}
      <span>{label}</span>
    </OperationButton>
  );
}
export function OperationAlert({
  children,
  title,
  color,
}: {
  children: ReactNode;
  title?: string;
  color?: string;
}) {
  return (
    <Alert variant={color === "red" ? "destructive" : "default"}>
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
export function OperationEmpty({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return <QueueEmptyState title={title} text={text} />;
}
export function OperationPagination({
  total,
  value,
  onChange,
  label = "Results pages",
  disabled = false,
}: {
  total: number;
  value: number;
  onChange: (page: number) => void;
  label?: string;
  disabled?: boolean;
}) {
  const last = Math.max(1, total);
  const current = boundedPage(value, last);
  const pages = [...new Set([1, current - 1, current, current + 1, last])]
    .filter((page) => page >= 1 && page <= last)
    .sort((a, b) => a - b);
  return (
    <nav aria-label={label} className="ops-pagination">
      <Button
        variant="outline"
        disabled={disabled || current <= 1}
        onClick={() => onChange(boundedPage(current - 1, last))}
      >
        Previous
      </Button>
      {pages.map((page, index) => (
        <span key={page} className="ops-page-number">
          {index > 0 && page > pages[index - 1] + 1 ? (
            <span aria-hidden="true">…</span>
          ) : null}
          <Button
            aria-label={`Page ${page}`}
            aria-current={page === current ? "page" : undefined}
            variant={page === current ? "default" : "outline"}
            disabled={disabled}
            onClick={() => onChange(page)}
          >
            {page}
          </Button>
        </span>
      ))}
      <Button
        variant="outline"
        disabled={disabled || current >= last}
        onClick={() => onChange(boundedPage(current + 1, last))}
      >
        Next
      </Button>
    </nav>
  );
}
export function OperationQueryState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load records</AlertTitle>
        <AlertDescription>
          <p>
            Your current view could not be refreshed. Retry before acting on
            stale records.
          </p>
          <Button variant="outline" onClick={onRetry}>
            Retry records
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (loading)
    return (
      <p role="status" className="ops-muted">
        Loading records…
      </p>
    );
  return null;
}
