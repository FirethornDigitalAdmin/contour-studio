import { useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import "./controls-polish.css";
export function Field({
  label,
  children,
  hint,
  hintId,
  error,
  errorId,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  hintId?: string;
  error?: string;
  errorId?: string;
}) {
  return (
    <label className={`field${error ? " field-with-error" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small id={hintId}>{hint}</small>}
      {error && <small className="field-error" id={errorId}>{error}</small>}
    </label>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
  ariaLabel,
  integer = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number | "any";
  hint?: string;
  ariaLabel?: string;
  integer?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  const startingValue = useRef(value);
  const hintId = useId();
  const errorId = useId();
  const draftValue = draft.trim() ? Number(draft) : NaN;
  const displayedValue = editing ? draftValue : value;
  const invalid = !Number.isFinite(displayedValue) || displayedValue < min || displayedValue > max || (integer && !Number.isInteger(displayedValue));
  const error = invalid ? `${integer ? "Whole number: " : "Use "}${min}–${max}.` : undefined;
  const descriptionIds = [hint ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <Field label={label} hint={hint} hintId={hintId} error={error} errorId={errorId}>
      <input
        type="number"
        inputMode={integer ? "numeric" : "decimal"}
        required
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel || label}
        aria-invalid={invalid || undefined}
        aria-describedby={descriptionIds}
        value={editing ? draft : String(value)}
        onFocus={() => {
          cancelled.current = false;
          startingValue.current = value;
          setDraft(String(value));
          setEditing(true);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = e.target.valueAsNumber;
          if (Number.isFinite(next) && next >= min && next <= max && (!integer || Number.isInteger(next)))
            onChange(next);
        }}
        onBlur={(e) => {
          const next = e.currentTarget.valueAsNumber;
          if (!cancelled.current && Number.isFinite(next)) {
            const rounded = integer ? Math.round(next) : step === "any" ? next : Number((min + Math.round((next - min) / step) * step).toFixed(10));
            const constrained = Math.min(max, Math.max(min, rounded));
            if (constrained !== value) onChange(constrained);
          }
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancelled.current = true;
            if (value !== startingValue.current) onChange(startingValue.current);
            e.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
export function Section({
  heading,
  icon,
  children,
  open = false,
  description,
  group,
}: {
  heading: string;
  icon?: ReactNode;
  children: ReactNode;
  open?: boolean;
  description?: string;
  group?: string;
}) {
  return (
    <details className={`section${description ? " section-described" : ""}`} open={open} name={group}>
      <summary>
        {icon && <span className="section-icon" aria-hidden="true">{icon}</span>}
        <span className="section-label"><span>{heading}</span>{description && <small>{description}</small>}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
export function GridIcon({ columns, rows }: { columns: number; rows: number }) {
  const cols = Math.max(1, Math.min(20, Math.floor(columns || 1))),
    count = Math.max(1, Math.min(20, Math.floor(rows || 1)));
  return (
    <div
      aria-hidden="true"
      className="mini-grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${count}, 1fr)`,
      }}
    >
      {Array.from({ length: cols * count }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}

export function FeatureGroup({ heading, icon, description, checked, onChange, children }: {
  heading: string; icon?: ReactNode; description: string; checked: boolean;
  onChange: (checked: boolean) => void; children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <div className={`feature-group${checked ? " enabled" : ""}`} data-feature={heading}>
    <div className="feature-group-heading">
      <span className="feature-group-icon" aria-hidden="true">{icon}</span>
      <div><strong>{heading}</strong><small>{checked ? description : "Off · Your settings are kept"}</small></div>
      <label className="feature-group-toggle"><input type="checkbox" role="switch" aria-label={heading} checked={checked} onChange={e => onChange(e.target.checked)} /><span className="switch" aria-hidden="true" /></label>
    </div>
    {children && <><button type="button" className="feature-details-button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{expanded ? "Hide details" : "Edit details"}<ChevronDown size={14} aria-hidden="true" /></button><div id={id} className="feature-group-body" hidden={!expanded}>{!checked && <p className="hint">Switch on {heading.toLowerCase()} to include it in your artwork.</p>}{children}</div></>}
  </div>;
}
