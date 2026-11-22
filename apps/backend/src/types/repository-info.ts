/**
 * Which repository a report is about, shown in the report header.
 */
export interface RepositoryInfo {
  /** "owner/repo" for GitHub, the ZIP's file name for uploads. */
  name: string;
  /** Link to the repository (GitHub only). */
  url?: string;
  /** Branch, tag or commit that was requested (GitHub only). */
  ref?: string;
  /** Exact commit analyzed (GitHub only). */
  commitSha?: string;
}
