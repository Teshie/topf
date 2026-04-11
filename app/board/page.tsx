"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import boards from "../data/board.json";
import { useRouter } from "next/navigation";
import { useCounter } from "../store/store";
import toast from "react-hot-toast";
import { api } from "../components/api";

/** `/me` payload — same wallet fields as the lobby screen */
interface MePayload {
  balance_birr?: string;
  main_balance_birr?: string;
  balance?: number | string;
  main_balance?: number | string;
}

function parseNumberLoose(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function selectionsEqual(a: number[], b: number[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function computeNextSelection(prev: number[], boardNumber: number): number[] {
  if (prev.includes(boardNumber)) {
    if (prev.length === 1) return [];
    if (prev.length === 2) {
      const idx = prev.indexOf(boardNumber);
      if (idx === 0) return [prev[1]];
      return [prev[0]];
    }
    return prev;
  }
  if (prev.length === 0) return [boardNumber];
  if (prev.length === 1) return [prev[0], boardNumber];
  /* Already have two distinct boards — do not swap in a third; user must deselect first. */
  return prev;
}

type BoardApi = {
  clearBoard: (slot: 1 | 2) => void;
  resetPlayerBoards: () => void;
  setBoardNumber: (n: number, slot?: 1 | 2) => void;
  setPlayerBoard: (slot?: 1 | 2, board?: number) => void;
};

function syncBoardsToServer(
  prev: number[],
  next: number[],
  boardNumber: number,
  api: BoardApi
) {
  if (selectionsEqual(prev, next)) return;

  const wasSelected = prev.includes(boardNumber);
  const nowSelected = next.includes(boardNumber);

  if (wasSelected && !nowSelected) {
    if (prev.length === 1) {
      api.clearBoard(1);
      return;
    }
    if (prev.length === 2) {
      const idx = prev.indexOf(boardNumber);
      if (idx === 0) {
        const keep = next[0];
        api.resetPlayerBoards();
        api.setBoardNumber(keep, 1);
        api.setPlayerBoard(1, keep);
        return;
      }
      api.clearBoard(2);
      return;
    }
  }

  if (!wasSelected && nowSelected) {
    if (next.length === 1) {
      api.setBoardNumber(boardNumber, 1);
      api.setPlayerBoard(1, boardNumber);
      return;
    }
    if (next.length === 2 && next[1] === boardNumber) {
      api.setBoardNumber(boardNumber, 2);
      api.setPlayerBoard(2, boardNumber);
    }
  }
}

interface BingoBoardProps {
  wallet?: number;
  activeGame?: number;
  stake?: number;
}

const BingoBoard: React.FC<BingoBoardProps> = ({}) => {
  const router = useRouter();

  const {
    winner,
    balance,
    roomHeaderData,
    userBoard,
    userBoard2,
    setPlayerBoard,
    resetPlayerBoards,
    setBoardNumber,
    clearBoard,
  } = useCounter();

  // local selection (up to 2 boards), kept in sync with WebSocket via syncBoardsToServer
  const [selectedBoards, setSelectedBoards] = useState<number[]>([]);
  const selectedBoardsRef = useRef<number[]>([]);
  useEffect(() => {
    selectedBoardsRef.current = selectedBoards;
  }, [selectedBoards]);

  const [meProfile, setMeProfile] = useState<MePayload | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("token");
    if (!token) return;

    api
      .get("/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setMeProfile(res.data as MePayload))
      .catch((err) => {
        console.warn("GET /me (board page):", err?.response?.data || err?.message);
      });
  }, []);

  const meWalletTotal = useMemo(() => {
    if (!meProfile) return undefined;
    const hasField =
      meProfile.balance_birr != null ||
      meProfile.main_balance_birr != null ||
      meProfile.balance != null ||
      meProfile.main_balance != null;
    if (!hasField) return undefined;
    const a = parseNumberLoose(meProfile.balance_birr ?? meProfile.balance);
    const b = parseNumberLoose(
      meProfile.main_balance_birr ?? meProfile.main_balance
    );
    return a + b;
  }, [meProfile]);

  /** Prefer live room WS balance; fall back to `/me` wallet total for the header. */
  const effectiveWalletBalance =
    typeof balance === "number" && Number.isFinite(balance)
      ? balance
      : meWalletTotal;

  const playing = roomHeaderData?.status === "playing";
  const stakeAmount = roomHeaderData?.stake_amount;
  /** Only block when we actually know balance from WS or /me. */
  const cantPlay =
    typeof effectiveWalletBalance === "number" &&
    Number.isFinite(effectiveWalletBalance) &&
    Number(stakeAmount ?? 0) > effectiveWalletBalance;

  const futureTime = roomHeaderData?.start_time
    ? Date.parse(roomHeaderData.start_time)
    : 0;

  const calculateTimeLeft = () => {
    const nowUTC = Date.now();
    const difference = futureTime - nowUTC;
    return Math.max(Math.floor(difference / 1000), 0);
  };

  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    Math.max(Math.floor((futureTime - Date.now()) / 1000), 0)
  );

  useEffect(() => {
    setSecondsLeft(calculateTimeLeft());
    const interval = setInterval(
      () => setSecondsLeft(calculateTimeLeft()),
      1000
    );
    return () => clearInterval(interval);
  }, [futureTime]);

  const boardApi: BoardApi = {
    clearBoard,
    resetPlayerBoards,
    setBoardNumber,
    setPlayerBoard,
  };

  /** Select/deselect a board and immediately tell the server (set_board / set_board_2). */
  const handleBoardClick = (boardNumber: number, isDisabled: boolean) => {
    if (isDisabled) return;

    if (cantPlay) {
      toast.error("Insufficient balance for this stake.");
      return;
    }
    if (playing) {
      toast.error("Cannot change boards during play.");
      return;
    }

    const prev = selectedBoardsRef.current;
    const merged = new Set<number>();
    prev.forEach((n) => merged.add(n));
    if (userBoard != null && userBoard >= 1) merged.add(userBoard);
    if (userBoard2 != null && userBoard2 >= 1) merged.add(userBoard2);
    if (merged.size >= 2 && !merged.has(boardNumber)) {
      toast.error("You already have two boards.");
      return;
    }

    const next = computeNextSelection(prev, boardNumber);
    if (selectionsEqual(prev, next)) return;

    syncBoardsToServer(prev, next, boardNumber, boardApi);
    selectedBoardsRef.current = next;
    setSelectedBoards(next);
  };

  /** Auto-enter game when pre-game countdown shows 1s, or when the round is already playing. */
  const autoGameRedirectRef = useRef(false);
  useEffect(() => {
    if (cantPlay || selectedBoards.length === 0) return;

    const status = roomHeaderData?.status;
    const goAtOne =
      status === "about_to_start" && secondsLeft === 1;
    const alreadyPlaying = status === "playing";

    if (!(goAtOne || alreadyPlaying)) return;
    if (autoGameRedirectRef.current) return;
    autoGameRedirectRef.current = true;
    router.push("/game");
  }, [
    roomHeaderData?.status,
    secondsLeft,
    selectedBoards.length,
    cantPlay,
    router,
  ]);

  // Optional: reload when a winner is announced
  useEffect(() => {
    if (winner) {
      window.location.reload();
    }
  }, [winner]);

  const renderCartelaButton = (boardNumber: number) => {
    const notPlaying = roomHeaderData?.status !== "playing";
    const isOccupiedInRoom =
      notPlaying &&
      roomHeaderData?.selected_board_numbers?.includes(boardNumber);

    const isMine =
      selectedBoards.includes(boardNumber) ||
      userBoard === boardNumber ||
      userBoard2 === boardNumber;
    const selectionIndex = selectedBoards.indexOf(boardNumber);

    const mergedMine = new Set<number>();
    selectedBoards.forEach((n) => mergedMine.add(n));
    if (userBoard != null && userBoard >= 1) mergedMine.add(userBoard);
    if (userBoard2 != null && userBoard2 >= 1) mergedMine.add(userBoard2);
    const atMaxSelection =
      mergedMine.size >= 2 && !mergedMine.has(boardNumber);

    /* Selected cartelas are fixed — no second click to deselect. */
    const isDisabled = Boolean(
      (isOccupiedInRoom && !isMine) || atMaxSelection || isMine
    );

    let cellClass =
      "relative flex aspect-square min-h-0 w-full min-w-0 items-center justify-center rounded-md border border-black/10 text-[11px] font-bold tabular-nums shadow-sm active:opacity-90 sm:text-xs md:text-sm ";
    if (isOccupiedInRoom && !isMine) {
      cellClass += "bg-[#FF9F43] text-black";
    } else if (isMine) {
      cellClass += "bg-green-600 text-white ring-1 ring-black/20";
    } else {
      cellClass += "bg-[#EDE7F3] text-gray-900";
    }
    if (isDisabled)
      cellClass += ` cursor-not-allowed${isMine ? "" : " opacity-80"}`;

    return (
      <button
        key={boardNumber}
        type="button"
        onClick={() => handleBoardClick(boardNumber, isDisabled)}
        className={cellClass}
        disabled={isDisabled}
        title={
          isDisabled
            ? isOccupiedInRoom && !isMine
              ? "Board already taken"
              : isMine
                ? selectionIndex >= 0
                  ? `Selected as board ${selectionIndex + 1}`
                  : "Your cartela"
                : atMaxSelection
                  ? "You already have two boards"
                  : "Board already taken"
            : "Select board"
        }
      >
        {boardNumber}
        {isMine && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/55 text-[8px] font-bold text-white sm:h-4 sm:w-4 sm:text-[9px]">
            {selectionIndex >= 0
              ? selectionIndex + 1
              : userBoard === boardNumber
                ? 1
                : 2}
          </span>
        )}
      </button>
    );
  };

  const userBalanceDisplay =
    typeof effectiveWalletBalance === "number" &&
    Number.isFinite(effectiveWalletBalance)
      ? effectiveWalletBalance.toLocaleString()
      : "—";
  const walletLine =
    userBalanceDisplay === "—"
      ? "—"
      : `${userBalanceDisplay} ETB`;
  const stakeDisplay =
    roomHeaderData?.stake_amount != null &&
    !Number.isNaN(Number(roomHeaderData.stake_amount))
      ? String(roomHeaderData.stake_amount)
      : "—";
  const stakeLine =
    stakeDisplay === "—" ? "—" : `${stakeDisplay} ETB`;
  /** Seconds until start (from room `start_time`); 0 while the round is playing. */
  const countdownDisplay = playing
    ? "0"
    : secondsLeft > 0
      ? String(secondsLeft)
      : "—";

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-[#C3A9D8] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] font-sans">
      <header className="mx-auto mb-1 w-full max-w-lg shrink-0">
        {/** Header tiles: ~59% of prior box scale (area feel); min-heights × 0.59 */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          <div
            className="flex min-h-[2.65rem] items-center justify-center rounded-md border border-[#B39BC9] bg-white px-0.5 py-1 shadow-sm sm:min-h-[2.95rem]"
            title="Seconds until the game starts"
          >
            <span className="text-lg font-bold leading-none text-[#EA580C] tabular-nums sm:text-xl">
              {countdownDisplay}
            </span>
          </div>
          <div className="flex min-h-[2.65rem] flex-col items-center justify-center gap-0 rounded-md border border-[#B39BC9] bg-white px-0.5 py-1 text-center shadow-sm sm:min-h-[2.95rem]">
            <span className="text-[9px] font-semibold leading-tight text-[#312E81] sm:text-[10px]">
              Wallet
            </span>
            <span className="max-w-full truncate text-xs font-bold leading-tight text-[#312E81] tabular-nums sm:text-sm">
              {walletLine}
            </span>
          </div>
          <div className="flex min-h-[2.65rem] flex-col items-center justify-center gap-0 rounded-md border border-[#B39BC9] bg-white px-0.5 py-1 text-center shadow-sm sm:min-h-[2.95rem]">
            <span className="text-[9px] font-semibold leading-tight text-[#312E81] sm:text-[10px]">
              Stake
            </span>
            <span className="max-w-full truncate text-xs font-bold leading-tight text-[#312E81] tabular-nums sm:text-sm">
              {stakeLine}
            </span>
          </div>
        </div>
      </header>

      {/* Single grey box; inner area scrolls (scrollbar hidden). */}
      <div className="mx-auto mt-2 flex min-h-0 w-full max-w-lg flex-1 flex-col px-1">
        <section
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/80 sm:rounded-xl"
          aria-label="Cartela numbers"
        >
          <div
            className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-1.5 [-webkit-overflow-scrolling:touch] sm:p-2"
          >
            <div className="grid grid-cols-9 gap-1 sm:gap-1.5">
              {boards.map((_, i) => renderCartelaButton(i + 1))}
            </div>
          </div>
        </section>
      </div>

      <p className="shrink-0 py-1 text-center text-[10px] text-white/85 sm:text-xs">
        © Top Bingo 2024
      </p>
    </div>
  );
};

export default BingoBoard;
