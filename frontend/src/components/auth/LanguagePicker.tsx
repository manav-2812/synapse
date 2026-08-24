import { useState, useRef, useEffect } from "react";
import { Icon } from "../ui/Icon";

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: "en-US", name: "English (US)", nativeName: "English (US)", flag: "🇺🇸" },
  { code: "en-GB", name: "English (UK)", nativeName: "English (UK)", flag: "🇬🇧" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳" },
];

export function LanguagePicker() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(() => {
    return localStorage.getItem("synapse_lang") || "en-US";
  });
  const menuRef = useRef<HTMLDivElement>(null);

  const current = LANGUAGES.find((l) => l.code === selected) || LANGUAGES[0];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
    }
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function handleSelect(code: string) {
    setSelected(code);
    localStorage.setItem("synapse_lang", code);
    setOpen(false);
  }

  return (
    <div className="notion-lang-picker-wrap" ref={menuRef}>
      <button
        type="button"
        className={`notion-bottom-lang-btn${open ? " active" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="notion-lang-globe">🌐</span>
        <span className="notion-lang-label">Language: {current.nativeName}</span>
        <Icon name="chevronDown" size={12} className={`notion-lang-caret${open ? " open" : ""}`} />
      </button>

      {open && (
        <div className="notion-lang-dropdown" role="listbox">
          <div className="notion-lang-dropdown-header">Select Language</div>
          <div className="notion-lang-list">
            {LANGUAGES.map((lang) => {
              const isSelected = lang.code === selected;
              return (
                <button
                  key={lang.code}
                  type="button"
                  className={`notion-lang-item${isSelected ? " selected" : ""}`}
                  onClick={() => handleSelect(lang.code)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <span className="notion-lang-flag">{lang.flag}</span>
                  <span className="notion-lang-text">
                    <span className="notion-lang-name">{lang.nativeName}</span>
                    {lang.name !== lang.nativeName && (
                      <span className="notion-lang-sub">({lang.name})</span>
                    )}
                  </span>
                  {isSelected && <Icon name="check" size={14} className="notion-lang-check" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
