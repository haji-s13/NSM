"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApp } from "@/components/app-provider";
import { fmtTime, pace } from "@/lib/format";
import { RACES } from "@/lib/vdot";

/** Predicted race times from the VDOT. */
export function RaceTable() {
  const { model, settings } = useApp();
  if (!model) return null;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-meta uppercase">Distance</TableHead>
          <TableHead className="text-meta uppercase text-right">Time</TableHead>
          <TableHead className="text-meta uppercase text-right">Pace</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {RACES.map((r) => {
          const x = model.races[r.key];
          return (
            <TableRow key={r.key} className={x.isPB ? "font-black" : ""}>
              <TableCell>{r.label}{x.isPB && <span className="ml-2 text-meta uppercase text-signal">PB</span>}</TableCell>
              <TableCell className="num text-right">{fmtTime(x.time)}</TableCell>
              <TableCell className="num text-right">{pace(x.pace, settings.units)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
