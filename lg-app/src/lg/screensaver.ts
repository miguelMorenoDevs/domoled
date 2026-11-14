/**
 * Keeps the TV's screensaver from interrupting the display. webOS asks every registered app before it starts its
 * screensaver; answering `ack: false` cancels it. The service is undocumented, so replies are parsed defensively and
 * a TV that refuses the registration keeps its normal screensaver.
 */
export function holdScreenSaver(): void {
  if (typeof WebOSServiceBridge === "undefined") return;

  const clientName = "com.domo.led";
  const bridge = new WebOSServiceBridge();
  bridge.onservicecallback = (message) => {
    let timestamp: string | undefined;
    try {
      timestamp = (JSON.parse(message) as { timestamp?: string }).timestamp;
    } catch {
      return; // Not JSON, so not a screensaver request.
    }
    if (timestamp === undefined) return;
    bridge.call(
      "luna://com.webos.service.tvpower/power/responseScreenSaverRequest",
      JSON.stringify({ clientName, ack: document.hidden, timestamp }),
    );
  };
  bridge.call(
    "luna://com.webos.service.tvpower/power/registerScreenSaverRequest",
    JSON.stringify({ subscribe: true, clientName }),
  );
}
