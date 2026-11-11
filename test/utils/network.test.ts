import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import os from "os";
import { getLocalIP } from "../../src/utils/network.js";

type Interfaces = ReturnType<typeof os.networkInterfaces>;

function address(address: string, internal: boolean, family = "IPv4") {
  return {
    address,
    netmask: "255.255.255.0",
    family,
    mac: "00:00:00:00:00:00",
    internal,
    cidr: `${address}/24`,
  } as unknown as NonNullable<Interfaces[string]>[number];
}

function mockInterfaces(t: TestContext, interfaces: Interfaces) {
  t.mock.method(os, "networkInterfaces", () => interfaces);
}

test("getLocalIP returns the first external IPv4 of a preferred interface", (t) => {
  mockInterfaces(t, {
    wlan0: [address("192.168.1.20", false)],
    eth0: [address("10.0.0.5", false)],
  });

  assert.equal(getLocalIP(), "10.0.0.5");
});

test("getLocalIP skips internal and IPv6 addresses", (t) => {
  mockInterfaces(t, {
    eth0: [
      address("127.0.0.1", true),
      address("fe80::1", false, "IPv6"),
    ],
    wlan0: [address("192.168.1.20", false)],
  });

  assert.equal(getLocalIP(), "192.168.1.20");
});

test("getLocalIP ignores interfaces that are not in the preferred list", (t) => {
  mockInterfaces(t, {
    tun0: [address("172.16.0.2", false)],
  });

  assert.equal(getLocalIP(), "127.0.0.1");
});
