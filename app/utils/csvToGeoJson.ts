import { parseCsv } from "./parseCsv"; // or keep in same file

type LayerKey = "bluetooth" | "wifi" | "lte" | "gsm" | "phone" | "gnss";

export function csvToGeoJson(csvText: string, layer: LayerKey) {
  const parsed = parseCsv(csvText);

  const features = (parsed.data as any[])
    .filter((row) => row.latitude != null && row.longitude != null)
    .map((row, idx) => ({
      type: "Feature",
      id: `${layer}-${idx}`,
      geometry: {
        type: "Point",
        coordinates: [Number(row.longitude), Number(row.latitude)],
      },
      properties: {
        layer, // ✅ important for "Color By: TYPE"
        signalStrength: row.signalStrength ?? row.rssi ?? null,
        deviceTime: row.deviceTime ?? row.time ?? null,

        // wifi specific
        ssid: row.ssid ?? null,
        bssid: row.bssid ?? null,
        encryptionType: row.encryptionType ?? row.security ?? null,

        // bluetooth specific
        sourceAddress: row.sourceAddress ?? null,
        txPower: row.txPower ?? null,
      },
    }));

  return { type: "FeatureCollection", features };
}
