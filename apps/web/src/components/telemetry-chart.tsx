"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TelemetryRow } from "@/lib/types";

const tick = { fill: "#8b95a1", fontSize: 11 };
const time = (t: number) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(t));
const n = (v: number | null) => (v == null ? null : Number(v));

export function TelemetryChart({ rows }: { rows: TelemetryRow[] }) {
  const data = rows.map((r) => ({
    t: Date.parse(r.captured_at),
    Nozzle: n(r.nozzle_temp_c),
    "Target nozzle": n(r.nozzle_target_c),
    Bed: n(r.bed_temp_c),
    "Target bed": n(r.bed_target_c),
  }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#343b43" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={time} tick={tick} stroke="#343b43" />
          <YAxis unit="°" tick={tick} stroke="#343b43" width={44} />
          <Tooltip
            contentStyle={{ background: "#171c21", border: "1px solid #343b43", borderRadius: 12, fontSize: 12 }}
            labelFormatter={(l) => time(Number(l))}
            formatter={(v) => (v == null ? "–" : `${Number(v).toFixed(1)} °C`)}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="Nozzle" stroke="#ed7549" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="Target nozzle" stroke="#ed7549" strokeWidth={1} strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="Bed" stroke="#818cf8" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="Target bed" stroke="#818cf8" strokeWidth={1} strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
