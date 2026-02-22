declare module 'pica' {
  interface PicaOptions {
    features?: string[];
  }

  class Pica {
    constructor(options?: PicaOptions);
    resize(source: HTMLCanvasElement, target: HTMLCanvasElement): Promise<void>;
    toBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob>;
  }

  export default Pica;
}

declare module 'piexifjs' {
  type ExifPayload = Record<string, unknown>;

  export function load(data: string): ExifPayload;
  export function dump(exif: ExifPayload): string;
  export function insert(exif: string, dataUrl: string): string;

  const piexif: {
    load: typeof load;
    dump: typeof dump;
    insert: typeof insert;
  };

  export default piexif;
}
