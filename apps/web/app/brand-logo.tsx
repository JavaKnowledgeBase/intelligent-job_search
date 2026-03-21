export function BrandLogo() {
  return (
    <div className="flex items-center gap-4 md:gap-6">
      <svg
        aria-hidden="true"
        className="h-20 w-20 md:h-28 md:w-28"
        viewBox="0 0 180 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="130" cy="28" r="10" fill="#2A93D5" />
        <circle cx="42" cy="150" r="14" fill="#2A9DDD" />
        <circle cx="148" cy="130" r="14" fill="#2A9DDD" />
        <circle cx="48" cy="42" r="15" fill="#B8B9BB" />
        <path
          d="M24 78C52 70 79 82 96 106"
          stroke="#5E5E60"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M62 30C77 58 100 76 144 82"
          stroke="#B8B9BB"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M30 62C58 86 81 108 90 138"
          stroke="#A5A7AA"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M76 118C97 106 120 106 145 112"
          stroke="#2A9DDD"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M90 118L125 153"
          stroke="#2383BD"
          strokeWidth="18"
          strokeLinecap="round"
        />
      </svg>

      <div className="leading-none">
        <p className="text-4xl font-semibold tracking-tight text-[#2A93D5] md:text-6xl">
          Torilaure
        </p>
        <p className="mt-1 text-3xl text-[#5A5A5D] md:mt-2 md:text-5xl">
          E-systems
        </p>
      </div>
    </div>
  );
}

