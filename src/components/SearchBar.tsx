/**
 * SearchBar.tsx
 *
 * Reusable search input with a leading search icon and an inline clear button.
 * Clears on Escape key. Fully accessible with aria attributes.
 *
 * Props:
 *  - searchTerm    : Current search string (controlled).
 *  - setSearchTerm : Setter to update the search string.
 *  - placeholder   : Optional placeholder text.
 */

import React, { useRef } from "react";
import { Search, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SearchBar({
  searchTerm,
  setSearchTerm,
  placeholder = "Search by ward, locality or area name...",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  /** Clears the search term and returns focus to the input. */
  const handleClear = () => {
    setSearchTerm("");
    inputRef.current?.focus();
  };

  /** Pressing Escape clears the search term. */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") handleClear();
  };

  return (
    <div className="relative w-full mb-6" role="search">
      {/* Leading search icon */}
      <Search
        className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 pointer-events-none"
        aria-hidden="true"
      />

      <input
        ref={inputRef}
        type="search"
        placeholder={placeholder}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Search issues"
        className="w-full pl-12 pr-12 py-3 border-[1.5px] border-slate-200 rounded-xl focus:border-[#2563EB] bg-white outline-none text-sm transition-all"
      />

      {/* Clear button — only visible when there is a search term */}
      {searchTerm && (
        <button
          onClick={handleClear}
          className="absolute right-4 top-3.5 p-1 hover:bg-slate-100 rounded-full transition-colors"
          aria-label="Clear search"
        >
          <X className="h-5 w-5 text-slate-400" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
