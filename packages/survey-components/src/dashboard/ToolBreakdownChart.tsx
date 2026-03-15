"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ToolCount } from "../types";

interface ToolBreakdownChartProps {
  data: ToolCount[];
}

export default function ToolBreakdownChart({ data }: ToolBreakdownChartProps) {
  const sorted = [...data].sort((a, b) => b.count - a.count);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={sorted} layout="vertical" margin={{ left: 16, right: 24, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF4" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 12, fill: "#8B93A8" }} axisLine={false} tickLine={false} />
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
        />
        <Bar dataKey="count" name="Respondents" fill="#2BBFA4" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
