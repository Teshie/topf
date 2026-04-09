// lib/api.ts
import axios from "axios";

export const API_BASE = "https://topb.tabia.site";

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "ngrok-skip-browser-warning": "true",
  },
});
