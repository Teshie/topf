"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import BingoBoard from "../components/BingoBoard";
import CurrentCall from "../components/CurrentCall";
import PlayerBoard from "../components/PlayerBoard";
import BingoNumbers from "../components/BingoNumbers";
import { useCounter } from "../store/store";
import { useRouter } from "next/navigation";
import NotifyBoard from "../components/NotifyBoard";
import toast from "react-hot-toast";
import { useBingoVoice } from "../hooks/useBingoVoice";

function SpeakerOnIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className ?? "size-5"}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"
      />
    </svg>
  );
}

function SpeakerOffIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className ?? "size-5"}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"
      />
    </svg>
  );
}

const GamePage: React.FC = () => {
  const {
    leaveGameWithZero,
    leaveGame,
    winners,
    finalGameDetails,
    roomHeaderData,
    reload,
    winnerBoard,
    winner,
    timeLeft,
    won,
    closeMessege,
    notification,
    claimBingo,
    calledNumbers,
    selectedBoardNumbers,
    startGame,
    userBoard,
    userBoard2, // 👈 ADD THIS
    claimResult, // from store
  } = useCounter();

  const router = useRouter();
  const [isUserInteracted, setIsUserInteracted] = useState<boolean>(false);
  const reloads = () => setIsUserInteracted((prev) => !prev);

  const playing = ["playing", "about_to_start"].includes(
    roomHeaderData?.status ?? ""
  );

  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setToken(localStorage.getItem("token") || null);
    }
  }, []);

  const redirectToGames = useCallback(() => {
    if (token) {
      const sanitizedToken = token.replace("}", "");
      router.push(`/login/${sanitizedToken}`);
    }
  }, [token, router]);

  const handleClose = useCallback(() => {
    sessionStorage.removeItem("hasReloaded");
    redirectToGames();
  }, [redirectToGames]);

  const handleLeave = () => {
    if (token) {
      leaveGameWithZero();
      sessionStorage.removeItem("hasReloaded");
      const sanitizedToken = token.replace("}", "");
      router.push(`/login/${sanitizedToken}`);
    }
  };

  // Countdown from RFC3339 start_time
  const futureTime = roomHeaderData?.start_time
    ? Date.parse(roomHeaderData.start_time)
    : 0;

  const calculateTimeLeft = () => {
    const nowUTC = Date.now();
    const difference = futureTime - nowUTC;
    return Math.max(Math.floor(difference / 1000), 0);
  };

  const [secondsLeft, setSecondsLeft] = useState<number>(calculateTimeLeft());

  useEffect(() => {
    const interval = setInterval(
      () => setSecondsLeft(calculateTimeLeft()),
      1000
    );
    return () => clearInterval(interval);
  }, [futureTime]);

  useEffect(() => {
    if ((closeMessege as any)?.error_messege) {
      toast(`📢: ${(closeMessege as any)?.error_messege}`);
    }
  }, [closeMessege]);

  const winnersCount = winners?.length || 0;

  const playAgainModalOpen =
    winnersCount > 0 || notification.title === "400";
  const [playAgainSeconds, setPlayAgainSeconds] = useState<number | null>(
    null
  );

  useEffect(() => {
    if (!playAgainModalOpen) {
      setPlayAgainSeconds(null);
      return;
    }
    let cancelled = false;
    let sec = 5;
    setPlayAgainSeconds(sec);
    const id = window.setInterval(() => {
      if (cancelled) return;
      sec -= 1;
      setPlayAgainSeconds(sec);
      if (sec <= 0) {
        window.clearInterval(id);
        if (!cancelled) handleClose();
      }
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [playAgainModalOpen, handleClose]);

  const playAgainButtonLabel =
    playAgainSeconds == null || playAgainSeconds > 0
      ? `${playAgainSeconds ?? 5}s…`
      : "Returning…";

  const lastNotificationRef = useRef<string | null>(null);
  useEffect(() => {
    const notificationKey = `${notification?.title}:${notification?.message}`;
    if (
      (notification?.title || notification?.message) &&
      notificationKey !== lastNotificationRef.current
    ) {
      toast(`📢: ${notification?.message}`, { style: { fontSize: "10px" } });
      lastNotificationRef.current = notificationKey;
    }
  }, [notification]);

  // Helper to format amounts nicely
  const fmt = (n?: number) =>
    typeof n === "number" && !Number.isNaN(n)
      ? n.toFixed(2).replace(/\.00$/, "")
      : n ?? "-";

  const [markedNumbers, setMarkedNumbers] = useState<number[]>([]);

  // Toggle mark for a number (shared across both boards)
  const handleNumberToggle = (num: number) => {
    setMarkedNumbers((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]
    );
  };

  // Winner display name for single-winner header
  const singleWinnerName =
    winnersCount === 1
      ? winners?.[0]?.user?.first_name ||
        winners?.[0]?.user?.username ||
        "Player"
      : null;
  const cols = Math.min(winnersCount || 0, 2) || 1;
  const gridCols = { 1: "grid-cols-1", 2: "grid-cols-2" }[cols];

  const {
    enableAudio,
    toggleMute,
    isMuted,
    isUserInteracted: voiceEnabled,
  } = useBingoVoice(calledNumbers);

  const secondCartelaId =
    userBoard2 ?? finalGameDetails?.user_board_number_2 ?? null;
  const hasSecondCartela =
    secondCartelaId != null && Number(secondCartelaId) > 0;

  return (
    <div
      className="main flex min-h-[100dvh] w-full max-w-[100vw] flex-col overflow-x-hidden pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-[max(0.25rem,env(safe-area-inset-top))] font-mono antialiased [-webkit-tap-highlight-color:transparent] [touch-action:manipulation]"
    >
      {winnersCount > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#F0D7FB]/88 p-3 font-sans backdrop-blur-[2px] sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="winner-modal-title"
        >
          <div className="flex max-h-[min(92dvh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border-2 border-[#C4A8D8] bg-white shadow-2xl">
            <header className="shrink-0 bg-[#F57C00] px-4 py-4 text-center sm:py-5">
              <h2
                id="winner-modal-title"
                className="text-2xl font-black uppercase tracking-wide text-white sm:text-3xl"
              >
                BINGO!
              </h2>
              {winnersCount === 1 && singleWinnerName ? (
                <p className="mt-2 text-sm leading-snug text-white sm:text-base">
                  <span className="inline-block rounded px-2 py-0.5 font-semibold text-white [box-decoration-break:clone] bg-[#2E7D32]">
                    {singleWinnerName}
                  </span>{" "}
                  has won the game!
                </p>
              ) : (
                <p className="mt-2 text-sm font-semibold text-white sm:text-base">
                  {winnersCount} winners!
                </p>
              )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#FAF7FC] px-3 py-3 sm:px-4 sm:py-4">
              {winnersCount > 1 && (
                <h3 className="mb-3 text-center text-base font-bold text-[#5C3D7A] sm:text-lg">
                  Winners
                </h3>
              )}
              <div className={`grid ${gridCols} gap-3`}>
                {winners?.map((entry: any, index: number) => {
                  const name =
                    entry?.user?.first_name ||
                    entry?.user?.username ||
                    "Player";
                  return (
                    <div
                      key={index}
                      className="flex flex-col items-center rounded-xl border-2 border-[#B39BC9] bg-white p-2 sm:p-3"
                    >
                      {winnersCount > 1 && (
                        <>
                          <h3 className="mb-1 text-center text-base font-bold text-[#5C3D7A]">
                            {name}
                          </h3>
                          <p className="mb-2 text-center text-sm text-gray-800">
                            Amount: {fmt(entry.win_amount)} Birr
                          </p>
                        </>
                      )}
                      {winnersCount === 1 && (
                        <p className="mb-3 text-center text-sm font-semibold text-gray-800">
                          Amount: {fmt(entry.win_amount)} Birr
                        </p>
                      )}
                      <div className="w-full min-w-0">
                        <NotifyBoard
                          userBoard={entry.winner_board_number}
                          isSmall={true}
                          matched_to={entry.matched_to}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              disabled
              className="shrink-0 w-full cursor-default rounded-none border-t border-[#E8C99A] bg-[#F57C00] px-4 py-3.5 text-lg font-bold text-white opacity-95 sm:py-4"
            >
              {playAgainButtonLabel}
            </button>
          </div>
        </div>
      )}
      {/* Not won modal (uses claimResult.matched_to if present) */}
      {notification.title === "400" && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="notify p-4 rounded-lg shadow-lg bg-gray-800  max-w-md">
            <p className="text-white text-lg font-semibold mb-2">
              Board Not Won
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-1 gap-2">
              <NotifyBoard
                userBoard={
                  finalGameDetails?.user_board_number ?? userBoard ?? 0
                }
                isSmall={true}
                matched_to={claimResult?.matched_to}
              />
            </div>
            <button
              type="button"
              disabled
              className="w-full mt-4 cursor-default p-2 text-lg font-bold bg-green-600 opacity-95 rounded"
            >
              {playAgainButtonLabel}
            </button>
          </div>
        </div>
      )}

      {/* Game stats + voice toggle (~30% smaller than prior) */}
      <div className="mb-1.5 flex w-full min-w-0 shrink-0 items-stretch gap-1 rounded-[10px] border border-white p-1 font-sans sm:mb-2 sm:gap-1.5 sm:rounded-[10px] sm:p-1.5">
        <div className="grid min-w-0 flex-1 grid-cols-5 gap-0.5 text-center sm:gap-1.5">
          {(
            [
              { label: "Game ID", value: roomHeaderData?.room_id?.split("-")[0] },
              { label: "Derash", value: fmt(roomHeaderData?.possible_win) },
              {
                label: "Players",
                value: roomHeaderData?.number_of_players ?? "-",
              },
              { label: "Bet", value: fmt(roomHeaderData?.stake_amount) },
              { label: "Call", value: calledNumbers?.length },
            ] as const
          ).map((item) => (
            <div
              key={item.label}
              className="flex min-w-0 flex-col items-center justify-center rounded-md border border-[#7E22CE] bg-white px-px py-1 shadow-sm sm:rounded-lg sm:px-0.5 sm:py-1.5"
            >
              <span className="text-[10px] font-medium leading-tight text-[#7E22CE] sm:text-xs">
                {item.label}
              </span>
              <span className="mt-px w-full truncate text-center text-xs font-bold text-[#312E81] sm:text-sm">
                {item.value ?? "-"}
              </span>
            </div>
          ))}
        </div>
        {!voiceEnabled ? (
          <button
            type="button"
            onClick={enableAudio}
            className="flex size-7 shrink-0 items-center justify-center self-center rounded-full bg-[#7E22CE] text-white shadow-sm transition-opacity active:opacity-90 sm:size-8"
            aria-label="Activate voice playback"
          >
            <SpeakerOnIcon className="size-3 sm:size-[1.125rem]" />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleMute}
            className="flex size-7 shrink-0 items-center justify-center self-center rounded-full bg-[#7E22CE] text-white shadow-sm transition-opacity active:opacity-90 sm:size-8"
            aria-label={
              isMuted ? "Unmute voice playback" : "Mute voice playback"
            }
          >
            {isMuted ? (
              <SpeakerOffIcon className="size-3 sm:size-[1.125rem]" />
            ) : (
              <SpeakerOnIcon className="size-3 sm:size-[1.125rem]" />
            )}
          </button>
        )}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 items-stretch gap-1.5 sm:gap-2">
        <div
          className="flex min-h-0 min-w-0 shrink-0 flex-col self-stretch"
          style={{
            width: "clamp(7.25rem, min(38vw, 12rem), 12rem)",
          }}
        >
          <BingoNumbers
            calledNumbers={calledNumbers}
            className="min-h-0 min-w-0 flex-1"
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-between overflow-x-visible overflow-y-visible">
          <div className="flex w-full flex-col items-stretch justify-center overflow-visible">
            <CurrentCall
              calledNumbers={calledNumbers}
              timeLeft={secondsLeft}
              status={roomHeaderData?.status}
            />
          </div>

          {/* Board 1 - Show actual board or placeholder */}
          <div className="">
            {true ? (
              <PlayerBoard
                userBoard={
                  userBoard ?? finalGameDetails?.user_board_number ?? null
                }
                markedNumbers={markedNumbers}
                calledNumbers={calledNumbers}
                onNumberClick={handleNumberToggle}
              />
            ) : (
              <div className="w-full boadr-main rounded-lg text-center ">
                <div className="flex justify-around mb-1">
                  <span className="bg-yellow-500 py-0.5 w-7 h-6 rounded text-xs">
                    B
                  </span>
                  <span className="bg-green-500 py-0.5 w-7 h-7 rounded text-xs">
                    I
                  </span>
                  <span className="bg-blue-500 py-0.5 w-7 h-7 rounded text-xs">
                    N
                  </span>
                  <span className="bg-orange-500 py-0.5 w-7 h-7 rounded text-xs">
                    G
                  </span>
                  <span className="bg-purple-500 py-0.5 w-7 h-7 rounded text-xs">
                    O
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-0.5 p-0.5 h-[180px]  flex items-center justify-center">
                  <div className="col-span-5 text-gray-400 text-sm">
                    Board One Here
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Board 2 — only when slot 2 is set on the server / store */}
          <div className="mt-1">
            {hasSecondCartela ? (
              <PlayerBoard
                userBoard={secondCartelaId}
                markedNumbers={markedNumbers}
                calledNumbers={calledNumbers}
                onNumberClick={handleNumberToggle}
              />
            ) : (
              <PlayerBoard
                userBoard={null}
                placeholderText="ካርቴላ ቁጥር ሁለት"
              />
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 flex w-full min-w-0 shrink-0 pb-1 font-sans sm:gap-2">
        <button
          type="button"
          disabled={calledNumbers?.length <= 3}
          onClick={claimBingo}
          className="flex min-h-[3rem] min-w-0 w-full items-center justify-center rounded-xl bg-[#F4A460] px-2 py-3 text-sm font-bold text-white shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-50 active:opacity-90 sm:min-h-[3.25rem] sm:py-3.5 sm:text-base md:text-lg"
        >
          BINGO!
        </button>
      </div>

      <div className="mt-2 flex w-full shrink-0 justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={handleLeave}
          disabled={calledNumbers?.length > 0}
          className="text-sm font-semibold text-[#312E81] underline decoration-[#7E22CE] underline-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Leave
        </button>
      </div>
    </div>
  );
};

export default GamePage;
