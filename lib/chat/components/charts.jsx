'use client';

import { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Color palettes
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = {
  emerald: { line: '#10b981', fill: 'rgba(16,185,129,0.15)', dot: '#059669' },
  blue:    { line: '#3b82f6', fill: 'rgba(59,130,246,0.15)', dot: '#2563eb' },
  amber:   { line: '#f59e0b', fill: 'rgba(245,158,11,0.15)', dot: '#d97706' },
  rose:    { line: '#f43f5e', fill: 'rgba(244,63,94,0.15)',  dot: '#e11d48' },
  purple:  { line: '#a855f7', fill: 'rgba(168,85,247,0.15)', dot: '#9333ea' },
};

const DONUT_PALETTE = ['#10b981', '#3b82f6', '#f43f5e', '#f59e0b', '#a855f7', '#6366f1', '#ec4899'];

// ─────────────────────────────────────────────────────────────────────────────
// AreaChart — SVG sparkline with filled area + hover tooltip
// ─────────────────────────────────────────────────────────────────────────────

export function AreaChart({ data = [], height = 80, color = 'emerald', formatValue }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
        No data
      </div>
    );
  }

  const c = COLORS[color] || COLORS.emerald;
  const pad = { top: 4, right: 4, bottom: 4, left: 4 };
  const w = 300;
  const h = height;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const points = values.map((v, i) => ({
    x: pad.left + (i / Math.max(data.length - 1, 1)) * plotW,
    y: pad.top + plotH - ((v - min) / range) * plotH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x},${pad.top + plotH} L${points[0].x},${pad.top + plotH} Z`;

  const fmt = formatValue || ((v) => v.toLocaleString());

  return (
    <div className="relative w-full" style={{ height }} onMouseLeave={() => setHoverIdx(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
        <path d={areaPath} fill={c.fill} />
        <path d={linePath} fill="none" stroke={c.line} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {hoverIdx !== null && points[hoverIdx] && (
          <circle cx={points[hoverIdx].x} cy={points[hoverIdx].y} r="4" fill={c.dot} stroke="var(--card)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* Invisible hit zones for hover */}
      <div className="absolute inset-0 flex">
        {data.map((d, i) => (
          <div
            key={i}
            className="flex-1"
            onMouseEnter={() => setHoverIdx(i)}
          />
        ))}
      </div>
      {/* Tooltip */}
      {hoverIdx !== null && data[hoverIdx] && (
        <div
          className="absolute pointer-events-none bg-popover text-popover-foreground border rounded-md px-2 py-1 text-xs shadow-md whitespace-nowrap"
          style={{
            left: `${(hoverIdx / Math.max(data.length - 1, 1)) * 100}%`,
            top: -4,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <span className="font-medium">{fmt(data[hoverIdx].value)}</span>
          {data[hoverIdx].label && (
            <span className="text-muted-foreground ml-1">{data[hoverIdx].label}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DonutChart — SVG donut with inline legend
// ─────────────────────────────────────────────────────────────────────────────

export function DonutChart({ data = [], size = 120, innerRadius = 0.6 }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  const total = data.reduce((s, d) => s + d.value, 0);
  if (!data.length || total === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height: size }}>
        No data
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 2;
  const innerR = outerR * innerRadius;

  let startAngle = -Math.PI / 2;
  const arcs = data.map((d, i) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;

    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const x3 = cx + innerR * Math.cos(endAngle);
    const y3 = cy + innerR * Math.sin(endAngle);
    const x4 = cx + innerR * Math.cos(startAngle);
    const y4 = cy + innerR * Math.sin(startAngle);

    const path = [
      `M${x1},${y1}`,
      `A${outerR},${outerR} 0 ${largeArc} 1 ${x2},${y2}`,
      `L${x3},${y3}`,
      `A${innerR},${innerR} 0 ${largeArc} 0 ${x4},${y4}`,
      'Z',
    ].join(' ');

    startAngle = endAngle;
    return { path, color: d.color || DONUT_PALETTE[i % DONUT_PALETTE.length], label: d.label, value: d.value, pct: ((d.value / total) * 100).toFixed(0) };
  });

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} onMouseLeave={() => setHoverIdx(null)}>
        {arcs.map((arc, i) => (
          <path
            key={i}
            d={arc.path}
            fill={arc.color}
            opacity={hoverIdx !== null && hoverIdx !== i ? 0.3 : 1}
            className="transition-opacity duration-150"
            onMouseEnter={() => setHoverIdx(i)}
          />
        ))}
        {/* Center label on hover */}
        {hoverIdx !== null && arcs[hoverIdx] && (
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="fill-foreground text-xs font-semibold" style={{ fontSize: 12 }}>
            {arcs[hoverIdx].pct}%
          </text>
        )}
      </svg>
      <div className="flex flex-col gap-1.5 min-w-0">
        {arcs.map((arc, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-xs cursor-default"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: arc.color }} />
            <span className="truncate text-muted-foreground">{arc.label}</span>
            <span className="font-medium ml-auto">{arc.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BarChart — div-based bar chart with color variants + hover values
// ─────────────────────────────────────────────────────────────────────────────

const BAR_COLORS = {
  emerald: { bg: 'bg-emerald-500/20', hover: 'hover:bg-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400' },
  blue:    { bg: 'bg-blue-500/20', hover: 'hover:bg-blue-500/30', text: 'text-blue-600 dark:text-blue-400' },
  amber:   { bg: 'bg-amber-500/20', hover: 'hover:bg-amber-500/30', text: 'text-amber-600 dark:text-amber-400' },
  rose:    { bg: 'bg-rose-500/20', hover: 'hover:bg-rose-500/30', text: 'text-rose-600 dark:text-rose-400' },
  purple:  { bg: 'bg-purple-500/20', hover: 'hover:bg-purple-500/30', text: 'text-purple-600 dark:text-purple-400' },
};

export function BarChart({ data = [], height = 128, color = 'emerald', formatValue, label }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!data.length) {
    return <p className="text-sm text-muted-foreground">No data</p>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const bc = BAR_COLORS[color] || BAR_COLORS.emerald;
  const fmt = formatValue || ((v) => v.toLocaleString());

  return (
    <div className="flex flex-col gap-1" onMouseLeave={() => setHoverIdx(null)}>
      {label && <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>}
      <div className="flex items-end gap-1" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" onMouseEnter={() => setHoverIdx(i)}>
            {hoverIdx === i && (
              <span className={`text-[9px] font-medium ${bc.text} whitespace-nowrap`}>{fmt(d.value)}</span>
            )}
            <div
              className={`w-full ${bc.bg} ${bc.hover} rounded-t transition-all`}
              style={{ height: `${Math.max((d.value / max) * 100, 2)}%` }}
            />
            <span className="text-[9px] text-muted-foreground truncate max-w-full">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TokenBreakdownBars — stacked horizontal bars (prompt vs completion)
// ─────────────────────────────────────────────────────────────────────────────

export function TokenBreakdownBars({ data = [] }) {
  if (!data.length) {
    return <p className="text-sm text-muted-foreground">No data</p>;
  }

  const maxTotal = Math.max(...data.map((d) => Number(d.promptTokens) + Number(d.completionTokens)), 1);

  return (
    <div className="flex flex-col gap-2">
      {data.map((d, i) => {
        const prompt = Number(d.promptTokens);
        const completion = Number(d.completionTokens);
        const total = prompt + completion;
        const promptPct = (prompt / maxTotal) * 100;
        const compPct = (completion / maxTotal) * 100;
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-12 shrink-0 text-right">{d.day?.slice(5)}</span>
            <div className="flex-1 flex h-4 rounded overflow-hidden bg-muted/30">
              {promptPct > 0 && (
                <div
                  className="bg-blue-500/40 transition-all"
                  style={{ width: `${promptPct}%` }}
                  title={`Prompt: ${prompt.toLocaleString()}`}
                />
              )}
              {compPct > 0 && (
                <div
                  className="bg-emerald-500/40 transition-all"
                  style={{ width: `${compPct}%` }}
                  title={`Completion: ${completion.toLocaleString()}`}
                />
              )}
            </div>
            <span className="text-[10px] text-muted-foreground w-14 shrink-0">
              {total >= 1000 ? `${(total / 1000).toFixed(1)}K` : total}
            </span>
          </div>
        );
      })}
      <div className="flex gap-4 mt-1">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/40" /> Prompt
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40" /> Completion
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SourceBreakdownBars — horizontal percentage bars for source distribution
// ─────────────────────────────────────────────────────────────────────────────

const SOURCE_COLORS = {
  chat: 'bg-blue-500/50',
  channel: 'bg-emerald-500/50',
  summary: 'bg-amber-500/50',
  cron: 'bg-purple-500/50',
  api: 'bg-rose-500/50',
};

export function SourceBreakdownBars({ data = [] }) {
  if (!data.length) {
    return <p className="text-sm text-muted-foreground">No data</p>;
  }

  const totalReqs = data.reduce((s, d) => s + Number(d.requests), 0) || 1;

  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d, i) => {
        const pct = ((Number(d.requests) / totalReqs) * 100).toFixed(0);
        const colorCls = SOURCE_COLORS[d.source] || 'bg-gray-500/50';
        return (
          <div key={i}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground capitalize">{d.source || 'unknown'}</span>
              <span className="font-medium">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
              <div className={`h-full rounded-full ${colorCls} transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
