"use client";

import {
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  FormControlLabel,
  Link,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";

export default function LoginCard() {
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push("/");
  };

  return (
    <Card
      sx={{
        width: 420,
        p: 4,
        borderRadius: 3,
        backdropFilter: "blur(18px)",
        bgcolor: "background.paper",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: `
          inset 0 1px 0 rgba(255,255,255,0.06),
          0 30px 80px rgba(0,0,0,0.75)
        `,
      }}
    >
      {/* Header */}
      <Box textAlign="center" mb={3.5}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            mx: "auto",
            mb: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)",
          }}
        >
          <Typography fontSize={22}>🗺️</Typography>
        </Box>

        <Typography fontSize={22} fontWeight={600}>
          Shadow View
        </Typography>

        <Typography
          fontSize={14}
          color="text.secondary"
          mt={0.5}
        >
          Sign in to access the application
        </Typography>
      </Box>

      {/* Form */}
      <Box component="form" onSubmit={handleSubmit}>
        <Typography fontSize={13} mb={0.5}>
          Email
        </Typography>
        <TextField
          fullWidth
          placeholder="your.email@example.com"
          size="small"
          sx={{ mb: 2 }}
        />

        <Typography fontSize={13} mb={0.5}>
          Password
        </Typography>
        <TextField
          fullWidth
          type="password"
          placeholder="••••••••"
          size="small"
        />

        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          mt={1.5}
        >
          <FormControlLabel
            control={<Checkbox size="small" />}
            label={
              <Typography fontSize={13}>
                Remember me
              </Typography>
            }
          />

          <Link fontSize={13} underline="hover">
            Forgot password?
          </Link>
        </Box>

        <Button
          type="submit"
          fullWidth
          variant="contained"
          sx={{
            mt: 2.5,
            py: 1.3,
            fontWeight: 600,
            textTransform: "none",
            borderRadius: 2,
          }}
        >
          Sign In
        </Button>
      </Box>

      <Divider sx={{ my: 2.5, opacity: 0.15 }} />

      <Typography
        textAlign="center"
        fontSize={13}
        color="text.secondary"
      >
        Don’t have an account?{" "}
        <Link underline="hover">Request Access</Link>
      </Typography>


    </Card>
  );
}
