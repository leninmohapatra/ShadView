"use client";

import * as React from "react";
import Map, { NavigationControl, Source, Layer } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { csvToGeoJson } from "../app/utils/csvToGeoJson";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

type ViewMode = "points" | "heatmap" | "cluster";
type ColorBy = "signal" | "type" | "security";
type LayerKey = "bluetooth" | "wifi"; // add more later

const LAYERS: Record<LayerKey, { url: string }> = {
  bluetooth: { url: "/sample-data/bluetooth1.csv" },
  wifi: { url: "/sample-data/wifi.csv" }, // ✅ put your wifi CSV in /public/sample-data/wifi.csv
};
// 5-level signal palette (matches your screenshot)
const SIGNAL_BUCKETS = [
  { label: "Excellent", color: "#00ff88", min: -60 },
  { label: "Good", color: "#22c55e", min: -70 },
  { label: "Fair", color: "#ffcc00", min: -80 },
  { label: "Weak", color: "#f59e0b", min: -90 },
  { label: "Poor", color: "#ff0055", min: -100 },
];

// Mapbox expression for coloring by signalStrength (5 levels)
const signalColorExpr: any = [
  "interpolate",
  ["linear"],
  ["coalesce", ["get", "signalStrength"], -100],
  -100,
  "#ff0055", // Poor
  -90,
  "#f59e0b", // Weak
  -80,
  "#ffcc00", // Fair
  -70,
  "#22c55e", // Good
  -60,
  "#00ff88", // Excellent
];

export default function MapView({
  enabledLayers,
  viewMode,
  colorBy,
}: {
  enabledLayers: Record<string, boolean>;
  viewMode: ViewMode;
  colorBy: ColorBy;
}) {
  const [dataByLayer, setDataByLayer] = React.useState<Record<string, any>>({});
  const mapRef = React.useRef<any>(null);
  const CLUSTER_FIT_MAX_ZOOM = 20;
  const FIT_DEBOUNCE_MS = 180;

  // load all CSVs once
  React.useEffect(() => {
    (async () => {
      const entries = await Promise.all(
        (Object.keys(LAYERS) as LayerKey[]).map(async (k) => {
          const csv = await fetch(LAYERS[k].url).then((r) => r.text());
          return [k, csvToGeoJson(csv, k)] as const;
        })
      );
      setDataByLayer(Object.fromEntries(entries));
    })();
  }, []);

  // helper visibility
  const vis = (mode: ViewMode) => (viewMode === mode ? "visible" : "none");

  // COLOR BY expressions (works for both wifi + bluetooth)
  const circleColor =
    colorBy === "signal"
      ? signalColorExpr
      : colorBy === "type"
      ? [
          "match",
          ["get", "layer"],
          "wifi",
          "#22c55e",
          "bluetooth",
          "#3b82f6",
          /* default */ "#a1a1aa",
        ]
      : [
          "match",
          [
            "downcase",
            ["to-string", ["coalesce", ["get", "encryptionType"], "unknown"]],
          ],
          "open",
          "#ef4444",
          "wpa2",
          "#3b82f6",
          "wpa3",
          "#22c55e",
          /* default */ "#a1a1aa",
        ];
  const clusterAvgSignal: any = [
    "/",
    ["coalesce", ["get", "signalSum"], -100],
    ["max", ["coalesce", ["get", "signalCount"], 1], 1],
  ];

  const clusterColorExpr: any =
    colorBy === "signal"
      ? [
          "interpolate",
          ["linear"],
          clusterAvgSignal,
          -100,
          "#ff0055", // Poor
          -90,
          "#f59e0b", // Weak
          -80,
          "#ffcc00", // Fair
          -70,
          "#22c55e", // Good
          -60,
          "#00ff88", // Excellent
        ]
      : circleColor;

  // Fit map to all currently enabled layers
  React.useEffect(() => {
    if (!mapRef.current) return;

    // ✅ debounce: toggling many switches quickly won't spam fitBounds
    const t = window.setTimeout(() => {
      const map = mapRef.current?.getMap?.();
      if (!map) return;

      const enabledKeys = (Object.keys(LAYERS) as LayerKey[]).filter(
        (k) => enabledLayers[k] && dataByLayer[k]?.features?.length
      );
      if (!enabledKeys.length) return;

      let minLng = Infinity,
        minLat = Infinity,
        maxLng = -Infinity,
        maxLat = -Infinity;

      // compute bounds across ALL enabled layers
      for (const k of enabledKeys) {
        for (const f of dataByLayer[k].features) {
          const coords = f?.geometry?.coordinates;
          if (!Array.isArray(coords) || coords.length < 2) continue;

          const lng = Number(coords[0]);
          const lat = Number(coords[1]);
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

          minLng = Math.min(minLng, lng);
          minLat = Math.min(minLat, lat);
          maxLng = Math.max(maxLng, lng);
          maxLat = Math.max(maxLat, lat);
        }
      }

      // If we never updated bounds (all invalid), exit
      if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return;

      // If all points identical, add small padding so fitBounds works
      if (minLng === maxLng && minLat === maxLat) {
        const pad = 0.001; // a bit larger than before to avoid extreme zoom-in
        minLng -= pad;
        maxLng += pad;
        minLat -= pad;
        maxLat += pad;
      }

      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        {
          padding: viewMode === "cluster" ? 140 : 80,
          duration: 700,
          maxZoom: viewMode === "cluster" ? CLUSTER_FIT_MAX_ZOOM : 22,
        }
      );
    }, FIT_DEBOUNCE_MS);

    return () => window.clearTimeout(t);
  }, [enabledLayers, dataByLayer, viewMode]);

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={TOKEN}
      initialViewState={{ longitude: -88.0256, latitude: 42.1524, zoom: 12 }}
      mapStyle="mapbox://styles/mapbox/dark-v11"
      style={{ width: "100%", height: "100%" }}
    >
      <NavigationControl position="top-right" />

      {(Object.keys(LAYERS) as LayerKey[]).map((k) => {
        const geo = dataByLayer[k];
        if (!geo || !enabledLayers[k]) return null;

        return (
          <Source
            key={k}
            id={`${k}-src`}
            type="geojson"
            data={geo}
            cluster={viewMode === "cluster"}
            clusterRadius={viewMode === "cluster" ? 120 : 50} // ⬅️ bigger radius = fewer circles at same zoom
            clusterMaxZoom={viewMode === "cluster" ? CLUSTER_FIT_MAX_ZOOM : 22}
            clusterProperties={{
              signalSum: ["+", ["coalesce", ["get", "signalStrength"], -100]],
              signalCount: ["+", 1],
            }}
          >
            {/* POINTS */}
            <Layer
              id={`${k}-points`}
              type="circle"
              layout={{ visibility: vis("points") }}
              paint={{
                "circle-radius": 14,
                "circle-color": circleColor as any,
                "circle-stroke-width": 1,
                "circle-stroke-color": "#000",
                "circle-opacity": 0.9,
              }}
            />

            {/* HEATMAP */}
            <Layer
              id={`${k}-heatmap`}
              type="heatmap"
              layout={{ visibility: vis("heatmap") }}
              paint={{
                "heatmap-weight": [
                  "interpolate",
                  ["linear"],
                  ["coalesce", ["get", "signalStrength"], -100],
                  -100,
                  0,
                  -60,
                  1,
                ],
                "heatmap-intensity": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  8,
                  1,
                  14,
                  3,
                ],
                "heatmap-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  8,
                  15,
                  14,
                  35,
                ],
                "heatmap-opacity": 0.95,
              }}
            />

            {/* CLUSTERS */}
            <Layer
              id={`${k}-clusters`}
              type="circle"
              filter={["has", "point_count"]}
              layout={{ visibility: vis("cluster") }}
              paint={{
                "circle-color": clusterColorExpr,
                "circle-radius": [
                  "step",
                  ["get", "point_count"],
                  22,
                  10,
                  28,
                  50,
                  36,
                  200,
                  48,
                ],
                "circle-opacity": 0.9,
                "circle-stroke-width": 2,
                "circle-stroke-color": "#020617",
              }}
            />

            <Layer
              id={`${k}-unclustered`}
              type="circle"
              filter={["!", ["has", "point_count"]]}
              layout={{ visibility: vis("cluster") }}
              paint={{
                "circle-radius": 4, // same big as points
                "circle-color": circleColor as any, // ✅ signal/type/security
                "circle-opacity": 0.55,
                "circle-stroke-width": 0.5,
                "circle-stroke-color": "#000",
              }}
            />
          </Source>
        );
      })}
    </Map>
  );
}
