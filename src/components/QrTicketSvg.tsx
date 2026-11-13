import React from 'react';

interface QrTicketSvgProps {
  value: string;
  size?: number;
  className?: string;
}

/**
 * Renders a crisp deterministic vector QR matrix for a digital token or facility check-in code.
 */
export const QrTicketSvg: React.FC<QrTicketSvgProps> = ({
  value,
  size = 96,
  className = '',
}) => {
  const grid = 21;

  let seed = 2166136261;
  for (let i = 0; i < value.length; i++) {
    seed ^= value.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }

  const isFinderCell = (r: number, c: number) => {
    const inTopLeft = r < 7 && c < 7;
    const inTopRight = r < 7 && c >= grid - 7;
    const inBottomLeft = r >= grid - 7 && c < 7;
    return inTopLeft || inTopRight || inBottomLeft;
  };

  const finderFilled = (r: number, c: number) => {
    const lr = r >= grid - 7 ? r - (grid - 7) : r;
    const lc = c >= grid - 7 ? c - (grid - 7) : c;
    if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true;
    if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true;
    return false;
  };

  const isSeparator = (r: number, c: number) => {
    const nearTL = (r === 7 && c <= 7) || (c === 7 && r <= 7);
    const nearTR = (r === 7 && c >= grid - 8) || (c === grid - 8 && r <= 7);
    const nearBL = (r === grid - 8 && c <= 7) || (c === 7 && r >= grid - 8);
    return nearTL || nearTR || nearBL;
  };

  const cells: Array<{ r: number; c: number }> = [];
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      if (isFinderCell(r, c)) {
        if (finderFilled(r, c)) cells.push({ r, c });
      } else if (isSeparator(r, c)) {
        continue;
      } else if (r === 6 || c === 6) {
        if ((r + c) % 2 === 0) cells.push({ r, c });
      } else {
        const bit = ((seed >>> ((r * 7 + c * 13) % 24)) ^ (r * 31 + c * 17)) & 1;
        if (bit === 1) cells.push({ r, c });
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${grid + 2} ${grid + 2}`}
      className={className}
      role="img"
      aria-label={`QR verification code for ${value}`}
    >
      <rect x="0" y="0" width={grid + 2} height={grid + 2} rx="1" fill="#ffffff" />
      {cells.map(({ r, c }) => (
        <rect
          key={`${r}-${c}`}
          x={c + 1}
          y={r + 1}
          width="0.92"
          height="0.92"
          rx="0.08"
          fill="#1a1a1a"
        />
      ))}
    </svg>
  );
};
