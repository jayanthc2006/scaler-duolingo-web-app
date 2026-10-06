export type MascotMood = "happy" | "cheer" | "sad" | "wave";

/** "Sprout": an original round green blob with a leaf, used for celebration and empty/error states. */
export function Mascot({ mood = "happy", size = 120 }: { mood?: MascotMood; size?: number }) {
  const sad = mood === "sad";
  const cheer = mood === "cheer";
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`Sprout the mascot looks ${mood}`} className={mood === "wave" || cheer ? "mascot-bounce" : undefined}>
      <ellipse cx="60" cy="112" rx="30" ry="5" fill="#000" opacity=".08" />
      {/* leaf */}
      <path d="M60 24c-2-12 6-20 20-20 0 14-8 22-20 20z" fill="#89e219" />
      <path d="M60 24c4-6 9-11 16-16" stroke="#58a700" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* body */}
      <path d="M60 22c-26 0-44 18-44 44 0 24 16 42 44 42s44-18 44-42c0-26-18-44-44-44z" fill="#58cc02" />
      <path d="M60 22c-26 0-44 18-44 44 0 4 .4 8 1.400 11.600 6 8 24 6 43-.6 20 1 34-4 41-11C100 40 82 22 60 22z" fill="#7be02d" opacity=".55" />
      <path d="M60 108c-28 0-44-18-44-42 0-2 .1-4 .4-6 4 20 20 34 43.600 34s39.600-14 43.600-34c.3 2 .4 4 .4 6 0 24-16 42-44 42z" fill="#58a700" opacity=".55" />
      {/* belly */}
      <ellipse cx="60" cy="82" rx="26" ry="20" fill="#d7ffb8" />
      {/* eyes */}
      <ellipse cx="44" cy="58" rx="12" ry="14" fill="#fff" />
      <ellipse cx="76" cy="58" rx="12" ry="14" fill="#fff" />
      <circle cx={sad ? 45 : 46} cy={sad ? 62 : 60} r="6" fill="#2b2b2b" />
      <circle cx={sad ? 75 : 74} cy={sad ? 62 : 60} r="6" fill="#2b2b2b" />
      <circle cx="48" cy={sad ? 59 : 57} r="2" fill="#fff" />
      <circle cx="77" cy={sad ? 59 : 57} r="2" fill="#fff" />
      {sad && <path d="M31 47l22-6M89 47l-22-6" stroke="#2b7a00" strokeWidth="3.500" strokeLinecap="round" />}
      {/* mouth */}
      {sad ? (
        <path d="M50 86c6-6 14-6 20 0" stroke="#2b2b2b" strokeWidth="4" fill="none" strokeLinecap="round" />
      ) : cheer ? (
        <path d="M48 78h24c0 10-6 16-12 16s-12-6-12-16z" fill="#7a2b2b" />
      ) : (
        <path d="M50 80c6 8 14 8 20 0" stroke="#2b2b2b" strokeWidth="4" fill="none" strokeLinecap="round" />
      )}
      {sad && <path d="M26 72c-3 6-3 10 0 12 3-2 3-6 0-12z" fill="#1cb0f6" />}
      {/* cheeks */}
      <circle cx="30" cy="78" r="5" fill="#ff86d0" opacity=".55" />
      <circle cx="90" cy="78" r="5" fill="#ff86d0" opacity=".55" />
      {/* arms */}
      {cheer || mood === "wave" ? (
        <>
          <path d="M18 70c-8-4-12-14-8-22" stroke="#58cc02" strokeWidth="9" fill="none" strokeLinecap="round" />
          <path d="M102 70c8-4 12-14 8-22" stroke="#58cc02" strokeWidth="9" fill="none" strokeLinecap="round" />
        </>
      ) : null}
    </svg>
  );
}
