"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { YearCount } from "../types";

const COLORS = [
  "#2BBFA4","#7C6EF5","#F0A500","#E05C6A",
  "#4A5270","#8B93A8","#BEC5D4","#249E88",
  "#5A52D9","#D4890A","#C04155","#2E3555",
];

interface YearDistributionChartProps {
  data: YearCount[];
}

export default function YearDistributionChart({ data }: YearDistributionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="year"
          cx="50%"
          cy="50%"
          outerRadius={90}
          innerRadius={45}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ borderRadius: 8, border: "1px solid #E8ECF4", fontSize: 13 }}
          formatter={(v: number, name: string) => [v, name]}
        />
        <Legend
          iconType="circle"
          iconSize={10}
          formatter={(value) => <span style={{ fontSize: 12, color: "#4A5270" }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
