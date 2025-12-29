"use client";

import * as React from "react";
import Map, { NavigationControl, Source, Layer, Popup } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Pagination from "@mui/material/Pagination";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

type HoverInfo = {
  lng: number;
  lat: number;
  isCluster: boolean;
  props: any;
} | null;

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

type ViewMode = "points" | "heatmap" | "cluster";

const API_BASE = "https://shadowview-api-963619060579.us-central1.run.app";
function formatTimestampCompact(ts?: string) {
  if (!ts) return "-";
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getUTCDate()).padStart(2, "0")}
${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes()
  ).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")} UTC`;
}

// Map UI keys → backend query params
function buildEventQueryParams(enabled: Record<string, boolean>) {
  const sources: string[] = [];
  const networkTypes: string[] = [];
  const devices: string[] = [];

  if (enabled.wifi) {
    networkTypes.push("WIFI");
    sources.push("beacon_message");
  }
  if (enabled.gps) networkTypes.push("GPS");

  if (enabled.bluetooth) sources.push("bluetooth_message");
  if (enabled.lte) sources.push("lte_message");
  if (enabled.nr) sources.push("nr_message");
  if (enabled.gsm) sources.push("gsm_message");
  if (enabled.cdma) sources.push("cdms_message");
  if (enabled.gnss) {
    networkTypes.push("GPS"); // 👈 THIS is the GPS filter
    sources.push("gnss_message"); // 👈 GNSS event source
  }

  // Only keep this if your backend supports it
  if (enabled.phone) sources.push("phone_state_message");

  return {
    sources: Array.from(new Set(sources)),
    networkTypes: Array.from(new Set(networkTypes)),
    devices: Array.from(new Set(devices)),
  };
}

// Convert backend response to GeoJSON FeatureCollection
function toFeatureCollection(data: any) {
  const fc =
    data?.type === "FeatureCollection" && Array.isArray(data.features)
      ? data
      : {
          type: "FeatureCollection",
          features: (Array.isArray(data)
            ? data
            : Array.isArray(data?.events)
            ? data.events
            : []
          )
            .map((row: any) => {
              const lng = row.longitude ?? row.lon ?? row.lng;
              const lat = row.latitude ?? row.lat;
              if (typeof lng !== "number" || typeof lat !== "number")
                return null;

              const kind =
                row.network_type ??
                row.networkType ??
                row.source ??
                row.message_type ??
                row.messageType ??
                "UNKNOWN";

              return {
                type: "Feature",
                geometry: { type: "Point", coordinates: [lng, lat] },
                properties: {
                  ...row,
                  kind,
                  signalStrength:
                    row.signalStrength ??
                    row.rssi ??
                    row.signal_strength ??
                    -100,
                },
              };
            })
            .filter(Boolean),
        };

  // ✅ Ensure kind exists even if backend already sent FeatureCollection
  const features = (fc.features ?? []).map((f: any) => {
    const p = f?.properties ?? {};
    const kind =
      p.kind ??
      p.network_type ??
      p.networkType ??
      p.source ??
      p.message_type ??
      p.messageType ??
      "UNKNOWN";

    return {
      ...f,
      properties: {
        ...p,
        kind,
        signalStrength: p.signalStrength ?? p.rssi ?? p.signal_strength ?? -100,
      },
    };
  });

  return { ...fc, features };
}

/**
 * ✅ Color by "kind"
 * We color using `properties.kind`, which should be:
 * - "WIFI" (network type)
 * - or "lte_message", "bluetooth_message", "nr_message", "gnss_message", ...
 */
const kindColorExpr: any = [
  "match",
  ["to-string", ["coalesce", ["get", "kind"], "UNKNOWN"]],

  // Network types
  "WIFI",
  "#22c55e",
  "GPS",
  "#eab308",
  "GALILEO",
  "#eab308",
  "GLONASS",
  "#eab308",

  // Sources
  "bluetooth_message",
  "#3b82f6",
  "beacon_message",
  "#06b6d4", // ✅ add (cyan pops on dark)
  "lte_message",
  "#f59e0b",
  "nr_message",
  "#a855f7",
  "gsm_message",
  "#ef4444",
  "cdms_message",
  "#14b8a6",
  "gnss_message",
  "#eab308",
  "phone_state_message",
  "#94a3b8",

  // Message types (examples you showed)
  "NrRecord",
  "#a855f7", // ✅ add (matches 5G/NR)
  "WifiBeaconRecord",
  "#06b6d4", // if it appears
  "BluetoothRecord",
  "#3b82f6", // if it appears
  "GnssRecord",
  "#eab308", // if it appears
  "LteRecord",
  "#f59e0b", // if it appears
  "PhoneState",
  "#94a3b8", // if it appears

  // Default
  "#a1a1aa",
];

// Heatmap weight based on signal strength (optional)
const heatmapWeightExpr: any = [
  "interpolate",
  ["linear"],
  ["coalesce", ["get", "signalStrength"], -100],
  -100,
  0,
  -60,
  1,
];

export default function MapView({
  enabledLayers,
  viewMode,
  timeRange,
}: {
  enabledLayers: Record<string, boolean>;
  viewMode: ViewMode;
  timeRange: { start: string; end: string };
}) {
  const [geo, setGeo] = React.useState<any>({
    type: "FeatureCollection",
    features: [],
  });
  const [hover, setHover] = React.useState<HoverInfo>(null);
  const mapRef = React.useRef<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [activeClusterId, setActiveClusterId] = React.useState<number | null>(
    null
  );
  const [activeClusterCount, setActiveClusterCount] = React.useState(0);
  const [clusterPage, setClusterPage] = React.useState(1);
  const [clusterRows, setClusterRows] = React.useState<any[]>([]);
  const [clusterLoading, setClusterLoading] = React.useState(false);
  const interactiveIds =
    viewMode === "cluster"
      ? ["events-clusters", "events-unclustered"]
      : viewMode === "points"
      ? ["events-points"]
      : []; // heatmap click not needed

  const PAGE_SIZE = 50;

  // Load a page of leaves from a cluster
  const loadClusterPage = React.useCallback(
    (clusterId: number, count: number, page: number) => {
      const map = mapRef.current?.getMap?.();
      if (!map) return;
      const src: any = map?.getSource?.("events-src");
      if (!src || !src.getClusterLeaves) {
        return;
      }

      setClusterLoading(true);

      const offset = (page - 1) * PAGE_SIZE;
      src.getClusterLeaves(
        clusterId,
        PAGE_SIZE,
        offset,
        (err: any, leaves: any[]) => {
          setClusterLoading(false);
          if (err) {
            console.error("getClusterLeaves error:", err);
            setClusterRows([]);
            return;
          }

          // leaves are Features; table uses their properties
          setActiveClusterId(clusterId);
          setActiveClusterCount(count);
          setClusterPage(page);
          setClusterRows(leaves ?? []);
          setDrawerOpen(true);
        }
      );
    },
    [mapRef]
  );

  const safeTimeRange = {
    start:
      timeRange?.start ??
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    end: timeRange?.end ?? new Date().toISOString(),
  };

  const CLUSTER_FIT_MAX_ZOOM = 14;
  const FIT_DEBOUNCE_MS = 180;

  const vis = (mode: ViewMode) => (viewMode === mode ? "visible" : "none");

  const clusterColorExpr: any = [
    "step",
    ["get", "point_count"],
    "#60a5fa", // small cluster (blue)
    10,
    "#34d399", // medium (green)
    50,
    "#fbbf24", // large (amber)
    200,
    "#f87171", // very large (red)
  ];
  const clusterRadiusExpr: any = [
    "interpolate",
    ["linear"],
    ["zoom"],

    8,
    ["step", ["get", "point_count"], 10, 50, 14, 200, 18],

    12,
    ["step", ["get", "point_count"], 12, 50, 18, 200, 24],

    16,
    ["step", ["get", "point_count"], 14, 50, 20, 200, 26],
  ];

  // ✅ Fetch events when switches / time range changes
  React.useEffect(() => {
    const { sources, networkTypes, devices } =
      buildEventQueryParams(enabledLayers);

    if (!sources.length && !networkTypes.length && !devices.length) {
      setGeo({ type: "FeatureCollection", features: [] });
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("start_time", safeTimeRange.start);
        params.set("end_time", safeTimeRange.end);

        // multi-select: repeat params
        if (networkTypes.length)
          params.set("network_type", networkTypes.join(","));
        if (sources.length) params.set("source", sources.join(","));
        if (devices.length) {
          params.set("device", devices.join(",")); // or single device[0]
        }

        const url = `${API_BASE}/events?${params.toString()}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`API error ${res.status}: ${text}`);
        }

        const data = await res.json();
        setGeo(toFeatureCollection(data));
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          console.error(e);
          setGeo({ type: "FeatureCollection", features: [] });
          setError(e?.message ?? "Failed to load events");
        }
      } finally {
        // Don’t turn off loading for aborted requests that will be immediately replaced
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [enabledLayers, safeTimeRange.start, safeTimeRange.end]);

  // It automatically moves/zooms the map so that all your loaded points are visible on screen.
  React.useEffect(() => {
    if (!mapRef.current) return;

    const t = window.setTimeout(() => {
      const map = mapRef.current?.getMap?.();
      if (!map) return;

      const feats = geo?.features ?? [];
      if (!feats.length) return;

      let minLng = Infinity,
        minLat = Infinity,
        maxLng = -Infinity,
        maxLat = -Infinity;

      for (const f of feats) {
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

      if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return;

      if (minLng === maxLng && minLat === maxLat) {
        const pad = 0.001;
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
  }, [geo, viewMode]);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={TOKEN}
        initialViewState={{ longitude: -88.0256, latitude: 42.1524, zoom: 12 }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: "100%", height: "100%" }}
        // interactiveLayerIds={["events-clusters", "events-unclustered"]}
        interactiveLayerIds={interactiveIds}
        onClick={(e) => {
          const map = mapRef.current?.getMap?.();
          if (!map) return;

          const feats = map.queryRenderedFeatures(e.point, {
            layers: ["events-clusters", "events-unclustered"],
          });

          if (!feats.length) return;

          const clusterFeature = feats.find(
            (f: any) => f.properties?.point_count != null
          );
          if (clusterFeature) {
            const clusterId = Number(clusterFeature.properties.cluster_id);
            const count = Number(clusterFeature.properties.point_count) || 0;

            loadClusterPage(clusterId, count, 1);
            return;
          }

          const pointFeature =
            feats.find((f: any) => f.layer?.id === "events-unclustered") ??
            feats[0];

          setActiveClusterId(null);
          setActiveClusterCount(1);
          setClusterPage(1);
          setClusterRows([pointFeature]);
          setDrawerOpen(true);
        }}
        onMouseMove={(e) => {
          const map = mapRef.current?.getMap?.();
          if (!map) return;

          const feats = map.queryRenderedFeatures(e.point, {
            layers: ["events-clusters", "events-unclustered", "events-points"],
          });

          if (!feats.length) {
            setHover(null);
            map.getCanvas().style.cursor = "";
            return;
          }

          const f: any =
            feats.find((x: any) => x.layer?.id === "events-clusters") ??
            feats.find((x: any) => x.layer?.id === "events-unclustered") ??
            feats[0];

          map.getCanvas().style.cursor = "pointer";

          const [lng, lat] = f.geometry.coordinates;

          setHover({
            lng,
            lat,
            isCluster: f.properties?.point_count != null,
            props: f.properties ?? {},
          });
        }}
        onMouseLeave={() => {
          const map = mapRef.current?.getMap?.();
          if (map) map.getCanvas().style.cursor = "";
          setHover(null);
        }}
      >
        <NavigationControl position="top-right" />

        <Source
          id="events-src"
          type="geojson"
          data={geo}
          cluster={true}
          clusterRadius={40}
          clusterMaxZoom={14}
          clusterProperties={{
            wifiCount: [
              "+",
              ["case", ["==", ["get", "source"], "beacon_message"], 1, 0],
            ],
            gnssCount: [
              "+",
              ["case", ["==", ["get", "source"], "gnss_message"], 1, 0],
            ],
            nrCount: [
              "+",
              ["case", ["==", ["get", "source"], "nr_message"], 1, 0],
            ],
            lteCount: [
              "+",
              ["case", ["==", ["get", "source"], "lte_message"], 1, 0],
            ],
            btCount: [
              "+",
              ["case", ["==", ["get", "source"], "bluetooth_message"], 1, 0],
            ],
            gsmCount: [
              "+",
              ["case", ["==", ["get", "source"], "gsm_message"], 1, 0],
            ],
            cdmaCount: [
              "+",
              ["case", ["==", ["get", "source"], "cdms_message"], 1, 0],
            ],
          }}
        >
          {/* POINTS */}
          <Layer
            id="events-points"
            type="circle"
            // events-points is filtered to NOT render cluster features
            filter={["!", ["has", "point_count"]]}
            layout={{ visibility: vis("points") }}
            paint={{
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                8,
                3,
                12,
                7,
                16,
                10,
              ],

              "circle-color": kindColorExpr,
              "circle-stroke-width": 1.5,
              "circle-stroke-color": "#0f172a",
              "circle-opacity": 0.95,
            }}
          />

          {/* HEATMAP */}
          <Layer
            id="events-heatmap"
            type="heatmap"
            layout={{ visibility: vis("heatmap") }}
            paint={{
              "heatmap-weight": heatmapWeightExpr,
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
            id="events-clusters"
            type="circle"
            filter={["has", "point_count"]}
            // events-clusters renders only features with point_count ✅
            layout={{ visibility: vis("cluster") }}
            paint={{
              "circle-color": clusterColorExpr,
              "circle-radius": clusterRadiusExpr,
              "circle-opacity": 0.9,
              "circle-stroke-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                8,
                0.5,
                14,
                1,
              ],

              "circle-stroke-color": "#0f172a",
            }}
          />

          {/* Unclustered points (cluster mode) */}
          <Layer
            id="events-unclustered"
            type="circle"
            // events-unclustered in cluster mode renders only non-cluster points ✅
            filter={["!", ["has", "point_count"]]}
            layout={{ visibility: vis("cluster") }}
            paint={{
              "circle-radius": 6,
              "circle-color": kindColorExpr,
              "circle-opacity": 0.75,
              "circle-stroke-width": 0.5,
              "circle-stroke-color": "#0f172a",
            }}
          />
        </Source>
        {hover && (
          <Popup
            longitude={hover.lng}
            latitude={hover.lat}
            closeButton={false}
            closeOnClick={false}
            anchor="top"
            offset={10}
          >
            <div
              style={{
                background: "rgba(2,6,23,0.92)",
                color: "#e2e8f0",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.25)",
                fontSize: 14,
                lineHeight: 1.35,
                width: 190,
              }}
            >
              {hover.isCluster ? (
                <>
                  {hover.props.wifiCount > 0 && (
                    <div>Wi-Fi: {hover.props.wifiCount}</div>
                  )}
                  {hover.props.nrCount > 0 && (
                    <div>5G (NR): {hover.props.nrCount}</div>
                  )}
                  {hover.props.lteCount > 0 && (
                    <div>LTE: {hover.props.lteCount}</div>
                  )}
                  {hover.props.gnssCount > 0 && (
                    <div>GNSS: {hover.props.gnssCount}</div>
                  )}
                  {hover.props.btCount > 0 && (
                    <div>Bluetooth: {hover.props.btCount}</div>
                  )}
                  {hover.props.gsmCount > 0 && (
                    <div>GSM: {hover.props.gsmCount}</div>
                  )}
                  {hover.props.cdmaCount > 0 && (
                    <div>CDMA: {hover.props.cdmaCount}</div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Point</div>
                  <div>
                    Type: {hover.props.source ?? hover.props.kind ?? "-"}
                  </div>
                  <div>Device: {hover.props.device_serial_number ?? "-"}</div>
                  <div>Time: {hover.props.timestamp ?? "-"}</div>
                </>
              )}
            </div>
          </Popup>
        )}
      </Map>
      {(loading || error) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(2, 6, 23, 0.55)", // optional dim background
            // pointerEvents: "auto", // 👈 CHANGE IS HERE
            zIndex: 10,
          }}
        >
          <div
            style={{
              pointerEvents: "auto",
              background: "rgba(2, 6, 23, 0.85)", // dark overlay
              color: "white",
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(148, 163, 184, 0.25)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              maxWidth: 360,
            }}
          >
            {loading && (
              <>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.35)",
                    borderTopColor: "white",
                    display: "inline-block",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                <span>Loading...</span>
              </>
            )}

            {!loading && error && (
              <span style={{ color: "#fca5a5" }}>Error: {error}</span>
            )}
          </div>
        </div>
      )}
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: "92vw", sm: 520, md: 550 }, // responsive width too
            bgcolor: "#0b1220",
            color: "#e2e8f0",
            borderRight: "1px solid rgba(148,163,184,0.15)",

            // ✅ responsive top gap (adjust these to match your sidebar/header)
            top: { xs: 72, sm: 80, md: 92 },
            height: {
              xs: "calc(100% - 72px)",
              sm: "calc(100% - 80px)",
              md: "calc(100% - 92px)",
            },

            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12, // nice when it floats
            boxShadow: "0 20px 40px rgba(0,0,0,0.45)",
          },
        }}
      >
        <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
              {activeClusterId ? "Cluster Events" : "Event"}
            </Typography>
            <Typography sx={{ fontSize: 12, color: "#94a3b8" }}>
              {activeClusterId
                ? `${activeClusterCount} total • showing ${clusterRows.length} on this page`
                : "Details for selected point"}
            </Typography>
          </Box>

          <IconButton
            onClick={() => setDrawerOpen(false)}
            sx={{ color: "#94a3b8" }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ px: 2, pb: 1 }}>
          {clusterLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={22} />
            </Box>
          ) : (
            <Box
              sx={{
                border: "1px solid rgba(148,163,184,0.15)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "rgba(148,163,184,0.06)" }}>
                    <TableCell sx={{ color: "#cbd5e1", fontSize: 12 }}>
                      Time
                    </TableCell>
                    <TableCell sx={{ color: "#cbd5e1", fontSize: 12 }}>
                      Device
                    </TableCell>
                    <TableCell sx={{ color: "#cbd5e1", fontSize: 12 }}>
                      Kind
                    </TableCell>
                    <TableCell sx={{ color: "#cbd5e1", fontSize: 12 }}>
                      Source
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {clusterRows.map((feat: any) => {
                    const p = feat?.properties ?? {};
                    const time = p.timestamp
                      ? formatTimestampCompact(p.timestamp)
                      : "-";

                    const device = p.device_serial_number ?? p.device ?? "-";
                    const kind = p.kind ?? p.network_type ?? "-";
                    const source = p.source ?? "-";

                    return (
                      <TableRow
                        key={
                          p.event_id ??
                          `${p.timestamp}-${p.device_serial_number}-${p.source}`
                        }
                      >
                        <TableCell
                          sx={{ color: "#e2e8f0", fontSize: 12, maxWidth: 160 }}
                        >
                          {String(time)}
                        </TableCell>
                        <TableCell sx={{ color: "#e2e8f0", fontSize: 12 }}>
                          {String(device)}
                        </TableCell>
                        <TableCell sx={{ color: "#e2e8f0", fontSize: 12 }}>
                          {String(kind)}
                        </TableCell>
                        <TableCell sx={{ color: "#e2e8f0", fontSize: 12 }}>
                          {String(source)}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {!clusterRows.length && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        sx={{ color: "#94a3b8", fontSize: 12, py: 2 }}
                      >
                        No rows
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          )}
        </Box>

        {/* Pagination only when cluster */}
        {activeClusterId && (
          <Box
            sx={{
              px: 2,
              pb: 2,
              pt: 1,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Pagination
              count={Math.max(1, Math.ceil(activeClusterCount / PAGE_SIZE))}
              page={clusterPage}
              onChange={(_, page) => {
                // load new page from the same cluster
                loadClusterPage(activeClusterId, activeClusterCount, page);
              }}
              size="small"
              sx={{
                "& .MuiPaginationItem-root": { color: "#cbd5e1" },
                "& .Mui-selected": {
                  bgcolor: "rgba(96,165,250,0.25) !important",
                },
              }}
            />
          </Box>
        )}
      </Drawer>

      {/* CSS for spinner */}
      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
