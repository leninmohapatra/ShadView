import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#050914",
      paper: "rgba(15, 23, 42, 0.85)",
    },
    primary: {
      main: "#2563eb",
    },
    text: {
      primary: "#e5e7eb",
      secondary: "#9aa4b2",
    },
  },
  shape: {
    borderRadius: 12,
  },
});
