import { QrCodeDataType, encode } from "uqr";

/**
 * A link as a QR code, one SVG in `currentColor`: a dot for each dark module and rounded eyes for the finder and
 * alignment marks. Error correction is M or better (raised when the code's size has room) so the dots still scan.
 * It has no quiet zone of its own: set it on a light tile at least two modules wide.
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, data, types } = encode(value, { ecc: "M", boostEcc: true, border: 0 });
  const light = (x: number, y: number) => types[y][x] === QrCodeDataType.Alignment && !data[y][x];
  const eyes = [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ];
  const marks: number[][] = [];
  let dots = "";
  for (let y = 0; y < size; y++) {
    let last = -1;
    for (let x = 0; x < size; x++) {
      const type = types[y][x];
      if (type === QrCodeDataType.Alignment && data[y][x] && light(x - 1, y) && light(x, y - 1)) marks.push([x, y]);
      if (!data[y][x] || type === QrCodeDataType.Position || type === QrCodeDataType.Alignment) continue;
      dots += last < 0 ? `M${x + 0.5} ${y + 0.5}h0` : `m${x - last} 0h0`;
      last = x;
    }
  }
  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <path d={dots} fill="none" stroke="currentColor" strokeWidth={0.86} strokeLinecap="round" />
      {eyes.map(([x, y]) => (
        <g key={`${x}.${y}`} fill="currentColor">
          <rect x={x - 2.5} y={y - 2.5} width={6} height={6} rx={1.75} fill="none" stroke="currentColor" />
          <rect x={x - 1} y={y - 1} width={3} height={3} rx={0.9} />
        </g>
      ))}
      {marks.map(([x, y]) => (
        <g key={`${x}.${y}`} fill="currentColor">
          <rect x={x - 1.5} y={y - 1.5} width={4} height={4} rx={1.1} fill="none" stroke="currentColor" />
          <circle cx={x + 0.5} cy={y + 0.5} r={0.55} />
        </g>
      ))}
    </svg>
  );
}
