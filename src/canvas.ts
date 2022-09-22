import { Context } from "./context.ts";
import ffi, { cstr, getBuffer } from "./ffi.ts";

const {
  sk_canvas_create,
  sk_canvas_destroy,
  sk_canvas_save,
  sk_canvas_read_pixels,
  sk_canvas_encode_image,
  sk_data_free,
} = ffi;

const CANVAS_FINALIZER = new FinalizationRegistry((ptr: Deno.PointerValue) => {
  sk_canvas_destroy(ptr);
});

enum CFormat {
  png = 0,
  jpeg = 1,
  webp = 2,
}

export type ImageFormat = keyof typeof CFormat;

const OUT_SIZE = new Uint32Array(1);
const OUT_DATA_PTR = new BigUint64Array(1);

const SK_DATA_FINALIZER = new FinalizationRegistry(
  (ptr: Deno.PointerValue) => {
    sk_data_free(ptr);
  },
);

export class Canvas {
  #ptr: Deno.PointerValue;
  #width: number;
  #height: number;

  get _unsafePointer() {
    return this.#ptr;
  }

  get width() {
    return this.#width;
  }

  get height() {
    return this.#height;
  }

  constructor(width: number, height: number) {
    this.#ptr = sk_canvas_create(width, height);
    if (this.#ptr === 0) {
      throw new Error("Failed to create canvas");
    }
    CANVAS_FINALIZER.register(this, this.#ptr);
    this.#width = width;
    this.#height = height;
  }

  save(path: string, format: ImageFormat = "png", quality = 100) {
    if (!sk_canvas_save(this.#ptr, cstr(path), CFormat[format], quality)) {
      throw new Error("Failed to save canvas");
    }
  }

  encode(format: ImageFormat = "png", quality = 100) {
    const bufptr = sk_canvas_encode_image(
      this.#ptr,
      CFormat[format],
      quality,
      OUT_SIZE,
      OUT_DATA_PTR,
    );

    if (bufptr === 0) {
      throw new Error("Failed to encode canvas");
    }

    const size = OUT_SIZE[0];
    const ptr = OUT_DATA_PTR[0];
    const buffer = new Uint8Array(getBuffer(bufptr, size));
    SK_DATA_FINALIZER.register(buffer, ptr);
    return buffer;
  }

  readPixels(
    x: number = 0,
    y: number = 0,
    width?: number,
    height?: number,
    into?: Uint8Array,
  ) {
    width = width ?? this.#width;
    height = height ?? this.#height;
    const pixels = into ?? new Uint8Array(width * height * 4);
    sk_canvas_read_pixels(this.#ptr, x, y, width, height, pixels);
    return pixels;
  }

  getContext(type: "2d"): Context;
  getContext(type: string): Context | null {
    switch (type) {
      case "2d":
        return new Context(this);
      default:
        return null;
    }
  }
}

export function createCanvas(width: number, height: number) {
  return new Canvas(width, height);
}
