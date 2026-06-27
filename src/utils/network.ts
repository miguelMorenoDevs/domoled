import os from "os";

export function getLocalIP() {
  const interfaces = os.networkInterfaces();

  const preferredNames = [
    "eth0",
    "en0",
    "ens3",
    "enp0s3",
    "wlan0",
    "wi-fi",
    "Ethernet",
  ];

  for (const name of preferredNames) {
    const iface = interfaces[name];
    if (iface) {
      for (const addr of iface) {
        if (addr.family === "IPv4" && !addr.internal) {
          return addr.address;
        }
      }
    }
  }

  return "127.0.0.1";
}
