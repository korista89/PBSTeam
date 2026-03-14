"use client";

import React from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from "recharts";

interface WeeklyData {
  week: string;
  count?: number;
  rate?: number;
  [key: string]: any;
}

interface Props {
  data: WeeklyData[];
  type?: "line" | "bar";
  dataKey?: string;
  title: string;
  color?: string;
  yLabel?: string;
}

export default function WeeklyAnalysisChart({ 
  data, 
  type = "line", 
  dataKey = "count", 
  title, 
  color = "#6366f1",
  yLabel = "건수"
}: Props) {
  if (!data || data.length === 0) {
    return (
      <div style={{ 
        height: "300px", display: "flex", alignItems: "center", 
        justifyContent: "center", background: "rgba(255,255,255,0.5)",
        borderRadius: "20px", border: "1px dashed #cbd5e1", color: "#64748b"
      }}>
        데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="chart-card" style={{
      background: "rgba(255, 255, 255, 0.7)",
      backdropFilter: "blur(10px)",
      padding: "24px",
      borderRadius: "24px",
      border: "1px solid rgba(255, 255, 255, 0.3)",
      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.05)",
      height: "100%",
      display: "flex",
      flexDirection: "column"
    }}>
      <h3 style={{ 
        margin: "0 0 20px 0", 
        fontSize: "1.1rem", 
        fontWeight: 800, 
        color: "#1e293b",
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }}>
        <span style={{ fontSize: "1.2rem" }}>📈</span> {title}
      </h3>
      
      <div style={{ flex: 1, minHeight: "250px" }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === "line" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis 
                dataKey="week" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: "#64748b", fontSize: 12 }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: "#64748b", fontSize: 12 }}
                label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 10 }}
              />
              <Tooltip 
                contentStyle={{ 
                  borderRadius: "12px", 
                  border: "none", 
                  boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                  padding: "10px"
                }}
              />
              <Line 
                type="monotone" 
                dataKey={dataKey} 
                stroke={color} 
                strokeWidth={4} 
                dot={{ r: 6, fill: color, strokeWidth: 2, stroke: "#fff" }}
                activeDot={{ r: 8, strokeWidth: 0 }}
                animationDuration={1500}
              />
            </LineChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis 
                dataKey="week" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: "#64748b", fontSize: 12 }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: "#64748b", fontSize: 12 }}
                label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 10 }}
              />
              <Tooltip 
                cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
                contentStyle={{ 
                  borderRadius: "12px", 
                  border: "none", 
                  boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                  padding: "10px"
                }}
              />
              <Bar 
                dataKey={dataKey} 
                fill={color} 
                radius={[6, 6, 0, 0]} 
                animationDuration={1500}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
