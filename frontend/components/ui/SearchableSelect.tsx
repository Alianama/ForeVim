"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Search, Check, X } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  /** If true, shows a small compact variant */
  compact?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  label,
  className = "",
  disabled = false,
  compact = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const filtered = search.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          o.sublabel?.toLowerCase().includes(search.toLowerCase()) ||
          o.value.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((v) => {
      if (!v) {
        setSearch("");
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      return !v;
    });
  }, [disabled]);

  const handleSelect = useCallback(
    (val: string) => {
      onChange(val);
      setIsOpen(false);
      setSearch("");
    },
    [onChange]
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setSearch("");
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <span className="text-xs text-muted-foreground font-medium whitespace-nowrap mr-2">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`
          flex items-center justify-between gap-2 w-full
          bg-background border border-border rounded-lg
          text-left transition-all
          focus:outline-none focus:ring-1 focus:ring-ring
          disabled:opacity-50 disabled:cursor-not-allowed
          ${compact ? "px-3 py-1.5 text-xs" : "px-3 py-2 text-sm"}
          ${isOpen ? "ring-1 ring-ring border-foreground/30" : "hover:border-foreground/20"}
        `}
      >
        <span
          className={`truncate ${selectedOption ? "text-foreground font-medium" : "text-muted-foreground"}`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          className="
            absolute z-50 mt-1 w-full min-w-[200px]
            bg-popover border border-border rounded-lg shadow-xl
            animate-fade-in overflow-hidden
          "
          style={{ maxHeight: "280px" }}
        >
          {/* Search Input */}
          {options.length > 5 && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Options list */}
          <div className="overflow-y-auto" style={{ maxHeight: "230px" }}>
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                No results found
              </div>
            )}
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={`
                  w-full flex items-center justify-between gap-2 px-3 py-2
                  text-left text-xs transition-colors
                  ${opt.value === value
                    ? "bg-primary/10 text-foreground font-semibold"
                    : "text-foreground hover:bg-secondary"
                  }
                `}
              >
                <div className="flex flex-col min-w-0">
                  <span className="truncate">{opt.label}</span>
                  {opt.sublabel && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      {opt.sublabel}
                    </span>
                  )}
                </div>
                {opt.value === value && (
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
