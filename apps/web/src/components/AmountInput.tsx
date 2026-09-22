import React, { InputHTMLAttributes, forwardRef } from "react";

export interface AmountInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
}

export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(({ value, onChange, ...props }, ref) => {
  // Format the value with commas
  const formatValue = (val: string) => {
    if (!val) return "";
    const parts = val.split(".");
    if (parts[0]) parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/,/g, "");
    // Allow empty, integers, and decimals
    if (raw === "" || /^-?\d*\.?\d*$/.test(raw)) {
      onChange(raw);
    }
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={formatValue(value)}
      onChange={handleChange}
      {...props}
    />
  );
});
