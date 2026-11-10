import { useMemo, useState } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { UIComponent } from "@/lib/ui/schema";
import { cn } from "@/lib/utils";

type DynamicFormProps = Extract<UIComponent, { type: "dynamic_form" }>["props"];

function buildDynamicZodSchema(fields: DynamicFormProps["fields"]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let fieldSchema: z.ZodTypeAny;
    if (f.type === "checkbox") {
      fieldSchema = z.boolean().default(Boolean(f.defaultValue));
    } else if (f.type === "multi_select") {
      let arr = z.array(z.string());
      if (f.required) arr = arr.min(1, `${f.label} requires at least one selection`);
      fieldSchema = arr;
    } else if (f.type === "number") {
      let num = z.coerce.number();
      if (f.min !== undefined) num = num.min(f.min);
      if (f.max !== undefined) num = num.max(f.max);
      fieldSchema = f.required ? num : num.optional();
    } else if (f.type === "email") {
      const s = z.string().email("Enter a valid email address");
      fieldSchema = f.required ? s : s.or(z.literal(""));
    } else if (f.type === "url") {
      const s = z.string().regex(/^https:\/\/.+/, "URL must start with https://");
      fieldSchema = f.required ? s : s.or(z.literal(""));
    } else {
      let s = z.string();
      if (f.required) s = s.trim().min(1, `${f.label} is required`);
      if (f.minLength !== undefined) s = s.min(f.minLength);
      if (f.maxLength !== undefined) s = s.max(f.maxLength);
      fieldSchema = s;
    }
    shape[f.name] = fieldSchema;
  }
  return z.object(shape);
}

export function DynamicFormBlock({
  props,
  onFormSubmit,
}: {
  props: DynamicFormProps;
  onFormSubmit?: (action: DynamicFormProps["action"], values: Record<string, unknown>) => void;
}) {
  const schema = useMemo(() => buildDynamicZodSchema(props.fields), [props.fields]);
  const defaultValues = useMemo(() => {
    const init: Record<string, unknown> = {};
    for (const f of props.fields) {
      if (f.defaultValue !== undefined) init[f.name] = f.defaultValue;
      else if (f.type === "checkbox") init[f.name] = false;
      else if (f.type === "multi_select") init[f.name] = [];
      else init[f.name] = "";
    }
    return init;
  }, [props.fields]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FieldValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const watched = watch();
  const maxStep = Math.max(1, ...props.fields.map((f) => f.step ?? 1));
  const [step, setStep] = useState(1);

  const visibleFields = props.fields.filter((f) => {
    if (props.multiStep && (f.step ?? 1) !== step) return false;
    if (!f.dependsOn) return true;
    const depVal = watched[f.dependsOn.field];
    if (f.dependsOn.operator === "non_empty") {
      return Array.isArray(depVal) ? depVal.length > 0 : Boolean(depVal);
    }
    if (f.dependsOn.operator === "equals") {
      return Array.isArray(depVal)
        ? depVal.includes(f.dependsOn.value)
        : depVal === f.dependsOn.value;
    }
    if (f.dependsOn.operator === "not_equals") {
      return Array.isArray(depVal)
        ? !depVal.includes(f.dependsOn.value)
        : depVal !== f.dependsOn.value;
    }
    return true;
  });

  const onSubmit = (data: FieldValues) => {
    if (onFormSubmit) {
      onFormSubmit(props.action, data);
    } else {
      toast.success(`Submitted "${props.title}" (${props.action})`);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{props.title}</CardTitle>
            {props.description && (
              <CardDescription className="text-xs">{props.description}</CardDescription>
            )}
          </div>
          <Badge variant="outline" className="text-[11px]">
            Action: {props.action}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {visibleFields.map((field) => {
              const errMsg = errors[field.name]?.message as string | undefined;
              const fieldId = `dyn_${props.title.slice(0, 8)}_${field.name}`;
              const val = watched[field.name];

              return (
                <div
                  key={field.name}
                  className={cn(
                    "space-y-1.5",
                    (field.type === "multi_select" || field.type === "textarea") && "sm:col-span-2",
                  )}
                >
                  {field.type !== "checkbox" && (
                    <Label htmlFor={fieldId} className="text-xs font-medium">
                      {field.label}
                      {field.required && <span className="ml-0.5 text-destructive">*</span>}
                    </Label>
                  )}

                  {field.type === "textarea" ? (
                    <Textarea
                      id={fieldId}
                      placeholder={field.placeholder}
                      aria-invalid={Boolean(errMsg)}
                      {...register(field.name)}
                      className="text-xs"
                    />
                  ) : field.type === "checkbox" ? (
                    <div className="flex items-center gap-2 pt-2">
                      <Checkbox
                        id={fieldId}
                        checked={Boolean(val)}
                        onCheckedChange={(checked) => setValue(field.name, Boolean(checked))}
                      />
                      <Label htmlFor={fieldId} className="cursor-pointer text-xs font-medium">
                        {field.label}
                      </Label>
                    </div>
                  ) : field.type === "select" || field.type === "searchable_select" ? (
                    <Select
                      value={typeof val === "string" ? val : ""}
                      onValueChange={(v) => setValue(field.name, v === "__empty__" ? "" : v)}
                    >
                      <SelectTrigger id={fieldId} className="h-9 text-xs">
                        <SelectValue placeholder={field.placeholder ?? `Select ${field.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options ?? []).map((opt) => (
                          <SelectItem
                            key={opt.value || "__empty__"}
                            value={opt.value || "__empty__"}
                          >
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === "multi_select" ? (
                    <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-md border p-2">
                      {(field.options ?? []).map((opt) => {
                        const selected = Array.isArray(val) && val.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              const current = Array.isArray(val) ? (val as string[]) : [];
                              const next = selected
                                ? current.filter((x) => x !== opt.value)
                                : [...current, opt.value];
                              setValue(field.name, next, { shouldValidate: true });
                            }}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-muted/50 text-foreground hover:bg-muted",
                            )}
                          >
                            {selected && <Check className="size-3" />}
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : field.type === "radio" ? (
                    <div className="flex flex-wrap gap-3 pt-1">
                      {(field.options ?? []).map((opt) => (
                        <label key={opt.value} className="inline-flex items-center gap-1.5 text-xs">
                          <input
                            type="radio"
                            value={opt.value}
                            {...register(field.name)}
                            className="accent-primary"
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <Input
                      id={fieldId}
                      type={
                        field.type === "date_range"
                          ? "date"
                          : field.type === "number"
                            ? "number"
                            : field.type === "date"
                              ? "date"
                              : field.type === "time"
                                ? "time"
                                : field.type === "email"
                                  ? "email"
                                  : field.type === "url"
                                    ? "url"
                                    : "text"
                      }
                      placeholder={field.placeholder}
                      aria-invalid={Boolean(errMsg)}
                      {...register(field.name)}
                      className="h-9 text-xs"
                    />
                  )}

                  {field.helpText && (
                    <p className="text-[11px] text-muted-foreground">{field.helpText}</p>
                  )}
                  {errMsg && (
                    <p role="alert" className="text-[11px] font-medium text-destructive">
                      {errMsg}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                reset(defaultValues);
                setStep(1);
              }}
            >
              <RotateCcw className="size-3.5" /> Reset
            </Button>

            <div className="flex items-center gap-2">
              {props.multiStep && step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStep((s) => s - 1)}
                >
                  Previous
                </Button>
              )}
              {props.multiStep && step < maxStep ? (
                <Button type="button" size="sm" onClick={() => setStep((s) => s + 1)}>
                  Next Step
                </Button>
              ) : (
                <Button type="submit" size="sm" disabled={isSubmitting} className="gap-1.5">
                  <Send className="size-3.5" />
                  {props.submitLabel}
                </Button>
              )}
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
