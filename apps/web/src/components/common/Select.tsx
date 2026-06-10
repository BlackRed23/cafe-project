import React from "react";

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
  ({ label, options, error, className = "", ...props }, ref) => {
    return (
      <div className={`w-full ${className}`}>
        {label && (
          <label className="block text-[15px] font-medium text-slate-700 mb-1.5">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={`block w-full px-3.5 py-2.5 rounded-lg border text-[15px] transition-colors duration-200 outline-none bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-700
            ${error ? "border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500/20" : "border-slate-355 text-slate-900"}`}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="mt-1.5 text-[13px] text-red-600 font-medium">{error}</p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";
