/** Raised when the album art URL cannot be fetched or decoded. */
export class AlbumArtLoadError extends Error {
  readonly imageUrl: string;

  constructor(imageUrl: string, cause: unknown) {
    super(`Failed to load album art from ${imageUrl}`, { cause });
    this.name = "AlbumArtLoadError";
    this.imageUrl = imageUrl;
  }
}
