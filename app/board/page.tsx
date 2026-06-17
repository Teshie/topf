"use client";

import React, { useEffect, useMemo, useState } from "react";
import boards from "../data/board.json";
import { useRouter } from "next/navigation";
import { useCounter } from "../store/store";
import toast from "react-hot-toast";
import { api } from "../components/api";
import PlayerBoard from "../components/PlayerBoard";

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
    setPlayerBoard,
    resetPlayerBoards,
    setBoardNumber,
  } = useCounter();

  // local selection (up to 2 boards); sent to server only on Start Game
  const [selectedBoards, setSelectedBoards] = useState<number[]>([]);

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

  const toggleBoardSelection = (boardNumber: number) => {
    if (playing) {
      toast.error("Cannot change boards during play.");
      return;
    }

    setSelectedBoards((prev) => {
      if (prev.includes(boardNumber)) {
        return prev.filter((bn) => bn !== boardNumber);
      }
      if (prev.length < 2) {
        return [...prev, boardNumber];
      }
      return [prev[0], boardNumber];
    });
  };

  const handleStartGameClick = () => {
    if (cantPlay) {
      toast.error("Insufficient balance for this stake.");
      return;
    }

    const hasTakenBoard = selectedBoards.some((board) =>
      roomHeaderData?.selected_board_numbers?.includes(board)
    );

    if (hasTakenBoard) {
      toast.error("One of the selected boards is already taken.");
      return;
    }

    if (selectedBoards.length === 0) {
      toast.error("Please select at least one board first.");
      return;
    }

    resetPlayerBoards();

    selectedBoards.forEach((board, index) => {
      const slot = (index + 1) as 1 | 2;
      setBoardNumber(board, slot);
      setPlayerBoard(slot, board);
    });

    router.push("/game");
  };

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

  useEffect(() => {
    if (winner) {
      window.location.reload();
    }
  }, [winner]);

  const isWaiting =
    !playing &&
    !(roomHeaderData?.status === "about_to_start" && secondsLeft > 0);

  const renderCartelaButton = (boardNumber: number) => {
    const notPlaying = roomHeaderData?.status !== "playing";
    const isOccupiedInRoom =
      notPlaying &&
      roomHeaderData?.selected_board_numbers?.includes(boardNumber);

    const isSelectedByMe = selectedBoards.includes(boardNumber);
    const selectionIndex = selectedBoards.indexOf(boardNumber);

    const isDisabled = Boolean(isOccupiedInRoom && !isSelectedByMe);

    let cellClass =
      "relative flex aspect-square min-h-0 w-full min-w-0 items-center justify-center rounded-md border border-black/10 text-[11px] font-bold tabular-nums shadow-sm active:opacity-90 sm:text-xs md:text-sm ";
    if (isOccupiedInRoom && !isSelectedByMe) {
      cellClass += "bg-[#FF9F43] text-black";
    } else if (isSelectedByMe) {
      cellClass += "bg-green-600 text-white ring-1 ring-black/20";
    } else {
      cellClass += "bg-[#EDE7F3] text-gray-900";
    }
    if (isDisabled) cellClass += " cursor-not-allowed opacity-80";

    return (
      <button
        key={boardNumber}
        type="button"
        onClick={() => {
          if (!isDisabled) toggleBoardSelection(boardNumber);
        }}
        className={cellClass}
        disabled={isDisabled}
        title={
          isDisabled
            ? "Board already taken"
            : isSelectedByMe
              ? `Selected as board ${selectionIndex + 1}`
              : "Select board"
        }
      >
        {boardNumber}
        {isSelectedByMe && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/55 text-[8px] font-bold text-white sm:h-4 sm:w-4 sm:text-[9px]">
            {selectionIndex + 1}
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
  const countdownDisplay = playing
    ? "0"
    : secondsLeft > 0
      ? String(secondsLeft)
      : "—";

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-[#C3A9D8] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] font-sans">
      <header className="mx-auto mb-1 w-full max-w-lg shrink-0">
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

      <div className="mx-auto mt-2 flex h-[50dvh] min-h-0 w-full max-w-lg shrink-0 flex-col px-1">
        <section
          className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/80 sm:rounded-xl"
          aria-label="Cartela numbers"
        >
          <div className="no-scrollbar h-full min-h-0 overflow-y-auto overscroll-y-contain p-1.5 [-webkit-overflow-scrolling:touch] sm:p-2">
            <div className="grid grid-cols-9 gap-1 sm:gap-1.5">
              {boards.map((_, i) => renderCartelaButton(i + 1))}
            </div>
          </div>
        </section>
      </div>

      {selectedBoards.length > 0 && (
        <div
          className="mx-auto mt-2 flex w-full max-w-lg shrink-0 flex-wrap items-start justify-center gap-1.5 px-1"
          aria-label="Selected cartela previews"
        >
          {selectedBoards.map((id) => (
            <PlayerBoard
              key={id}
              userBoard={id}
              variant="compact"
              readOnly
            />
          ))}
        </div>
      )}

      <div className="mx-auto mt-2 flex w-full max-w-lg shrink-0 justify-between gap-3 px-1">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 rounded-full bg-[#312E81] px-4 py-2.5 text-sm font-bold text-white shadow-sm active:opacity-90 sm:py-2"
        >
          Back
        </button>
        <button
          type="button"
          disabled={playing || selectedBoards.length === 0 || isWaiting}
          onClick={handleStartGameClick}
          className="flex-1 rounded-full bg-[#FF9F43] px-4 py-2.5 text-sm font-bold text-gray-900 shadow-sm ring-1 ring-black/10 active:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:py-2"
        >
          Start Game
        </button>
      </div>

      <div className="min-h-0 flex-1" aria-hidden />

      <p className="shrink-0 py-1 text-center text-[10px] text-white/85 sm:text-xs">
        © Top Bingo 2024
      </p>
    </div>
  );
};

export default BingoBoard;
