import { FileArchive, FolderGit2 } from "lucide-react";

export type Source = "zip" | "github";

interface Props {
  value: Source;
  onChange(source: Source): void;
}

const OPTIONS: Array<{ value: Source; label: string; icon: typeof FileArchive }> = [
  { value: "zip", label: "Upload ZIP", icon: FileArchive },
  { value: "github", label: "GitHub URL", icon: FolderGit2 },
];

/**
 * Chooses between uploading a ZIP and analyzing a GitHub URL.
 */
export default function SourceToggle({ value, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Repository source"
      className="mb-6 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1"
    >
      {OPTIONS.map(({ value: option, label, icon: Icon }) => {
        const selected = option === value;

        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option)}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              selected
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
