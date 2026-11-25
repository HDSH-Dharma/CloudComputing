"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatGrams, formatMoney } from "@/lib/format";
import type { DailySpendRow, ProjectSpendRow, SpoolInventoryRow } from "@/lib/types";

const AXIS = "#8b95a1";
const GRID = "#343b43";
const BRAND = "#ed7549";
const INDIGO = "#818cf8";
const EMERALD = "#34d399";
const tooltipStyle = { background: "#171c21", border: "1px solid #343b43", borderRadius: 12, fontSize: 12 };
const tick = { fill: AXIS, fontSize: 11 };

const shortDay = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};
const compact = (n: number) => new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const trim = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function ChartCard({ title, eyebrow, empty, children }: { title: string; eyebrow: string; empty: boolean; children: ReactNode }) {
  return (
    <article className="rounded-2xl border border-[#343b43] bg-[#232a32] p-5 shadow-[0_14px_40px_-28px_#000]">
      <p className="font-mono text-xs uppercase tracking-[.18em] text-slate-400">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold">{title}</h2>
      {empty ? (
        <div className="mt-5 grid h-56 place-items-center rounded-xl border border-dashed border-slate-600/70 p-6 text-center text-sm text-slate-400">
          Belum ada data. Selesaikan print job untuk mengisi grafik ini.
        </div>
      ) : (
        <div className="mt-5 h-64 w-full">{children}</div>
      )}
    </article>
  );
}

export function SpendPerDayChart({ rows, currency }: { rows: DailySpendRow[]; currency: string }) {
  const data = rows.map((r) => ({ day: r.day, Material: Number(r.material_cost ?? 0), Listrik: Number(r.energy_cost ?? 0) }));
  return (
    <ChartCard eyebrow="Pengeluaran" title="Biaya per hari" empty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDay} tick={tick} stroke={GRID} />
          <YAxis tickFormatter={compact} tick={tick} stroke={GRID} width={48} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => String(l)} formatter={(v) => formatMoney(Number(v), currency)} cursor={{ fill: "#ffffff0d" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Material" stackId="cost" fill={BRAND} />
          <Bar dataKey="Listrik" stackId="cost" fill={INDIGO} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function EstimatedVsActualChart({ rows }: { rows: DailySpendRow[] }) {
  const data = rows.map((r) => ({ day: r.day, Estimasi: Number(r.est_g ?? 0), Aktual: r.actual_g == null ? null : Number(r.actual_g) }));
  return (
    <ChartCard eyebrow="Konsumsi filamen" title="Estimasi vs aktual per hari" empty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDay} tick={tick} stroke={GRID} />
          <YAxis tickFormatter={(v) => `${v} g`} tick={tick} stroke={GRID} width={52} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => (v == null ? "belum ditimbang" : formatGrams(Number(v)))} cursor={{ fill: "#ffffff0d" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Estimasi" fill={INDIGO} radius={[4, 4, 0, 0]} />
          <Bar dataKey="Aktual" fill={EMERALD} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function SpendPerProjectChart({ rows, currency }: { rows: ProjectSpendRow[]; currency: string }) {
  const data = rows.map((r) => ({ project: r.project, Total: Number(r.total_cost ?? 0), jobs: r.jobs }));
  return (
    <ChartCard eyebrow="Pengeluaran" title="Biaya per proyek" empty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tickFormatter={compact} tick={tick} stroke={GRID} />
          <YAxis type="category" dataKey="project" tickFormatter={(v) => trim(String(v))} tick={tick} stroke={GRID} width={110} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatMoney(Number(v), currency)} cursor={{ fill: "#ffffff0d" }} />
          <Bar dataKey="Total" fill={BRAND} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function SpoolStockChart({ spools }: { spools: SpoolInventoryRow[] }) {
  const data = spools.map((s) => ({
    label: s.name || [s.brand, s.color_name].filter(Boolean).join(" ") || s.material,
    Sisa: Number(s.remaining_weight_g ?? 0),
    color: s.color_hex ?? BRAND,
  }));
  return (
    <ChartCard eyebrow="Inventaris" title="Sisa filamen per spool" empty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tickFormatter={(v) => `${v} g`} tick={tick} stroke={GRID} />
          <YAxis type="category" dataKey="label" tickFormatter={(v) => trim(String(v))} tick={tick} stroke={GRID} width={110} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatGrams(Number(v))} cursor={{ fill: "#ffffff0d" }} />
          <Bar dataKey="Sisa" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
