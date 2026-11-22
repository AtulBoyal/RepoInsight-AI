import { FolderGit2 } from "lucide-react";

interface Props {
  value: string;
  onChange(value: string): void;
  onSubmit(): void;
}

/**
 * Text field for a public GitHub repository URL.
 */
export default function GitHubUrlInput({ value, onChange, onSubmit }: Props) {
  return (
    <div className="rounded-3xl border-2 border-slate-200 bg-white p-8 shadow-sm sm:p-10">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-900">
        <FolderGit2 size={30} className="text-white" />
      </div>

      <h2 className="mt-6 text-center text-2xl font-bold text-slate-900">
        Analyze a GitHub Repository
      </h2>

      <p className="mx-auto mt-3 max-w-md text-center text-slate-500">
        Paste the link to a public repository. The latest commit on the
        default branch is analyzed, or the branch in a <code>/tree/</code> link.
      </p>

      <form
        className="mt-8"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor="github-url" className="sr-only">
          GitHub repository URL
        </label>

        <input
          id="github-url"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://github.com/owner/repository"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
      </form>

      <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">Accepted formats</p>

        <ul className="mt-2 space-y-1">
          <li>• https://github.com/owner/repository</li>
          <li>• https://github.com/owner/repository/tree/branch</li>
          <li>• owner/repository</li>
          <li>• Private repositories: download them as a ZIP and upload instead.</li>
        </ul>
      </div>
    </div>
  );
}
