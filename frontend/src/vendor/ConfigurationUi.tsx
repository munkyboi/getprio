import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type ChangeEvent,
} from "react";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldSet,
  FieldLegend,
  FieldGroup,
} from "./components/ui/field";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "./components/ui/combobox";
import { OperationScope, OperationButton } from "./OperationsUi";
import {
  formatPhilippineMobileNumber,
  normalizePhilippineMobileNumber,
} from "../utils/phones";
const Busy = createContext(false);
const Draft = createContext<((form: HTMLFormElement) => void) | undefined>(
  undefined,
);
export function ConfigurationScope({
  busy = false,
  children,
  onEdit,
}: {
  busy?: boolean;
  children: ReactNode;
  onEdit?: (form: HTMLFormElement) => void;
}) {
  const inheritedEdit = useContext(Draft),
    inheritedBusy = useContext(Busy);
  return (
    <Draft.Provider value={onEdit || inheritedEdit}>
      <Busy.Provider value={busy || inheritedBusy}>
        <OperationScope busy={busy || inheritedBusy}>{children}</OperationScope>
      </Busy.Provider>
    </Draft.Provider>
  );
}
type Guidance = {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
};
export const ConfigurationInput = forwardRef<
  HTMLInputElement,
  ComponentProps<typeof Input> & Guidance
>(function ConfigurationInput({ label, description, error, ...props }, ref) {
  const id = useId(),
    busy = useContext(Busy);
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        ref={ref}
        {...props}
        disabled={props.disabled || busy}
        aria-invalid={Boolean(error)}
        aria-describedby={description || error ? `${id}-help` : undefined}
      />
      {description || error ? (
        <div id={`${id}-help`}>
          {error ? (
            <FieldError>{error}</FieldError>
          ) : (
            <FieldDescription>{description}</FieldDescription>
          )}
        </div>
      ) : null}
    </Field>
  );
});
export function ConfigurationNumber({
  value,
  onChange,
  step = 1,
  ...props
}: Omit<
  ComponentProps<typeof ConfigurationInput>,
  "type" | "value" | "onChange"
> & {
  value: number | string;
  onChange: (value: number | "") => void;
}) {
  return (
    <ConfigurationInput
      {...props}
      type="number"
      step={step}
      value={value}
      onChange={(event) =>
        onChange(
          event.currentTarget.value === ""
            ? ""
            : Number(event.currentTarget.value),
        )
      }
    />
  );
}
export function ConfigurationTextarea({
  label,
  description,
  error,
  ...props
}: ComponentProps<typeof Textarea> & Guidance) {
  const id = useId(),
    busy = useContext(Busy);
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        rows={4}
        {...props}
        disabled={props.disabled || busy}
        aria-invalid={Boolean(error)}
        aria-describedby={description || error ? `${id}-help` : undefined}
      />
      {description || error ? (
        <div id={`${id}-help`}>
          {error ? (
            <FieldError>{error}</FieldError>
          ) : (
            <FieldDescription>{description}</FieldDescription>
          )}
        </div>
      ) : null}
    </Field>
  );
}

export function ConfigurationPhone({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof ConfigurationInput>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ConfigurationInput
      {...props}
      value={formatPhilippineMobileNumber(value)}
      inputMode="numeric"
      placeholder="(0917) 123-4567"
      onChange={(event) =>
        onChange(normalizePhilippineMobileNumber(event.currentTarget.value))
      }
    />
  );
}
export function ConfigurationCheck({
  label,
  description,
  disabled,
  ...props
}: Omit<ComponentProps<"input">, "type"> & Guidance) {
  const id = useId(),
    busy = useContext(Busy);
  return (
    <Field className="config-check">
      <label htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          {...props}
          disabled={disabled || busy}
          aria-describedby={
            [props["aria-describedby"], description ? `${id}-help` : undefined]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        <span>{label}</span>
      </label>
      {description ? (
        <FieldDescription id={`${id}-help`}>{description}</FieldDescription>
      ) : null}
    </Field>
  );
}
export function ConfigurationSelect({
  label,
  description,
  error,
  data,
  value,
  onChange,
  disabled,
  required,
  name,
  placeholder,
}: Guidance & {
  data: ReadonlyArray<
    string | { value: string; label: string; disabled?: boolean }
  >;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  placeholder?: string;
}) {
  const id = useId(),
    busy = useContext(Busy),
    mark = useContext(Draft),
    root = useRef<HTMLDivElement>(null);
  const options = useMemo(
    () =>
      data.map((item) =>
        typeof item === "string" ? { value: item, label: item } : item,
      ),
    [data],
  );
  const items = useMemo(() => options.map((item) => item.value), [options]);
  return (
    <div ref={root} data-vendor-draft-ignore>
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Combobox
          items={items}
          value={value || null}
          itemToStringLabel={(item) =>
            options.find((option) => option.value === item)?.label || item
          }
          name={name}
          required={required}
          disabled={disabled || busy}
          onValueChange={(next, details) => {
            if (details.reason === "escape-key") {
              details.cancel();
              details.allowPropagation();
              return;
            }
            onChange(next);
            // Custom selections do not bubble a native change: notify the workspace draft tracker.
            const form = root.current?.closest("form");
            if (form && next !== value) mark?.(form);
          }}
        >
          <ComboboxInput
            id={id}
            placeholder={placeholder || "Search and select"}
            aria-invalid={Boolean(error)}
            aria-describedby={description || error ? `${id}-help` : undefined}
          />
          <ComboboxContent>
            <ComboboxEmpty>No matching options.</ComboboxEmpty>
            <ComboboxList>
              {(item: string) => (
                <ComboboxItem
                  key={item}
                  value={item}
                  disabled={
                    options.find((option) => option.value === item)?.disabled
                  }
                >
                  {options.find((option) => option.value === item)?.label ||
                    item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        {description || error ? (
          <div id={`${id}-help`}>
            {error ? (
              <FieldError>{error}</FieldError>
            ) : (
              <FieldDescription>{description}</FieldDescription>
            )}
          </div>
        ) : null}
      </Field>
    </div>
  );
}
export function ConfigurationFile({
  label,
  description,
  accept,
  disabled,
  onChange,
  value,
  placeholder,
}: {
  label: ReactNode;
  description?: ReactNode;
  accept?: string;
  disabled?: boolean;
  onChange: (file: File | null) => void;
  value?: File | null;
  placeholder?: string;
}) {
  const id = useId(),
    busy = useContext(Busy),
    mark = useContext(Draft),
    root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(false);
  return (
    <div ref={root}>
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Input
          id={id}
          type="file"
          accept={accept}
          disabled={disabled || busy}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.currentTarget.files?.[0] || null;
            setSelected(Boolean(file));
            onChange(file);
          }}
        />
        <FieldDescription>
          {value?.name || placeholder || description}
        </FieldDescription>
        {selected || value ? (
          <OperationButton
            variant="outline"
            disabled={disabled || busy}
            onClick={() => {
              const input = root.current?.querySelector("input");
              if (input) input.value = "";
              setSelected(false);
              const form = root.current?.closest("form");
              if (form) mark?.(form);
              onChange(null);
            }}
          >
            Clear selected file
          </OperationButton>
        ) : null}
      </Field>
    </div>
  );
}
export function ConfigurationSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <FieldSet className="config-section">
      <FieldLegend>{title}</FieldLegend>
      <FieldDescription>{description}</FieldDescription>
      <FieldGroup>{children}</FieldGroup>
    </FieldSet>
  );
}
