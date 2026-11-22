export const MAX_UPLOAD_SIZE =
  500 * 1024 * 1024; // 500 MB

export const MAX_ANALYZABLE_SIZE =
  50 * 1024 * 1024; // 50 MB

/**
 * Zip-bomb guards. Entries under ignored directories
 * (node_modules, .git, ...) are skipped and do not count.
 */
export const MAX_EXTRACTED_SIZE =
  200 * 1024 * 1024; // 200 MB

export const MAX_EXTRACTED_ENTRIES = 20000;
