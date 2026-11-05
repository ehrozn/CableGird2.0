import { NativeSelect } from "@/components/common";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import type { Column } from "@/lib/types";

/** Form-style editor for a column value (dialogs, crew portal). */
export const CellEditor = ({
  col,
  value,
  onChange,
  className,
}: {
  col: Column;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) => {
  const t = useT();
  if (col.type === "select")
    return (
      <NativeSelect value={value} onChange={onChange} className={className}>
        <option value="">—</option>
        {(col.options ?? []).filter(Boolean).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {value && !(col.options ?? []).includes(value) && <option value={value}>{value}</option>}
      </NativeSelect>
    );
  if (col.type === "checkbox")
    return (
      <NativeSelect value={value} onChange={onChange} className={className}>
        <option value="">—</option>
        <option value="yes">{t("Yes")}</option>
        <option value="no">{t("No")}</option>
      </NativeSelect>
    );
  return (
    <Input
      className={className}
      type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
};
