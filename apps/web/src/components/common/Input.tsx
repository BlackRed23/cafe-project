import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, type = "text", className = "", ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";
    
    // Determine the actual input type
    const inputType = isPassword ? (showPassword ? "text" : "password") : type;

    return (
      <div className={`w-full ${className}`}>
        {label && (
          <label className="block text-[15px] font-medium text-slate-700 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative rounded-md shadow-sm">
          <input
            ref={ref}
            type={inputType}
            className={`block w-full px-3.5 py-2.5 rounded-lg border text-[15px] transition-colors duration-200 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-700
              ${error ? "border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500/20" : "border-slate-350 text-slate-900 placeholder-slate-400"}
              ${isPassword ? "pr-10" : ""}`}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-[13px] text-red-600 font-medium">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
