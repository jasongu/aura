interface P { size?: number }
const S = (size = 18) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
});

export const IconGrid = ({ size }: P) => (
  <svg {...S(size)}><path d="M4 4h7v7H4zM13 4h7v7h-7zM13 13h7v7h-7zM4 13h7v7H4z" /></svg>
);
export const IconTrend = ({ size }: P) => (
  <svg {...S(size)}><path d="M4 5v14h16M8 14l3-4 3 2 4-6" /></svg>
);
export const IconBowl = ({ size }: P) => (
  <svg {...S(size)}><path d="M4 11h16a8 8 0 01-16 0zM9 7c0-2 2-2 2-4M14 7c0-2 2-2 2-4" /></svg>
);
export const IconSpark = ({ size }: P) => (
  <svg {...S(size)}><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" /></svg>
);
export const IconUser = ({ size }: P) => (
  <svg {...S(size)}><path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-6 8-6s8 2 8 6" /></svg>
);
export const IconMoon = ({ size }: P) => (
  <svg {...S(size)}><path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" /></svg>
);
export const IconScale = ({ size }: P) => (
  <svg {...S(size)}><path d="M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM8 8a6 6 0 008 0M12 8v3" /></svg>
);
export const IconRun = ({ size }: P) => (
  <svg {...S(size)}><path d="M13 5a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0zM5 20l4-3 1-4-2 1-2 3M10 13l1-5 4-1 3 3 3 1M11 8l-4 2" /></svg>
);
export const IconFlame = ({ size }: P) => (
  <svg {...S(size)}><path d="M12 3s5 4 5 9a5 5 0 01-10 0c0-2 1-3.5 2-5 0 2 1 3 2 3 0-3 1-7 1-7z" /></svg>
);
export const IconRing = ({ size }: P) => (
  <svg {...S(size)}><path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 5a4 4 0 100 8 4 4 0 000-8z" /></svg>
);
export const IconSend = ({ size }: P) => (
  <svg {...S(size)}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>
);
export const IconRefresh = ({ size }: P) => (
  <svg {...S(size)}><path d="M21 12a9 9 0 11-2.6-6.4M21 3v6h-6" /></svg>
);
export const IconCheck = ({ size }: P) => (
  <svg {...S(size)}><path d="M20 6L9 17l-5-5" /></svg>
);
export const IconTrash = ({ size }: P) => (
  <svg {...S(size)}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
);
export const IconClock = ({ size }: P) => (
  <svg {...S(size)}><path d="M12 3a9 9 0 100 18 9 9 0 000-18zM12 12l3.5-4" /></svg>
);
export const IconOut = ({ size }: P) => (
  <svg {...S(size)}><path d="M15 3h6v6M21 3l-9 9M12 5H5v14h14v-7" /></svg>
);
