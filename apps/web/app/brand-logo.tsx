type BrandLogoProps = {
  compact?: boolean;
  iconOnly?: boolean;
};

export function BrandLogo({ compact = false, iconOnly = false }: BrandLogoProps) {
  if (compact) {
    return (
      <div
        className={`inline-flex max-w-full items-center rounded-[1.05rem] border border-[rgba(24,36,53,0.08)] bg-white/75 backdrop-blur-sm ${
          iconOnly ? "px-2.5 py-2" : "gap-2.5 px-2.5 py-2"
        }`}
      >
        <div className="shrink-0">
          <svg
            aria-hidden="true"
            className="h-10 w-10 md:h-11 md:w-11"
            viewBox="0 0 170 170"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="119" cy="31" r="9" fill="#B4B7BB" />
            <circle cx="37" cy="133" r="11" fill="#2B97D5" />
            <circle cx="132" cy="92" r="11" fill="#2B97D5" />
            <path d="M18 86C35 72 57 72 76 83" stroke="#55575A" strokeWidth="14" strokeLinecap="round" />
            <path d="M34 78C54 98 71 118 89 149" stroke="#A9ABAE" strokeWidth="15" strokeLinecap="round" />
            <path d="M56 34C66 62 84 81 111 90" stroke="#8D8D8D" strokeWidth="16" strokeLinecap="round" />
            <path d="M36 133C50 94 80 79 120 82" stroke="#2B97D5" strokeWidth="15" strokeLinecap="round" />
            <path d="M84 104L113 133" stroke="#1F7FB7" strokeWidth="15" strokeLinecap="round" />
          </svg>
        </div>

        {iconOnly ? null : (
          <div className="min-w-0 leading-none">
            <p className="text-[1.18rem] font-semibold tracking-[-0.05em] text-[#2B97D5] md:text-[1.28rem]">
              CareerPaq
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex max-w-full items-center gap-3 rounded-[1.6rem] border border-white/12 bg-white/10 px-4 py-3 backdrop-blur-md md:gap-4 md:px-5">
      <div className="shrink-0">
        <svg
          aria-hidden="true"
          className="h-16 w-16 md:h-[4.6rem] md:w-[4.6rem]"
          viewBox="0 0 170 170"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="119" cy="31" r="9" fill="#B4B7BB" />
          <circle cx="37" cy="133" r="11" fill="#2B97D5" />
          <circle cx="132" cy="92" r="11" fill="#2B97D5" />
          <path
            d="M18 86C35 72 57 72 76 83"
            stroke="#55575A"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M34 78C54 98 71 118 89 149"
            stroke="#A9ABAE"
            strokeWidth="15"
            strokeLinecap="round"
          />
          <path
            d="M56 34C66 62 84 81 111 90"
            stroke="#8D8D8D"
            strokeWidth="16"
            strokeLinecap="round"
          />
          <path
            d="M36 133C50 94 80 79 120 82"
            stroke="#2B97D5"
            strokeWidth="15"
            strokeLinecap="round"
          />
          <path
            d="M84 104L113 133"
            stroke="#1F7FB7"
            strokeWidth="15"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="min-w-0 leading-none">
        <p className="text-[2.2rem] font-semibold tracking-[-0.05em] text-[#2B97D5] md:text-[3.2rem]">
          CareerPaq
        </p>
      </div>
    </div>
  );
}
