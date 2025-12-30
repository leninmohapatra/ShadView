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

type ViewMode = "points" | "heatmap" | "cluster"; // you can keep this for future; tiles use "points" style here

type HoverInfo = {
  lng: number;
  lat: number;
  props: any;
} | null;

const API_BASE = "https://shadowview-api-963619060579.us-central1.run.app";
const TILE_TEMPLATE = `${API_BASE}/tiles/{z}/{x}/{y}.pbf`;

// Make sure this exists in your env:
// NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxx
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

/** Format: 2025-12-19 23:57:16 UTC */
function formatTimestampCompact(ts?: string) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} UTC`;
}

/** UI toggles -> backend filter params (tile + bbox queries use same filters) */
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
    networkTypes.push("GPS");
    sources.push("gnss_message");
  }
  if (enabled.phone) sources.push("phone_state_message");

  return {
    sources: Array.from(new Set(sources)),
    networkTypes: Array.from(new Set(networkTypes)),
    devices: Array.from(new Set(devices)),
  };
}

function buildTileUrl(
  timeRange: { start: string; end: string },
  enabled: Record<string, boolean>
) {
  const { sources, networkTypes, devices } = buildEventQueryParams(enabled);

  const params = new URLSearchParams();
  params.set("start_time", timeRange.start);
  params.set("end_time", timeRange.end);

  if (sources.length) params.set("source", sources.join(","));
  if (networkTypes.length) params.set("network_type", networkTypes.join(","));
  if (devices.length) params.set("device", devices.join(","));

  // IMPORTANT: vector source expects template URL with {z}/{x}/{y}
  return `${TILE_TEMPLATE}?${params.toString()}`;
}

function padForZoom(z: number) {
  // degrees padding (rough heuristic) — tune
  if (z >= 14) return 0.005;
  if (z >= 12) return 0.01;
  if (z >= 10) return 0.02;
  if (z >= 8) return 0.05;
  return 0.2;
}

export default function MapView({
  enabledLayers,
  viewMode,
  timeRange,
}: {
  enabledLayers: Record<string, boolean>;
  viewMode: ViewMode;
  timeRange: { start: string; end: string };
}) {
  const mapRef = React.useRef<any>(null);

  const [hover, setHover] = React.useState<HoverInfo>(null);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [rowsLoading, setRowsLoading] = React.useState(false);
  const [rowsError, setRowsError] = React.useState<string | null>(null);

  const [rows, setRows] = React.useState<any[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [tilesLoading, setTilesLoading] = React.useState(false);

  const PAGE_SIZE = 50;

  // 1) Make timeRange safe (no undefined)
  const safeTimeRange = React.useMemo(
    () => ({
      start:
        timeRange?.start ??
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      end: timeRange?.end ?? new Date().toISOString(),
    }),
    [timeRange?.start, timeRange?.end]
  );

  // 2) Stable key to prevent unnecessary tile reloads if enabledLayers object identity changes
  const enabledKey = React.useMemo(
    () => JSON.stringify(enabledLayers ?? {}),
    [enabledLayers]
  );

  const tileUrl = React.useMemo(() => {
    const enabled = JSON.parse(enabledKey);
    return buildTileUrl(safeTimeRange, enabled);
  }, [safeTimeRange.start, safeTimeRange.end, enabledKey]);

  // Only tile layers need to be interactive
  const interactiveLayerIds = React.useMemo(
    () => ["tile-points", "tile-labels"],
    []
  );

  // --- Drawer data loader (bbox + pagination) ---
  const loadRowsByBBox = React.useCallback(
    async (bbox: [number, number, number, number], nextPage: number) => {
      const enabled = JSON.parse(enabledKey) as Record<string, boolean>;
      const { sources, networkTypes, devices } = buildEventQueryParams(enabled);

      const params = new URLSearchParams();
      params.set("start_time", safeTimeRange.start);
      params.set("end_time", safeTimeRange.end);

      params.set("bbox", bbox.join(",")); // minLng,minLat,maxLng,maxLat
      params.set("page", String(nextPage));
      params.set("page_size", String(PAGE_SIZE));

      if (sources.length) params.set("source", sources.join(","));
      if (networkTypes.length)
        params.set("network_type", networkTypes.join(","));
      if (devices.length) params.set("device", devices.join(","));

      const res = await fetch(`${API_BASE}/events?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());

      // Expected shapes (backend may vary):
      // A) { events: [...], total: 1234 }
      // B) { features: [...], total: 1234 }
      // C) { data: [...], total: 1234 }
      // D) [...] (array)
      const data = await res.json();
      const list =
        (Array.isArray(data?.events) && data.events) ||
        (Array.isArray(data?.features) && data.features) ||
        (Array.isArray(data?.data) && data.data) ||
        (Array.isArray(data) && data) ||
        [];

      const totalCount =
        Number(
          data?.total ?? data?.count ?? data?.total_count ?? list.length
        ) || 0;

      return { list, totalCount };
    },
    [PAGE_SIZE, enabledKey, safeTimeRange.start, safeTimeRange.end]
  );

  const openDrawerForTileFeature = React.useCallback(
    async (feature: any, map: any) => {
      const coords = feature?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return;

      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

      const z = map.getZoom?.() ?? 10;
      const pad = padForZoom(z);

      const bbox: [number, number, number, number] = [
        lng - pad,
        lat - pad,
        lng + pad,
        lat + pad,
      ];

      setDrawerOpen(true);
      setRowsError(null);
      setRowsLoading(true);
      setPage(1);

      try {
        const { list, totalCount } = await loadRowsByBBox(bbox, 1);
        setRows(list);
        setTotal(
          // prefer backend total, fallback to tile count property if provided
          totalCount || Number(feature?.properties?.count ?? list.length) || 0
        );
      } catch (err: any) {
        setRows([]);
        setTotal(0);
        setRowsError(err?.message ?? "Failed to load rows");
      } finally {
        setRowsLoading(false);
      }
    },
    [loadRowsByBBox]
  );

  // Keep last bbox so pagination can reuse it
  const lastBBoxRef = React.useRef<[number, number, number, number] | null>(
    null
  );

  const onClick = React.useCallback(
    async (e: any) => {
      const map = mapRef.current?.getMap?.();
      if (!map) return;

      const feats = map.queryRenderedFeatures(e.point, {
        layers: ["tile-points", "tile-labels"],
      });

      if (!feats.length) return;

      const f: any = feats[0];
      const coords = f?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return;

      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      const z = map.getZoom?.() ?? 10;
      const pad = padForZoom(z);

      const bbox: [number, number, number, number] = [
        lng - pad,
        lat - pad,
        lng + pad,
        lat + pad,
      ];
      lastBBoxRef.current = bbox;

      await openDrawerForTileFeature(f, map);
    },
    [openDrawerForTileFeature]
  );

  // --- Hover (throttled) ---
  const hoverRaf = React.useRef<number | null>(null);

  const onMouseMove = React.useCallback(
    (e: any) => {
      const map = mapRef.current?.getMap?.();
      if (!map) return;

      if (hoverRaf.current) return;
      hoverRaf.current = window.requestAnimationFrame(() => {
        hoverRaf.current = null;

        const feats = map.queryRenderedFeatures(e.point, {
          layers: ["tile-points", "tile-labels"],
        });

        if (!feats.length) {
          setHover(null);
          map.getCanvas().style.cursor = "";
          return;
        }

        const f: any = feats[0];
        const coords = f?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) {
          setHover(null);
          map.getCanvas().style.cursor = "";
          return;
        }

        const lng = Number(coords[0]);
        const lat = Number(coords[1]);

        map.getCanvas().style.cursor = "pointer";
        setHover({ lng, lat, props: f.properties ?? {} });
      });
    },
    [setHover]
  );

  const onMouseLeave = React.useCallback(() => {
    const map = mapRef.current?.getMap?.();
    if (map) map.getCanvas().style.cursor = "";
    setHover(null);
  }, []);

  // --- Tile layer styling ---
  const tileCircleRadius: any = [
    "interpolate",
    ["linear"],
    ["zoom"],
    0,
    2,
    10,
    6,
    14,
    10,
  ];

  const tileCircleColor: any = [
    "interpolate",
    ["linear"],
    ["coalesce", ["get", "count"], 1],
    1,
    "#60a5fa",
    10,
    "#34d399",
    50,
    "#fbbf24",
    200,
    "#f87171",
  ];

  // --- Popup dynamic counts (show only if > 0) ---
  const renderCounts = (p: any) => {
    const items: Array<[string, any]> = [
      ["Wi-Fi", p?.wifiCount],
      ["5G (NR)", p?.nrCount],
      ["LTE", p?.lteCount],
      ["GNSS", p?.gnssCount],
      ["Bluetooth", p?.btCount],
      ["GSM", p?.gsmCount],
      ["CDMA", p?.cdmaCount],
    ];

    const filtered = items.filter(([, v]) => Number(v) > 0);

    if (filtered.length) {
      return (
        <>
          {filtered.map(([label, value]) => (
            <div key={label}>
              {label}: {Number(value)}
            </div>
          ))}
        </>
      );
    }

    // Fallback: at least show total/bucket count
    return <div>Count: {p?.count != null ? Number(p.count) : "-"}</div>;
  };

  // Basic Mapbox token guard (prevents the “valid token required” crash loop)
  if (!TOKEN) {
    return (
      <div style={{ padding: 12, color: "#e2e8f0", background: "#0b1220" }}>
        Missing <code>NEXT_PUBLIC_MAPBOX_TOKEN</code>. Add it to your env and
        restart.
      </div>
    );
  }

  const showPagination = total > PAGE_SIZE;
  React.useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;

    let loadingCount = 0;

    const onDataLoading = () => {
      loadingCount++;
      setTilesLoading(true);
    };

    const onData = () => {
      loadingCount = Math.max(0, loadingCount - 1);
      if (loadingCount === 0) {
        setTilesLoading(false);
      }
    };

    map.on("dataloading", onDataLoading);
    map.on("data", onData);
    map.on("idle", () => setTilesLoading(false));

    return () => {
      map.off("dataloading", onDataLoading);
      map.off("data", onData);
      map.off("idle", () => setTilesLoading(false));
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {tilesLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(2,6,23,0.45)",
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(2,6,23,0.85)",
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.25)",
              color: "#e2e8f0",
              fontSize: 14,
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.35)",
                borderTopColor: "white",
                animation: "spin 0.8s linear infinite",
              }}
            />
            Loading...
          </div>
        </div>
      )}

      <Map
        ref={mapRef}
        mapboxAccessToken={TOKEN}
        initialViewState={{ longitude: -88.0256, latitude: 42.1524, zoom: 5 }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: "100%", height: "100%" }}
        interactiveLayerIds={interactiveLayerIds}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <NavigationControl position="top-right" />

        {/* Vector tile source */}
        {/* Mapbox loads tiles incrementally as you pan/zoom */}
        <Source
          id="events-tiles"
          type="vector"
          tiles={[tileUrl]}
          minzoom={0}
          maxzoom={14}
        >
          {/* Aggregated/bucket points from tiles */}
          <Layer
            id="tile-points"
            type="circle"
            source="events-tiles"
            source-layer="events"
            paint={{
              "circle-radius": tileCircleRadius,
              "circle-color": tileCircleColor,
              "circle-opacity": 0.85,
              "circle-stroke-width": 1,
              "circle-stroke-color": "#0f172a",
            }}
          />

          {/* Optional labels */}
          <Layer
            id="tile-labels"
            type="symbol"
            source="events-tiles"
            source-layer="events"
            minzoom={10}
            layout={{
              "text-field": ["to-string", ["coalesce", ["get", "count"], 0]],
              "text-size": 12,
            }}
            paint={{
              "text-color": "#0b1220",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1,
            }}
          />
        </Source>

        {/* Hover popup */}
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
                width: 210,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Bucket</div>
              {renderCounts(hover.props)}
            </div>
          </Popup>
        )}
      </Map>

      {/* Drawer */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: "92vw", sm: 520, md: 560 },
            bgcolor: "#0b1220",
            color: "#e2e8f0",
            borderRight: "1px solid rgba(148,163,184,0.15)",

            // responsive top gap (match your header/sidebar)
            top: { xs: 72, sm: 80, md: 92 },
            height: {
              xs: "calc(100% - 72px)",
              sm: "calc(100% - 80px)",
              md: "calc(100% - 92px)",
            },

            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12,
            boxShadow: "0 20px 40px rgba(0,0,0,0.45)",
          },
        }}
      >
        <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
              Events
            </Typography>
            <Typography sx={{ fontSize: 12, color: "#94a3b8" }}>
              {total
                ? `${total} total • showing ${rows.length}`
                : `Showing ${rows.length}`}
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
          {rowsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={22} />
            </Box>
          ) : rowsError ? (
            <Box sx={{ color: "#fca5a5", fontSize: 12, py: 2 }}>
              Error: {rowsError}
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
                    <TableCell
                      sx={{ color: "#cbd5e1", fontSize: 14, fontWeight: 600 }}
                    >
                      Time
                    </TableCell>
                    <TableCell
                      sx={{ color: "#cbd5e1", fontSize: 14, fontWeight: 600 }}
                    >
                      Device
                    </TableCell>
                    <TableCell
                      sx={{ color: "#cbd5e1", fontSize: 14, fontWeight: 600 }}
                    >
                      Kind
                    </TableCell>
                    <TableCell
                      sx={{ color: "#cbd5e1", fontSize: 14, fontWeight: 600 }}
                    >
                      Source
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {rows.map((row: any, idx: number) => {
                    // Supports either raw event objects OR GeoJSON features
                    const p = row?.properties ?? row ?? {};
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
                          `${p.timestamp}-${p.device_serial_number}-${idx}`
                        }
                      >
                        <TableCell
                          sx={{ color: "#e2e8f0", fontSize: 12, maxWidth: 180 }}
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

                  {!rows.length && (
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

        {/* Pagination (tiles mode uses bbox paging) */}
        {showPagination && (
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
              count={Math.max(1, Math.ceil(total / PAGE_SIZE))}
              page={page}
              onChange={async (_, nextPage) => {
                const bbox = lastBBoxRef.current;
                if (!bbox) return;

                setRowsLoading(true);
                setRowsError(null);

                try {
                  const { list, totalCount } = await loadRowsByBBox(
                    bbox,
                    nextPage
                  );
                  setRows(list);
                  setTotal(totalCount || total);
                  setPage(nextPage);
                } catch (err: any) {
                  setRows([]);
                  setRowsError(err?.message ?? "Failed to load rows");
                } finally {
                  setRowsLoading(false);
                }
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
