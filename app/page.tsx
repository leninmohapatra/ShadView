"use client";

import React, { useState } from "react";
import {
  AppBar,
  Toolbar,
  Button,
  IconButton,
  TextField,
  InputAdornment,
  Chip,
  Switch,
  Avatar,
  Divider,
  Paper,
  Typography,
  Box,
  FormControl,
  Select,
  MenuItem,
} from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import PersonIcon from "@mui/icons-material/Person";
import SettingsIcon from "@mui/icons-material/Settings";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import LayersIcon from "@mui/icons-material/Layers";
import GridOnIcon from "@mui/icons-material/GridOn";
import EditIcon from "@mui/icons-material/Edit";
import StraightenIcon from "@mui/icons-material/Straighten";
import HistoryIcon from "@mui/icons-material/History";
import RefreshIcon from "@mui/icons-material/Refresh";
import AddIcon from "@mui/icons-material/Add";

import MapView from "@/components/MapView";

export default function Home() {
  const [activeTab, setActiveTab] = React.useState("map");
  const [viewMode, setViewMode] = React.useState<
    "points" | "heatmap" | "cluster"
  >("points");
  const [colorBy, setColorBy] = useState<"signal" | "type" | "security">(
    "signal"
  );

  const tabs = [
    { id: "map", label: "Map", icon: <MyLocationIcon fontSize="small" /> },
    { id: "table", label: "Table", icon: <GridOnIcon fontSize="small" /> },
    { id: "history", label: "History", icon: <HistoryIcon fontSize="small" /> },
  ];
  const [enabledLayers, setEnabledLayers] = useState<Record<string, boolean>>({
    wifi: false,
    lte: false,
    bluetooth: false,
    gnss: false,
  });

  const handleSwitchChange = (key: string) => {
    setEnabledLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  return (
    <Box
      sx={{
        height: "100vh",
        width: "100vw",
        bgcolor: "#020617",
        color: "white",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top classification bar */}
      <Box
        sx={{
          height: 28,
          bgcolor: "#059669",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Classification: UNCLASSIFIED//FOR OFFICIAL USE ONLY
      </Box>

      {/* TOP APP BAR */}
      {/* TOP APP BAR */}
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: "#020617",
          borderBottom: "1px solid #1e293b",
        }}
      >
        <Toolbar
          sx={{
            gap: 2,
            minHeight: 48,
            px: 2,
          }}
        >
          {/* BRAND */}
          <Typography
            variant="h6"
            sx={{ fontSize: 18, fontWeight: 600, mr: 1 }}
          >
            Shadow View
          </Typography>

          {/* MAP / TABLE / HISTORY - pill with icons */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              borderRadius: 3, // <-- was 999
              p: 0.15,
              bgcolor: "#111827",
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                borderRadius: 3,
                p: 0.15,
                bgcolor: "#111827",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  borderRadius: 3,
                  overflow: "hidden",
                  border: "1px solid #1e293b",
                  bgcolor: "#111827",
                }}
              >
                {tabs.map((tab) => (
                  <Button
                    key={tab.id}
                    startIcon={tab.icon}
                    onClick={() => setActiveTab(tab.id)}
                    sx={{
                      textTransform: "none",
                      fontSize: 13,
                      px: 2.5,
                      borderRadius: 0,
                      minHeight: 32,
                      fontWeight: activeTab === tab.id ? 600 : 500,
                      color: activeTab === tab.id ? "#f9fafb" : "#9ca3af",
                      bgcolor: activeTab === tab.id ? "#000000" : "transparent",
                      "&:hover": {
                        bgcolor:
                          activeTab === tab.id
                            ? "#000000"
                            : "rgba(15,23,42,0.8)",
                      },
                      "& .MuiButton-startIcon": { mr: 0.5 },
                    }}
                  >
                    {tab.label}
                  </Button>
                ))}
              </Box>
            </Box>
          </Box>

          {/* FILLER TO PUSH SEARCH TO CENTER */}
          <Box sx={{ width: 24 }} />

          {/* SEARCH + REFRESH + UPDATE */}
          <Box
            sx={{
              flex: 1,
              maxWidth: 700,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            <TextField
              fullWidth
              placeholder="Search..."
              size="small"
              variant="outlined"
              InputProps={{
                sx: {
                  bgcolor: "#111827",
                  color: "white",
                  borderRadius: 2,
                  fontSize: 13,
                  "& fieldset": { borderColor: "#1e293b" },
                  "&:hover fieldset": { borderColor: "#1f2937" },
                },
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ color: "#6b7280" }} />
                  </InputAdornment>
                ),
              }}
            />

            {/* circular refresh */}
            <Button
              variant="contained"
              startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
              sx={{
                textTransform: "none",
                fontSize: 12,
                fontWeight: 700,
                px: 3,
                height: 32,
                borderRadius: 2,
                bgcolor: "#2563eb",
                "&:hover": { bgcolor: "#1d4ed8" },
                "& .MuiButton-startIcon": {
                  marginRight: 0.75, // tighter spacing between icon & text
                },
              }}
            >
              UPDATE
            </Button>
          </Box>

          {/* USER ICON – circular blue */}
          <IconButton
            sx={{
              ml: 1,
              borderRadius: "50%",
              bgcolor: "#2563eb",
              "&:hover": { bgcolor: "#1d4ed8" },
            }}
          >
            <PersonIcon fontSize="small" />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* MAIN LAYOUT */}
      <Box sx={{ flex: 1, display: "flex" }}>
        {/* LEFT SIDEBAR */}
        <Box
          sx={{
            width: 280,
            borderRight: "1px solid #1e293b",
            p: 2,
            display: "flex",
            flexDirection: "column",
            gap: 3,
            bgcolor: "#020617",
          }}
        >
          {/* TITLE + ADD */}

          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography sx={{ fontSize: 16 }}>Data Sources</Typography>
            <IconButton
              size="small"
              sx={{
                bgcolor: "#1e293b",
                color: "white",
                "&:hover": { bgcolor: "#334155" },
              }}
            >
              <AddIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>

          {/* VIEW MODE */}
          <Box>
            <Typography sx={{ fontSize: 14, color: "#94a3b8", mb: 1 }}>
              View Mode
            </Typography>

            <Box
              sx={{
                display: "flex",
                borderRadius: 2,
                overflow: "hidden",
                border: "1px solid #1e293b",
                bgcolor: "#111827",
              }}
            >
              {[
                { id: "points", label: "Points" },
                { id: "heatmap", label: "Heatmap" },
                { id: "cluster", label: "Cluster" },
              ].map((mode) => (
                <Button
                  key={mode.id}
                  onClick={() => setViewMode(mode.id as any)}
                  sx={{
                    flex: 1,
                    textTransform: "none",
                    fontSize: 12,
                    height: 32,
                    borderRadius: 0,
                    fontWeight: viewMode === mode.id ? 700 : 500,
                    color: viewMode === mode.id ? "#f9fafb" : "#9ca3af",
                    bgcolor: viewMode === mode.id ? "#000000" : "transparent",
                    "&:hover": {
                      bgcolor:
                        viewMode === mode.id ? "#000000" : "rgba(15,23,42,0.8)",
                    },
                  }}
                >
                  {mode.label}
                </Button>
              ))}
            </Box>
          </Box>

          <Box>
            <Typography sx={{ fontSize: 14, color: "#94a3b8", mb: 1 }}>
              Color By
            </Typography>

            <Box sx={{ display: "flex", gap: 1 }}>
              {["signal", "type", "security"].map((mode) => (
                <Button
                  key={mode}
                  onClick={() => setColorBy(mode as any)}
                  variant={colorBy === mode ? "contained" : "outlined"}
                  size="small"
                  sx={{ fontSize: 11, flex: 1 }}
                >
                  {mode.toUpperCase()}
                </Button>
              ))}
            </Box>
          </Box>

          {/* CELLULAR */}
          <Box>
            <Box
              sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}
            >
              <Typography sx={{ fontSize: 16 }}>Cellular</Typography>
              <Typography sx={{ fontSize: 14, color: "#94a3b8" }}>
                7/7
              </Typography>
            </Box>
            {[
              {
                key: "wifi",
                label: "WiFi Networks",
                char: "WI",
                defaultEnabled: true,
              },
              {
                key: "lte",
                label: "LTE Cellular",
                char: "LT",
                defaultEnabled: false,
              },
              {
                key: "bluetooth",
                label: "Bluetooth",
                char: "BT",
                defaultEnabled: true,
              },
              {
                key: "gnss",
                label: "GNSS Satellites",
                char: "GP",
                defaultEnabled: false,
              },
              {
                key: "phone",
                label: "Phone State",
                char: "PH",
                defaultEnabled: false,
              },
            ].map((item) => (
              <Box
                key={item.key}
                sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Avatar
                    sx={{
                      width: 26,
                      height: 26,
                      bgcolor: "#1e293b",
                      fontSize: 13,
                    }}
                  >
                    {item.char}
                  </Avatar>
                  <Typography sx={{ fontSize: 14 }}>{item.label}</Typography>
                </Box>
                <Switch
                  size="small"
                  checked={enabledLayers[item.key]}
                  onChange={() => handleSwitchChange(item.key)}
                />
              </Box>
            ))}
          </Box>
     
          <Divider sx={{ borderColor: "#1e293b" }} />
          {/* BASE LAYERS + OVERLAYS */}
          {["Base Layers", "Overlays"].map((label) => (
            <Box
              key={label}
              sx={{ display: "flex", justifyContent: "space-between" }}
            >
              <Typography sx={{ fontSize: 16 }}>{label}</Typography>
              <Switch size="small" />
            </Box>
          ))}
        </Box>

        {/* MAP AREA */}
        <Box sx={{ flex: 1, position: "relative" }}>
          {/* Chips Row
          <Box
            sx={{
              position: "absolute",
              top: 10,
              left: 300,
              zIndex: 10,
              display: "flex",
              gap: 1,
            }}
          >
            <Chip
              size="small"
              label="SwiftTitan"
              color="warning"
              sx={{
                "& .MuiChip-label": {
                  fontSize: 10,
                },
              }}
            />
            <Chip
              size="small"
              label="Co-Traveler"
              color="warning"
              sx={{
                "& .MuiChip-label": {
                  fontSize: 10,
                },
              }}
            />
            <Chip
              size="small"
              label="Shadow WiFi"
              color="success"
              sx={{
                "& .MuiChip-label": {
                  fontSize: 10,
                },
              }}
            />
          </Box> */}

          <MapView
            enabledLayers={enabledLayers}
            viewMode={viewMode}
            colorBy={colorBy}
          />
        </Box>
      </Box>

      {/* BOTTOM BAR */}
      <Box
        sx={{
          height: 28,
          bgcolor: "#059669",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Classification: UNCLASSIFIED//FOR OFFICIAL USE ONLY
      </Box>
    </Box>
  );
}
