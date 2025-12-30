"use client";

import { Box } from "@mui/material";
import LoginCard from "@/components/LoginCard";

export default function LoginPage() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `
          radial-gradient(600px at 50% 10%, #0b1733 0%, transparent 60%),
          linear-gradient(180deg, #050914 0%, #020617 100%)
        `,
      }}
    >
      <LoginCard />
    </Box>
  );
}
