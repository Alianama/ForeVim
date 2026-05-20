"use client";

import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Monitor } from "lucide-react";
import type { VM } from "@/types";

interface Props {
  vms: VM[];
  selectedValue: string;
  onChange: (value: string) => void;
}

export function SearchableVMSelect({ vms, selectedValue, onChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter VMs based on search input (case-insensitive hostname or IP)
  const filteredVms = vms.filter(
    (vm) =>
      vm.hostname.toLowerCase().includes(search.toLowerCase()) ||
      vm.ip_address.toLowerCase().includes(search.toLowerCase())
  );

  const selectedVm = vms.find((vm) => vm.id === selectedValue);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setSearch(""); // reset search on open
        }}
        className="w-64 flex items-center justify-between bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary focus:border-primary text-left transition-all"
      >
        <span className="flex items-center gap-2 truncate">
          <Monitor className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          {selectedVm ? (
            <span className="truncate">
              {selectedVm.hostname} <span className="text-muted-foreground text-xs">({selectedVm.ip_address})</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Select a VM...</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1 w-72 bg-popover border border-border rounded-md shadow-lg z-50 glass-card overflow-hidden">
          <div className="p-2 border-b border-border/50 flex items-center gap-2 bg-background/50">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Search hostname or IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent border-none outline-none text-xs text-foreground placeholder-muted-foreground"
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filteredVms.map((vm) => (
              <button
                key={vm.id}
                type="button"
                onClick={() => {
                  onChange(vm.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs flex flex-col hover:bg-accent hover:text-accent-foreground transition-colors ${
                  vm.id === selectedValue ? "bg-accent/50 font-medium text-primary" : "text-foreground"
                }`}
              >
                <span className="font-semibold truncate text-foreground">{vm.hostname}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{vm.ip_address}</span>
              </button>
            ))}
            {filteredVms.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No matching VMs found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
