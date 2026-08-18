import { createTheme } from "@mui/material/styles";

export const muiTheme = createTheme({
  palette: {
    primary: {
      light: "#14b8a6",
      main: "#0f766e",
      dark: "#115e59",
      contrastText: "#ffffff",
    },
    secondary: {
      light: "#1e3a5f",
      main: "#16324a",
      dark: "#0f2437",
      contrastText: "#ffffff",
    },
    error: { main: "#dc2626", light: "#fee2e2" },
    warning: { main: "#d97706", light: "#fef3c7" },
    success: { main: "#16a34a", light: "#dcfce7" },
    info: { main: "#14b8a6", light: "#effcfa" },
    background: { default: "#f8fafc", paper: "#ffffff" },
    text: { primary: "#1e293b", secondary: "#64748b" },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: "'Ubuntu', system-ui, -apple-system, sans-serif",
    h1: { fontFamily: "'Ubuntu', sans-serif", fontWeight: 700 },
    h2: { fontFamily: "'Ubuntu', sans-serif", fontWeight: 700 },
    h3: { fontFamily: "'Ubuntu', sans-serif", fontWeight: 700 },
    h4: { fontFamily: "'Ubuntu', sans-serif", fontWeight: 700 },
    h5: { fontFamily: "'Ubuntu', sans-serif", fontWeight: 700 },
    h6: { fontFamily: "'Ubuntu', sans-serif", fontWeight: 700 },
    button: { fontWeight: 700, textTransform: "none" },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { borderRadius: 18 },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { boxShadow: "none", borderBottom: "1px solid #e2e8f0" },
      },
    },
  },
});
