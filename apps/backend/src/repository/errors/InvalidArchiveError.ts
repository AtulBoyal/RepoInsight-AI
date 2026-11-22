/**
 * The uploaded file is not a ZIP we are willing to process
 * (corrupt, not a ZIP, unsafe paths, or too many entries).
 */
export class InvalidArchiveError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "InvalidArchiveError";
  }
}
