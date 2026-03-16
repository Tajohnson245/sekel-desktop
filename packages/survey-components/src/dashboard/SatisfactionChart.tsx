"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { ToolSatisfaction } from "../types";

interface SatisfactionChartProps {
  data: ToolSatisfaction[];
}

export default function SatisfactionChart({ data }: SatisfactionChartProps) {
  const sorted = [...data].sort((a, b) => b.avg_satisfaction - a.avg_satisfaction);
  const formatted = sorted.map((d) => ({
    ...d,
    avg_satisfaction: Math.round(d.avg_satisfaction * 10) / 10,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={formatted} layout="vertical" margin={{ left: 16, right: 24, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF4" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 5]}
          ticks={[1, 2, 3, 4, 5]}
          tick={{ fontSize: 12, fill: "#8B93A8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="tool_name"
          width={110}
          tick={{ fontSize: 12, fill: "#4A5270" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: "1px solid #E8ECF4", fontSize: 13 }}
          cursor={{ fill: "rgba(43,191,164,0.06)" }}
          formatter={(v: number) => [`${v} / 5`, "Avg. Satisfaction"]}
        />
        <ReferenceLine x={3} stroke="#BEC5D4" strokeDasharray="4 4" />
        <Bar dataKey="avg_satisfaction" name="Avg. Satisfaction" fill="#7C6EF5" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
