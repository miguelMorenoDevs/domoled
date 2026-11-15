import { createRequire } from "node:module";

// qrcode-terminal's encoder returns the module grid; its public API only prints text.
const requireQr = createRequire(import.meta.url);
const QRCode = requireQr("qrcode-terminal/vendor/QRCode");
const QRErrorCorrectLevel = requireQr(
  "qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel",
);

/** The QR module grid for `url`: `true` is a dark module. */
export function qrModules(url: string): boolean[][] {
  const qr = new QRCode(-1, QRErrorCorrectLevel.L);
  qr.addData(url);
  qr.make();
  return qr.modules;
}
