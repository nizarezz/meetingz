"use client";

import { useRef } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  disabled?: boolean;
}

export function DatePicker({ value, onChange, min, disabled }: DatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start text-left font-normal"
        disabled={disabled}
        onClick={() => inputRef.current?.showPicker()}
      >
        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
        <span className="truncate">
          {value
            ? new Date(value + "T00:00:00").toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : "Pick a date"}
        </span>
      </Button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
        disabled={disabled}
      />
    </div>
  );
}
