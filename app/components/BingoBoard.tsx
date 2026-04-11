"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCounter } from "../store/store";
import { api } from "./api";
import toast from "react-hot-toast";

/* -------------------- Types -------------------- */
interface Room {
  room_id: string;
  stake_amount: number;
  status: "pending" | "about_to_start" | "playing" | "claimed" | string;
  number_of_players: number;
  possible_win_cents: number;
  start_time?: string; // RFC3339
}

interface MePayload {
  balance_birr?: string; // e.g. "123.45"
  main_balance_birr?: string; // e.g. "67.89"
  balance?: number | string; // optional alt
  main_balance?: number | string; // optional alt
}

/* -------------------- Helpers -------------------- */
function parseNumberLoose(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function decodeJwtPayload<T = any>(token?: string | null): T | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/* -------------------- Component -------------------- */
const RELOAD_FLAG = "bingo_initial_reload_done";
const ROOMS_WS = "wss://topb.tabia.site";
const WS_BASE = "wss://topb.tabia.site";

const BingoBoard: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { setSockUrl } = useCounter() as any;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [me, setMe] = useState<MePayload | null>(null);

  // "now" tick to drive per-second countdowns
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const reload = () => {
    window.location.reload();
  };
  // Make sure we only ever trigger one initial reload (persisted in localStorage)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const already = localStorage.getItem(RELOAD_FLAG);
    if (!already) {
      localStorage.setItem(RELOAD_FLAG, "1");
      // Perform a single hard reload
      window.location.reload();
    }
  }, []);

  // Persist token if route is /login/<token>
  useEffect(() => {
    if (typeof window === "undefined") return;
    // e.g. /login/<JWT>
    const tokenFromPath = pathname?.split("/login/")[1];
    if (tokenFromPath && tokenFromPath.length > 10) {
      localStorage.setItem("token", tokenFromPath);
      localStorage.setItem("authToken", tokenFromPath);
    }
  }, [pathname]);

  // Fetch /me after we have a token
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = decodeJwtPayload<{ tid?: number }>(token);
    if (!payload?.tid) return;

    api
      .get(`/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setMe(res.data as MePayload))
      .catch((err) => {
        console.error("GET /me failed:", err?.response?.data || err?.message);
        toast.error("Failed to load your profile.");
      });
  }, [pathname]);

  // Rooms WebSocket
  useEffect(() => {
    const ws = new WebSocket(`${ROOMS_WS}/ws/rooms`);

    ws.onopen = () => {
      // optional: console.log("rooms ws connected");
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (Array.isArray(data)) {
          setRooms(data as Room[]);
        }
      } catch (e) {
        console.error("rooms ws parse error", e);
      }
    };
    ws.onerror = (e) => {
      console.error("rooms ws error", e);
    };
    ws.onclose = () => {
      // optional: console.log("rooms ws closed");
    };

    return () => ws.close();
  }, []);

  // Compute total balance safely
  const balance = useMemo(() => {
    const a = parseNumberLoose(me?.balance_birr ?? me?.balance);
    const b = parseNumberLoose(me?.main_balance_birr ?? me?.main_balance);
    return a + b;
  }, [me]);

  const remainingSeconds = (startTime?: string): number => {
    if (!startTime) return 0;
    const t = Date.parse(startTime);
    if (Number.isNaN(t)) return 0;
    const diff = Math.floor((t - now) / 1000);
    return Math.max(0, diff);
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const balanceDisplay =
    Number.isFinite(balance) && balance > 0
      ? balance.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })
      : String(balance);

  return (
    <div
      className="flex min-h-[100dvh] w-full flex-col overflow-x-hidden bg-[#C3A9D8] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] font-sans text-sm text-[#312E81]"
    >
      <header className="mx-auto mb-2 w-full max-w-lg shrink-0">
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          <div className="flex min-h-[2.65rem] flex-col justify-center gap-0 rounded-md border border-[#B39BC9] bg-white px-2 py-1.5 shadow-sm sm:min-h-[2.95rem] sm:px-2.5">
            <span className="text-[9px] font-semibold leading-tight text-[#312E81] sm:text-[10px]">
              Balance
            </span>
            <div className="flex items-center gap-1.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-4 w-4 shrink-0 text-[#EA580C]"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
                />
              </svg>
              <span className="truncate text-xs font-bold tabular-nums text-[#312E81] sm:text-sm">
                {balanceDisplay} ETB
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="flex min-h-[2.65rem] items-center justify-center gap-2 rounded-md border border-[#B39BC9] bg-white px-2 py-1.5 text-xs font-bold text-[#312E81] shadow-sm transition-opacity active:opacity-90 sm:min-h-[2.95rem] sm:text-sm"
            title="Refresh room list"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-4 w-4 text-[#EA580C]"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7m0 0L19.5 15.3m-3.182-3.184L19.5 15.3"
              />
            </svg>
            Refresh
          </button>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col px-0.5">
        <section
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/80 bg-white/15 shadow-sm backdrop-blur-[1px]"
          aria-label="Rooms"
        >
          <div className="grid grid-cols-5 items-center gap-0.5 bg-[#EA580C] px-1 py-2.5 text-center text-xs font-semibold text-white shadow-sm sm:gap-1 sm:px-2 sm:py-3 sm:text-sm">
            <div>Stake</div>
            <div>Active</div>
            <div>Players</div>
            <div>Derash</div>
            <div>Play</div>
          </div>

          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-1.5 sm:p-2">
            {rooms.length < 1 && (
              <div className="flex justify-center py-10">
                <div className="loader" aria-hidden />
              </div>
            )}

            <div className="flex flex-col gap-2.5 sm:gap-3">
              {[...rooms]
                .sort((a, b) => a.stake_amount - b.stake_amount)
                .filter((r) => Number(r.stake_amount) !== 100)
                .map((item) => {
                  const remaining = remainingSeconds(item.start_time);
                  const lowBalance = item.stake_amount > (balance || 0);
                  const isPlaying = item.status === "playing";

                  let statusLabel = "";
                  if (lowBalance) statusLabel = "Low balance";
                  else if (remaining > 0) statusLabel = `${remaining}s`;
                  else if (item.status === "claimed") statusLabel = "Finished";
                  else if (
                    item.status === "pending" ||
                    item.status === "about_to_start"
                  )
                    statusLabel = "Ready";
                  else statusLabel = item.status || "idle";

                  return (
                    <div key={item.room_id} className="relative pt-1">
                      {isPlaying && (
                        <div className="absolute left-1/2 top-0 z-10 flex -translate-x-1/2 -translate-y-1 items-center gap-1 rounded-full border border-[#B39BC9] bg-white px-2 py-0.5 shadow-sm">
                          <span className="text-xs font-bold text-[#EA580C] sm:text-sm">
                            Active game
                          </span>
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#EA580C] opacity-60" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#EA580C]" />
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-5 items-center gap-0.5 rounded-lg border border-[#B39BC9] bg-white px-1 py-3 text-center text-xs shadow-sm sm:gap-1 sm:px-2 sm:py-3.5 sm:text-sm md:text-base">
                        <div className="font-bold tabular-nums text-[#312E81]">
                          {item.stake_amount} ETB
                        </div>
                        <div
                          className={
                            isPlaying
                              ? "font-medium text-[#312E81]/55"
                              : remaining > 0
                                ? "font-bold tabular-nums text-[#EA580C]"
                                : lowBalance
                                  ? "font-medium text-red-700"
                                  : "font-medium text-[#312E81]"
                          }
                        >
                          {statusLabel}
                        </div>
                        <div className="tabular-nums text-[#312E81]">
                          {item.number_of_players}
                        </div>
                        <div className="tabular-nums text-[#312E81]">
                          {(item.possible_win_cents / 100 || 0).toLocaleString()}{" "}
                          ETB
                        </div>
                        <div className="flex justify-center">
                          <button
                            type="button"
                            disabled={isPlaying || lowBalance}
                            onClick={() => {
                              const token = localStorage.getItem("token") || "";
                              const wsUrl = `${WS_BASE}/ws/room/${encodeURIComponent(
                                item.room_id
                              )}?token=${encodeURIComponent(token)}`;

                              setSockUrl(wsUrl);
                              router.push(
                                `/board?room=${encodeURIComponent(item.room_id)}`
                              );
                            }}
                            className={`rounded-md px-2.5 py-1.5 text-xs font-bold shadow-sm sm:px-3.5 sm:py-2 sm:text-sm ${
                              isPlaying || lowBalance
                                ? "cursor-not-allowed bg-[#EDE7F3] text-gray-500 opacity-90"
                                : "bg-[#FF9F43] text-gray-900 ring-1 ring-black/10 active:opacity-90"
                            }`}
                          >
                            {isPlaying ? "Playing" : "Play"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>
      </div>

      <p className="shrink-0 py-1 text-center text-[10px] text-white/85 sm:text-xs">
        © Top Bingo 2025
      </p>
    </div>
  );
};

export default BingoBoard;
