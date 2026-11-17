import React, { useId } from "react";

interface Option {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Option[];
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, className = "", id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    return (
      <div className={`w-full ${className}`}>
        {label && (
          <label htmlFor={inputId} className="ds-label">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={`block w-full px-3.5 py-2.5 rounded-lg border text-[15px] transition-colors duration-200 outline-none bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-700
            ${error ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500/20" : "border-slate-355 text-slate-900"}`}
          {...props}
          id={inputId}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={[props['aria-describedby'], error ? errorId : undefined].filter(Boolean).join(' ') || undefined}
          data-ds="field"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p id={errorId} className="ds-field-error">{error}</p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";
