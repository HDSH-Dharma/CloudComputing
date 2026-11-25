"use client";

import { useMemo, useState } from "react";
import { computeCost } from "@filamentiq/shared/ledger";
import { formatGrams, formatMoney, formatNumber } from "@/lib/format";
import { Field, inputClass } from "@/components/ui";

export type CalcSpool = { id: string; label: string; price: number; initialNetWeightG: number; currency: string };
export type CalcPrinter = { id: string; label: string; powerW: number };
export type CalcGcode = { id: string; label: string; grams: number | null; durationS: number | null };

const toNum = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function CostCalculator({ spools, printers, gcodes, electricityRate, currency }: { spools: CalcSpool[]; printers: CalcPrinter[]; gcodes: CalcGcode[]; electricityRate: number; currency: string }) {
  const [spoolId, setSpoolId] = useState(spools[0]?.id ?? "");
  const [printerId, setPrinterId] = useState(printers[0]?.id ?? "");
  const [grams, setGrams] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [rate, setRate] = useState(String(electricityRate));

  const spool = spools.find((s) => s.id === spoolId);
  const printer = printers.find((p) => p.id === printerId);
  const durationS = Math.round(toNum(hours) * 3600 + toNum(minutes) * 60);
  const gramsNum = toNum(grams);

  const result = useMemo(
    () =>
      spool
        ? computeCost({
            grams: gramsNum,
            spoolPrice: spool.price,
            spoolInitialNetWeightG: spool.initialNetWeightG,
            durationS,
            printerPowerW: printer?.powerW ?? 0,
            electricityRatePerKwh: toNum(rate),
          })
        : null,
    [spool, printer, gramsNum, durationS, rate],
  );
  const cur = spool?.currency ?? currency;

  function loadGcode(id: string) {
    const g = gcodes.find((x) => x.id === id);
    if (!g) return;
    if (g.grams != null) setGrams(String(Math.round(g.grams * 10) / 10));
    if (g.durationS != null) {
      setHours(String(Math.floor(g.durationS / 3600)));
      setMinutes(String(Math.round((g.durationS % 3600) / 60)));
    }
  }

  return (
    <article className="rounded-2xl border border-[#343b43] bg-[#232a32] p-5 shadow-[0_14px_40px_-28px_#000]">
      <p className="font-mono text-xs uppercase tracking-[.18em] text-slate-400">Simulasi</p>
      <h2 className="mt-2 text-xl font-semibold">Kalkulator biaya</h2>
      {spools.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-600/70 p-6 text-sm text-slate-400">Tambahkan spool terlebih dahulu untuk menghitung biaya material.</p>
      ) : (
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {gcodes.length > 0 && (
              <Field label="Isi dari file G-code (opsional)" htmlFor="calc-gcode">
                <select id="calc-gcode" defaultValue="" onChange={(e) => loadGcode(e.target.value)} className={inputClass}>
                  <option value="">Pilih file…</option>
                  {gcodes.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </Field>
            )}
            <Field label="Spool" htmlFor="calc-spool">
              <select id="calc-spool" value={spoolId} onChange={(e) => setSpoolId(e.target.value)} className={inputClass}>
                {spools.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Printer" htmlFor="calc-printer" hint="Daya printer dipakai untuk menghitung listrik.">
              <select id="calc-printer" value={printerId} onChange={(e) => setPrinterId(e.target.value)} className={inputClass}>
                {printers.length === 0 && <option value="">Tanpa printer (listrik 0)</option>}
                {printers.map((p) => <option key={p.id} value={p.id}>{p.label} · {p.powerW} W</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Filamen (g)" htmlFor="calc-grams"><input id="calc-grams" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="0" className={inputClass} /></Field>
              <Field label="Jam" htmlFor="calc-hours"><input id="calc-hours" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" className={inputClass} /></Field>
              <Field label="Menit" htmlFor="calc-minutes"><input id="calc-minutes" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="0" className={inputClass} /></Field>
            </div>
            <Field label={`Tarif listrik (${cur}/kWh)`} htmlFor="calc-rate">
              <input id="calc-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <div aria-live="polite" className="flex flex-col justify-between rounded-xl border border-white/[.07] bg-[#171c21] p-5">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-slate-500">Total biaya</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{formatMoney(result?.totalCost ?? 0, cur)}</p>
            </div>
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-slate-400">Material ({formatGrams(result?.grams ?? 0)})</dt><dd>{formatMoney(result?.materialCost ?? 0, cur)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-400">Listrik ({formatNumber(result?.energyKwh ?? 0, "kWh", 3)})</dt><dd>{formatMoney(result?.energyCost ?? 0, cur)}</dd></div>
              <div className="flex justify-between gap-3 border-t border-white/[.07] pt-2"><dt className="text-slate-400">Harga per gram</dt><dd>{formatMoney(result?.pricePerGram ?? 0, cur)}</dd></div>
            </dl>
          </div>
        </div>
      )}
    </article>
  );
}
